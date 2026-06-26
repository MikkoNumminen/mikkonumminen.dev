import { requirePermission, type PermissionKey } from "@/permissions";
import { rateLimit } from "@/rateLimit";
import { getTranslations } from "next-intl/server";
import { safe, type ActionResult } from "@/lib/actionUtils";
import { withSpan, actionCounter, actionDuration, errorCounter } from "@/lib/tracing";

type Translations = Awaited<ReturnType<typeof getTranslations<"errors">>>;

/**
 * Wraps a server action with the standard auth/rate-limit boilerplate.
 *
 * Every action in the server layer begins with the same three steps:
 *   1. safe() — catches errors and normalises them into ActionResult
 *   2. requirePermission() — throws ActionError("permissionDenied") if unauthorised
 *   3. rateLimit() — throws RateLimitError when the caller exceeds the limit
 *
 * guardedAction collapses all three into one call so individual actions only
 * contain domain logic. Each invocation is traced via OpenTelemetry.
 *
 * Usage:
 *   export const createFoo = guardedAction(
 *     "foo:create",
 *     "createFoo",
 *     async (t, data: FormData) => {
 *       // t is the "errors" translation function
 *       const name = data.get("name")?.toString();
 *       if (!name) throw new ActionError("invalidName", t("invalidName"));
 *       // ...
 *     },
 *   );
 */
export function guardedAction<TArgs extends unknown[]>(
  permission: PermissionKey,
  rateLimitKey: string,
  fn: (t: Translations, ...args: TArgs) => Promise<void>,
): (...args: TArgs) => Promise<ActionResult> {
  return (...args: TArgs): Promise<ActionResult> => {
    return safe(async () => {
      const start = performance.now();
      await withSpan(
        `action.${rateLimitKey}`,
        {
          "hrm.action.name": rateLimitKey,
          "hrm.action.permission": permission,
        },
        async (span) => {
          const t = await getTranslations("errors");
          span.addEvent("auth.start");
          await requirePermission(permission);
          span.addEvent("auth.done");
          await rateLimit(rateLimitKey);
          span.addEvent("rateLimit.done");
          await fn(t, ...args);
          span.addEvent("action.done");
        },
      );
      const durationMs = performance.now() - start;
      actionCounter().add(1, { action: rateLimitKey, status: "success" });
      actionDuration().record(durationMs, { action: rateLimitKey });
    }).then((result) => {
      if (result?.error) {
        actionCounter().add(1, { action: rateLimitKey, status: "error" });
        errorCounter().add(1, { action: rateLimitKey, code: result.code });
      }
      return result;
    });
  };
}
