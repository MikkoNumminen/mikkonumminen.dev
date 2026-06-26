"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getTenantFilter } from "@/lib/tenant";
import {
  getLevelForXp,
  type XpSource,
  XP_AMOUNTS,
  DAILY_SHOUT_XP_CAP,
  DAILY_DM_XP_CAP,
} from "./xp-config";

export interface XpAwardResult {
  xpAwarded: number;
  totalXp: number;
  level: number;
  previousLevel: number;
  leveledUp: boolean;
}

async function applyXp(
  userId: string,
  amount: number,
  source: string,
  sourceId?: string,
): Promise<XpAwardResult> {
  const { tenant, sessionId } = await getTenantFilter();
  await prisma.xpTransaction.create({
    data: { userId, amount, source, sourceId, tenant, sessionId },
  });

  const userLevel = await prisma.userLevel.upsert({
    where: { userId },
    create: { userId, totalXp: amount, level: getLevelForXp(amount).level, tenant, sessionId },
    update: { totalXp: { increment: amount } },
  });

  const newTotalXp = userLevel.totalXp;
  const previousLevel = userLevel.level;
  const newLevel = getLevelForXp(newTotalXp).level;

  if (newLevel !== previousLevel) {
    await prisma.userLevel.update({ where: { userId }, data: { level: newLevel } });
  }

  revalidateTag("leaderboard");

  return {
    xpAwarded: amount,
    totalXp: newTotalXp,
    level: newLevel,
    previousLevel,
    leveledUp: newLevel > previousLevel,
  };
}

export async function awardXp(
  userId: string,
  source: XpSource,
  sourceId?: string,
): Promise<XpAwardResult | null> {
  const amount = XP_AMOUNTS[source];
  if (amount <= 0) return null;

  if (source === "shout:create") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { tenant: shoutTenant, sessionId: shoutSessionId } = await getTenantFilter();
    const todayShoutXp = await prisma.xpTransaction.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        source: "shout:create",
        createdAt: { gte: todayStart },
        tenant: shoutTenant,
        sessionId: shoutSessionId,
      },
    });
    if ((todayShoutXp._sum.amount ?? 0) >= DAILY_SHOUT_XP_CAP) return null;
  }

  if (source === "dm:send") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { tenant: dmTenant, sessionId: dmSessionId } = await getTenantFilter();
    const todayDmXp = await prisma.xpTransaction.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        source: "dm:send",
        createdAt: { gte: todayStart },
        tenant: dmTenant,
        sessionId: dmSessionId,
      },
    });
    if ((todayDmXp._sum.amount ?? 0) >= DAILY_DM_XP_CAP) return null;
  }

  return applyXp(userId, amount, source, sourceId);
}

/**
 * Award a custom XP amount (for custom quests with configurable rewards).
 */
export async function awardCustomXp(
  userId: string,
  amount: number,
  source: string,
  sourceId?: string,
): Promise<XpAwardResult | null> {
  if (amount <= 0) return null;
  return applyXp(userId, amount, source, sourceId);
}

export async function getUserXpData(userId: string) {
  try {
    const { tenant, sessionId } = await getTenantFilter();
    const userLevel = await prisma.userLevel.findFirst({ where: { userId, tenant, sessionId } });
    return { totalXp: userLevel?.totalXp ?? 0, level: userLevel?.level ?? 1 };
  } catch (error) {
    console.error("[xp] getUserXpData failed:", error);
    return { totalXp: 0, level: 1 };
  }
}

const fetchLeaderboard = unstable_cache(
  async (tenant: string, sessionId: string | null, limit: number) => {
    try {
      const entries = await prisma.userLevel.findMany({
        where: { tenant, sessionId, user: { deletedAt: null } },
        orderBy: { totalXp: "desc" },
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              alias: true,
              name: true,
              image: true,
              avatarUrl: true,
              role: true,
            },
          },
        },
      });
      return entries.map((e, index) => ({
        rank: index + 1,
        userId: e.userId,
        alias: e.user.alias,
        name: e.user.name,
        image: e.user.avatarUrl ?? e.user.image,
        role: e.user.role,
        totalXp: e.totalXp,
        level: e.level,
      }));
    } catch (error) {
      console.error("[xp] getLeaderboard failed:", error);
      return [];
    }
  },
  ["leaderboard"],
  { revalidate: 60, tags: ["leaderboard"] },
);

export async function getLeaderboard(limit = 20) {
  const { tenant, sessionId } = await getTenantFilter();
  return fetchLeaderboard(tenant, sessionId, limit);
}

export async function getRecentXpTransactions(userId: string, limit = 20) {
  const { tenant, sessionId } = await getTenantFilter();
  return prisma.xpTransaction.findMany({
    where: { userId, tenant, sessionId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
