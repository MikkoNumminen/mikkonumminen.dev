"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ActionError } from "@/lib/actionErrors";
import { safe, type ActionResult } from "@/lib/actionUtils";
import { rateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

/**
 * GDPR Right to Erasure — anonymize user PII and mark as deleted.
 *
 * Content authored by the user (posts, threads, shouts, etc.) is preserved
 * but the author's identity is scrubbed. CalendarEvent and SurveyResponse
 * already use onDelete: SetNull in the schema.
 */
export async function deleteMyAccount(confirmation: string): Promise<ActionResult> {
  return safe(async () => {
    if (confirmation !== "DELETE") {
      throw new ActionError("invalidInput", "You must type DELETE to confirm account deletion");
    }

    const session = await auth();
    if (!session?.user?.id) {
      throw new ActionError("permissionDenied", "Not authenticated");
    }

    await rateLimit("gdpr:deleteAccount", 3);

    const userId = session.user.id;

    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new ActionError("notFound", "User not found");
    }

    // Log before scrubbing PII
    await logAudit({
      action: "user.deleteAccount",
      entityType: "User",
      entityId: userId,
      actorId: userId,
      actorName: user.alias ?? user.name,
      details: { deletedUserId: userId },
    });

    await prisma.$transaction(async (tx) => {
      // 1. Scrub PII from the user record
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.invalid`,
          name: null,
          alias: null,
          image: null,
          avatarUrl: null,
          bio: null,
          role: "pending",
          deletedAt: new Date(),
        },
      });

      // 2. Delete permission overrides
      await tx.userPermission.deleteMany({ where: { userId } });

      // 3. Null out survey response links (schema has SetNull but we do it explicitly)
      await tx.surveyResponse.updateMany({
        where: { userId },
        data: { userId: null },
      });

      // 4. Null out calendar event author links
      await tx.calendarEvent.updateMany({
        where: { authorId: userId },
        data: { authorId: null },
      });

      // 5. Cascade-deleted records (posts, topics, threads, shouts, issue reports)
      // are handled by the DB cascade rules on User deletion.
      // Since we soft-delete (not hard-delete), we soft-delete all authored content.
      const now = new Date();
      await tx.post.updateMany({
        where: { authorId: userId, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.topic.updateMany({
        where: { authorId: userId, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.thread.updateMany({
        where: { authorId: userId, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.shout.deleteMany({ where: { authorId: userId } });
      await tx.issueReport.deleteMany({ where: { authorId: userId } });

      // 6. Anonymize DMs — keep conversation for the other participant but scrub sender identity
      await tx.directMessage.updateMany({
        where: { senderId: userId },
        data: { message: "[deleted]" },
      });

      // 7. Clean up rate limit entries
      await tx.rateLimit.deleteMany({ where: { identifier: userId } });
    });
  });
}

/**
 * GDPR Right to Access — export all user data as JSON.
 */
export async function exportMyData(): Promise<{ error: string; code: string } | { data: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Not authenticated", code: "permissionDenied" };
    }

    await rateLimit("gdpr:exportData");

    const userId = session.user.id;

    const [
      user,
      posts,
      topics,
      threads,
      events,
      shouts,
      issues,
      surveys,
      permissions,
      conversations,
    ] = await Promise.all([
      prisma.user.findFirst({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          alias: true,
          image: true,
          avatarUrl: true,
          bio: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.post.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          body: true,
          pinned: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
      prisma.topic.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          body: true,
          pinned: true,
          locked: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
      prisma.thread.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          body: true,
          parentType: true,
          parentId: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
      prisma.calendarEvent.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          description: true,
          location: true,
          startTime: true,
          endTime: true,
          allDay: true,
          createdAt: true,
        },
      }),
      prisma.shout.findMany({
        where: { authorId: userId },
        select: { id: true, message: true, createdAt: true },
      }),
      prisma.issueReport.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          description: true,
          url: true,
          createdAt: true,
        },
      }),
      prisma.surveyResponse.findMany({
        where: { userId },
        select: {
          id: true,
          conversationStyle: true,
          features: true,
          mustHave: true,
          dealbreaker: true,
          otherFeedback: true,
          submittedAt: true,
        },
      }),
      prisma.userPermission.findMany({
        where: { userId },
        include: { permission: { select: { key: true, description: true } } },
      }),
      prisma.conversation.findMany({
        where: { OR: [{ participantA: userId }, { participantB: userId }] },
        include: {
          messages: {
            select: { id: true, message: true, senderId: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    ]);

    if (!user) {
      return { error: "User not found", code: "notFound" };
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: user,
      permissions: permissions.map((p) => ({
        key: p.permission.key,
        granted: p.granted,
      })),
      posts,
      topics,
      threads,
      calendarEvents: events,
      shoutboxMessages: shouts,
      issueReports: issues,
      surveyResponses: surveys,
      directMessages: conversations.map((c) => ({
        conversationId: c.id,
        createdAt: c.createdAt,
        messages: c.messages.map((m) => ({
          id: m.id,
          message: m.message,
          sentByMe: m.senderId === userId,
          createdAt: m.createdAt,
        })),
      })),
    };

    await logAudit({
      action: "user.exportData",
      entityType: "User",
      entityId: userId,
      actorId: userId,
      actorName: user?.alias ?? user?.name,
    });

    return { data: JSON.stringify(exportData, null, 2) };
  } catch (error) {
    logger.error("Data export error", error, "gdpr");
    return { error: "An unexpected error occurred", code: "unexpectedError" };
  }
}
