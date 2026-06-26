"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  DEMO_USERS,
  DEMO_BOARDS,
  DEMO_POSTS,
  DEMO_THREADS,
  DEMO_SHOUTS,
  DEMO_EVENTS,
  DEMO_ISSUES,
  DEMO_SURVEY_RESPONSES,
  DEMO_XP_PROFILES,
  DEMO_CUSTOM_QUESTS,
  DEMO_ACHIEVEMENT_UNLOCKS,
  DEMO_QUEST_PROGRESS,
  DEMO_SURVEY_ROUND,
  DEMO_DM_CONVERSATIONS,
} from "./demo-seeds";

// DEMO_EMAIL moved to demo-constants.ts (can't export constants from "use server" files)
const DEMO_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function getDemoSessionId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.demoSessionId ?? null;
}

export async function seedDemoData(sessionId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const userMap = new Map<number, string>();

    for (let i = 0; i < DEMO_USERS.length; i++) {
      const seed = DEMO_USERS[i];
      const user = await tx.user.create({
        data: {
          email: `${seed.email}-${sessionId.slice(0, 8)}`,
          name: seed.name,
          alias: `${seed.alias}_${sessionId.slice(0, 6)}`,
          role: seed.role,
          wantsToDevelop: seed.wantsToDevelop,
          developerTag: seed.developerTag,
          developmentSkills: [...seed.developmentSkills],
          hasSeenPromotion: true,
          tenant: "vuohiliitto",
          sessionId,
        },
      });
      userMap.set(i, user.id);
    }

    const boardMap = new Map<number, string>();
    for (let i = 0; i < DEMO_BOARDS.length; i++) {
      const seed = DEMO_BOARDS[i];
      const board = await tx.board.create({
        data: {
          name: seed.name,
          slug: `${seed.slug}-${sessionId.slice(0, 8)}`,
          description: seed.description,
          sortOrder: i,
          tenant: "vuohiliitto",
          sessionId,
        },
      });
      boardMap.set(i, board.id);
    }

    const postMap = new Map<number, string>();
    for (let i = 0; i < DEMO_POSTS.length; i++) {
      const seed = DEMO_POSTS[i];
      const post = await tx.post.create({
        data: {
          title: seed.title,
          slug: `${seed.slug}-${sessionId.slice(0, 8)}`,
          body: seed.body,
          pinned: seed.pinned,
          authorId: userMap.get(seed.authorIndex)!,
          boardId: boardMap.get(seed.boardIndex)!,
          tenant: "vuohiliitto",
          sessionId,
        },
      });
      postMap.set(i, post.id);
    }

    const threadMap = new Map<number, string>();
    for (let i = 0; i < DEMO_THREADS.length; i++) {
      const seed = DEMO_THREADS[i];
      const thread = await tx.thread.create({
        data: {
          body: seed.body,
          parentType: "POST",
          parentId: postMap.get(seed.postIndex)!,
          authorId: userMap.get(seed.authorIndex)!,
          replyToId: seed.replyToIndex !== null ? (threadMap.get(seed.replyToIndex) ?? null) : null,
          tenant: "vuohiliitto",
          sessionId,
        },
      });
      threadMap.set(i, thread.id);
    }

    for (const seed of DEMO_SHOUTS) {
      await tx.shout.create({
        data: {
          message: seed.message,
          authorId: userMap.get(seed.authorIndex)!,
          tenant: "vuohiliitto",
          sessionId,
        },
      });
    }

    const now = new Date();
    for (const seed of DEMO_EVENTS) {
      const startTime = new Date(now);
      startTime.setDate(startTime.getDate() + seed.daysFromNow);
      startTime.setHours(10, 0, 0, 0);

      const endTime = new Date(startTime);
      if (seed.allDay) {
        endTime.setHours(23, 59, 0, 0);
      } else {
        endTime.setHours(10 + seed.durationHours, 0, 0, 0);
      }

      await tx.calendarEvent.create({
        data: {
          title: seed.title,
          description: seed.description,
          location: seed.location,
          startTime,
          endTime,
          allDay: seed.allDay,
          authorId: userMap.get(seed.authorIndex)!,
          tenant: "vuohiliitto",
          sessionId,
        },
      });
    }

    for (const seed of DEMO_ISSUES) {
      await tx.issueReport.create({
        data: {
          title: seed.title,
          description: seed.description,
          url: seed.url,
          authorId: userMap.get(seed.authorIndex)!,
          resolvedAt: seed.resolved ? new Date() : null,
          tenant: "vuohiliitto",
          sessionId,
        },
      });
    }

    for (const seed of DEMO_SURVEY_RESPONSES) {
      await tx.surveyResponse.create({
        data: {
          conversationStyle: seed.conversationStyle,
          features: [...seed.features],
          mustHave: seed.mustHave,
          dealbreaker: seed.dealbreaker,
          otherFeedback: seed.otherFeedback,
          wantsToDevelop: seed.wantsToDevelop,
          developmentSkills: [...seed.developmentSkills],
          userId: seed.authorIndex !== null ? (userMap.get(seed.authorIndex) ?? null) : null,
          tenant: "vuohiliitto",
          sessionId,
        },
      });
    }

    for (const seed of DEMO_XP_PROFILES) {
      const userId = userMap.get(seed.userIndex)!;

      await tx.userLevel.create({
        data: {
          userId,
          totalXp: seed.totalXp,
          level: seed.level,
          tenant: "vuohiliitto",
          sessionId,
        },
      });

      await tx.xpTransaction.create({
        data: {
          userId,
          amount: seed.totalXp,
          source: "demo:seed",
          tenant: "vuohiliitto",
          sessionId,
        },
      });

      await tx.loginStreak.create({
        data: {
          userId,
          currentStreak: seed.level,
          longestStreak: seed.level * 2,
          lastLoginDate: new Date(),
          tenant: "vuohiliitto",
          sessionId,
        },
      });
    }

    // Seed custom quests
    for (const seed of DEMO_CUSTOM_QUESTS) {
      await tx.quest.create({
        data: {
          name: seed.title,
          description: seed.description,
          xpReward: seed.xpReward,
          type: "assigned",
          status: seed.status,
          priority: seed.priority,
          assigneeId: userMap.get(seed.assigneeIndex)!,
          creatorId: userMap.get(seed.creatorIndex)!,
          completedAt: seed.completed ? new Date() : null,
          tenant: "vuohiliitto",
          sessionId,
        },
      });
    }

    // Seed achievement unlocks
    for (const seed of DEMO_ACHIEVEMENT_UNLOCKS) {
      const userId = userMap.get(seed.userIndex)!;
      for (const key of seed.achievementKeys) {
        const achievement = await tx.achievement.findUnique({ where: { key } });
        if (achievement) {
          await tx.userAchievement.create({
            data: { userId, achievementId: achievement.id, tenant: "vuohiliitto", sessionId },
          });
        }
      }
    }

    // Seed quest progress
    for (const seed of DEMO_QUEST_PROGRESS) {
      const userId = userMap.get(seed.userIndex)!;
      const quest = await tx.quest.findUnique({ where: { key: seed.questKey } });
      if (quest) {
        await tx.userQuestProgress.create({
          data: {
            userId,
            questId: quest.id,
            progress: seed.progress,
            completed: seed.completed,
            completedAt: seed.completed ? new Date() : null,
            tenant: "vuohiliitto",
            sessionId,
          },
        });
      }
    }

    // Seed DM conversations
    for (const seed of DEMO_DM_CONVERSATIONS) {
      const aId = userMap.get(seed.participantAIndex)!;
      const bId = userMap.get(seed.participantBIndex)!;
      const [participantA, participantB] = aId < bId ? [aId, bId] : [bId, aId];

      const conversation = await tx.conversation.create({
        data: {
          participantA,
          participantB,
          tenant: "vuohiliitto",
          sessionId,
          lastMessageAt: new Date(),
        },
      });

      for (const msg of seed.messages) {
        await tx.directMessage.create({
          data: {
            conversationId: conversation.id,
            senderId: userMap.get(msg.senderIndex)!,
            message: msg.message,
            tenant: "vuohiliitto",
            sessionId,
          },
        });
      }
    }

    // Seed survey round — use unique number to avoid collision with real rounds
    const maxRound = await tx.surveyRound.aggregate({ _max: { number: true } });
    const demoRoundNumber = (maxRound._max.number ?? 0) + 1000 + Math.floor(Math.random() * 9000);
    const surveyRound = await tx.surveyRound.create({
      data: {
        number: demoRoundNumber,
        title: DEMO_SURVEY_ROUND.title,
        description: DEMO_SURVEY_ROUND.description,
        status: DEMO_SURVEY_ROUND.status,
        xpReward: DEMO_SURVEY_ROUND.xpReward,
        creatorId: userMap.get(DEMO_SURVEY_ROUND.creatorIndex)!,
        tenant: "vuohiliitto",
        sessionId,
      },
    });

    // Link some survey responses to the round
    // (first 3 responses belong to the active round)
    const responsesWithRound = await tx.surveyResponse.findMany({
      where: { sessionId },
      take: 3,
      orderBy: { submittedAt: "asc" },
    });
    for (const r of responsesWithRound) {
      await tx.surveyResponse.update({
        where: { id: r.id },
        data: { roundId: surveyRound.id },
      });
    }
  });
}

