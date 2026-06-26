import { prisma } from "@/db";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { logRateLimitHit } from "@/auditLog";

export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per window
export const AUTH_MAX_REQUESTS = 10; // 10 requests per window for auth endpoints

export class RateLimitError extends Error {
  constructor() {
    super("Too many requests. Please try again later.");
    this.name = "RateLimitError";
  }
}

// Resolves the client IP from request headers using a trusted-header priority chain.
// Vercel sets x-vercel-forwarded-for which cannot be spoofed by the client.
// x-forwarded-for and x-real-ip are only used as fallbacks (e.g. local dev, nginx).
async function getIpIdentifier(): Promise<string> {
  const headersList = await headers();

  // Priority: platform-verified header first, then standard proxy headers
  const ip =
    headersList.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;

  if (!ip) {
    return "anonymous";
  }
  return `ip:${ip}`;
}

async function getIdentifier(): Promise<string> {
  // Prefer user-based rate limiting for authenticated users
  const session = await auth();
  if (session?.user?.id) {
    return `user:${session.user.id}`;
  }

  return getIpIdentifier();
}

async function checkRateLimit(
  identifier: string,
  action: string,
  maxRequests: number,
): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

  // Atomic rate limit check using raw SQL to prevent TOCTOU race conditions.
  // A single upsert+conditional increment ensures two concurrent requests
  // cannot both read the same count and both pass the limit check.
  const result: { count: number }[] = await prisma.$queryRaw`
    INSERT INTO "RateLimit" (id, identifier, action, count, "windowStart")
    VALUES (gen_random_uuid(), ${identifier}, ${action}, 1, ${now})
    ON CONFLICT (identifier, action) DO UPDATE SET
      count = CASE
        WHEN "RateLimit"."windowStart" <= ${windowStart} THEN 1
        ELSE "RateLimit".count + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" <= ${windowStart} THEN ${now}
        ELSE "RateLimit"."windowStart"
      END
    RETURNING count
  `;

  const count = result[0]?.count ?? 1;
  if (count > maxRequests) {
    await logRateLimitHit(action, identifier);
    throw new RateLimitError();
  }
}

export async function rateLimit(action: string): Promise<void> {
  const identifier = await getIdentifier();
  await checkRateLimit(identifier, action, MAX_REQUESTS_PER_WINDOW);
}

export async function rateLimitAuth(action: string): Promise<void> {
  const identifier = await getIpIdentifier();
  await checkRateLimit(identifier, `auth:${action}`, AUTH_MAX_REQUESTS);
}

export async function cleanupExpiredRateLimits(): Promise<number> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const result = await prisma.rateLimit.deleteMany({
    where: { windowStart: { lt: windowStart } },
  });
  return result.count;
}
