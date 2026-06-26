import { auth } from "@/auth";
import type { Session } from "next-auth";
import { ActionError } from "./actionErrors";
import { safe, type ActionResult } from "./actionUtils";
import { rateLimit } from "./rateLimit";
import type { PermissionKey } from "./permissions";

export function guardedAction<TArgs extends unknown[]>(
  permission: PermissionKey,
  rateLimitKey: string,
  fn: (session: Session, ...args: TArgs) => Promise<void>,
): (...args: TArgs) => Promise<ActionResult> {
  return async (...args: TArgs): Promise<ActionResult> => {
    return safe(async () => {
      // 1. Auth check
      const session = await auth();
      if (!session?.user) {
        throw new ActionError("permissionDenied", "Not authenticated");
      }

      // 2. Permission check
      const permissions = session.user.permissions as Record<string, boolean> | undefined;
      if (!permissions?.[permission]) {
        throw new ActionError("permissionDenied", `Missing permission: ${permission}`);
      }

      // 3. Rate limit check
      await rateLimit(rateLimitKey);

      // 4. Execute the action with verified session
      await fn(session, ...args);
    });
  };
}