export async function cleanupStaleDemoSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - DEMO_SESSION_MAX_AGE_MS);

  const staleSessions = await prisma.demoSession.findMany({
    where: { lastActiveAt: { lt: cutoff } },
    select: { id: true },
  });

  if (staleSessions.length === 0) return 0;

  for (const session of staleSessions) {
    const sid = session.id;

    const demoUsers = await prisma.user.findMany({
      where: { sessionId: sid },
      select: { id: true },
    });
    const demoUserIds = demoUsers.map((u) => u.id);

    await prisma.quest.deleteMany({
      where: { sessionId: sid, type: { in: ["assigned", "campaign"] } },
    });
    if (demoUserIds.length > 0) {
      await prisma.quest.deleteMany({
        where: { creatorId: { in: demoUserIds }, type: { in: ["assigned", "campaign"] } },
      });
    }

    // Clean up survey rounds created by demo users
    const demoRounds = await prisma.surveyRound.findMany({
      where: { creatorId: { in: demoUserIds } },
      select: { id: true },
    });
    if (demoRounds.length > 0) {
      const roundIds = demoRounds.map((r) => r.id);
      await prisma.surveyResponse.updateMany({
        where: { roundId: { in: roundIds } },
        data: { roundId: null },
      });
      await prisma.surveyRound.deleteMany({ where: { id: { in: roundIds } } });
    }

    await prisma.mythicPlusTeam.deleteMany({ where: { sessionId: sid } });
    await prisma.wowCharacter.deleteMany({ where: { sessionId: sid } });
    await prisma.feedback.deleteMany({ where: { sessionId: sid } });
    await prisma.auditLog.deleteMany({ where: { sessionId: sid } });
    await prisma.directMessage.deleteMany({ where: { sessionId: sid } });
    await prisma.conversation.deleteMany({ where: { sessionId: sid } });
    await prisma.userTourProgress.deleteMany({ where: { sessionId: sid } });
    await prisma.userQuestProgress.deleteMany({ where: { sessionId: sid } });
    await prisma.userAchievement.deleteMany({ where: { sessionId: sid } });
    await prisma.xpTransaction.deleteMany({ where: { sessionId: sid } });
    await prisma.userLevel.deleteMany({ where: { sessionId: sid } });
    await prisma.loginStreak.deleteMany({ where: { sessionId: sid } });
    await prisma.thread.deleteMany({ where: { sessionId: sid } });
    await prisma.post.deleteMany({ where: { sessionId: sid } });
    await prisma.board.deleteMany({ where: { sessionId: sid } });
    await prisma.topic.deleteMany({ where: { sessionId: sid } });
    await prisma.forum.deleteMany({ where: { sessionId: sid } });
    await prisma.shout.deleteMany({ where: { sessionId: sid } });
    await prisma.calendarEvent.deleteMany({ where: { sessionId: sid } });
    await prisma.issueReport.deleteMany({ where: { sessionId: sid } });
    await prisma.surveyResponse.deleteMany({ where: { sessionId: sid } });
    await prisma.user.deleteMany({ where: { sessionId: sid } });
    await prisma.demoSession.delete({ where: { id: sid } });
  }

  return staleSessions.length;
}
