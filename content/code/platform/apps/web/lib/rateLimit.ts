import { prisma } from "./db";
import { RateLimitError } from "./actionErrors";
import { auth } from "@/auth";
import { headers } from "next/headers";

const RATE_LIMIT_WINDOW_MS = 60_000; // 60 seconds

async function getClientIp(): Promise<string> {
  const headerList = await headers();
  // Vercel's header cannot be spoofed
  const vercelIp = headerList.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0].trim();

  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = headerList.get("x-real-ip");
  if (realIp) return realIp;

  return "anonymous";
}

export async function rateLimit(action: string, maxRequests = 30): Promise<void> {
  const session = await auth();
  const identifier = session?.user?.id ?? `ip:${await getClientIp()}`;
  await checkRateLimit(identifier, action, maxRequests);
}

async function checkRateLimit(
  identifier: string,
  action: string,
  maxRequests: number,
): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  const id = `${identifier}:${action}`;

  const result = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" (id, identifier, action, count, "windowStart")
    VALUES (${id}, ${identifier}, ${action}, 1, ${now})
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

  const count = result[0]?.count ?? 0;
  if (count > maxRequests) {
    throw new RateLimitError(`Rate limit exceeded for ${action}`);
  }
}
