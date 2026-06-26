import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/db";
import { resolvePermissions } from "@/permissions";
import { seedDemoData, cleanupStaleDemoSessions } from "@/demoSession";
import { DEMO_EMAIL } from "@/constants";
import { MAX_CONCURRENT_SESSIONS } from "@/features/sessions/schemas";
import { headers } from "next/headers";

/**
 * Extract client IP and user agent from request headers for session tracking.
 * Returns nulls when headers() is not available (e.g. during build).
 */
async function getRequestMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const headersList = await headers();
    const ipAddress =
      headersList.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headersList.get("x-real-ip") ??
      null;
    const userAgent = headersList.get("user-agent") ?? null;
    return { ipAddress, userAgent };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

// Demo login is enabled by default so the demo works out of the box.
// Set NEXT_PUBLIC_DEMO_LOGIN=false to disable the zero-credential demo provider.
// Uses NEXT_PUBLIC_ prefix so the client can conditionally show the demo login button.
const demoProvider =
  process.env.NEXT_PUBLIC_DEMO_LOGIN !== "false"
    ? [
        Credentials({
          id: "demo",
          name: "Demo",
          credentials: {},
          async authorize() {
            let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
            if (!user) {
              // First demo login — create with superuser so the demo is fully functional.
              // Subsequent logins respect whatever role admins have assigned.
              user = await prisma.user.create({
                data: {
                  email: DEMO_EMAIL,
                  name: "Demo User",
                  role: "superuser",
                },
              });
            }

            const demoSession = await prisma.demoSession.create({
              data: { userId: user.id },
            });

            await seedDemoData(demoSession.id);

            // Clean up stale sessions in the background — don't block login
            cleanupStaleDemoSessions().catch((err) => {
              console.error("[demoSession] cleanupStaleDemoSessions failed:", err);
            });

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              demoSessionId: demoSession.id,
            };
          },
        }),
      ]
    : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, GitHub, ...demoProvider],
  pages: { signIn: "/auth/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      // Serializable transaction prevents the TOCTOU race where two
      // simultaneous first-time sign-ins both see count === 0 and both
      // become superuser. Upsert handles concurrent sign-ins for the
      // same email without unique-constraint errors.
      await prisma.$transaction(
        async (tx) => {
          const existing = await tx.user.findUnique({
            where: { email: user.email! },
          });

          if (!existing) {
            const userCount = await tx.user.count();
            const role = userCount === 0 ? "superuser" : "user";

            await tx.user.upsert({
              where: { email: user.email! },
              update: {},
              create: {
                email: user.email!,
                name: user.name ?? null,
                image: user.image ?? null,
                role,
              },
            });
          }
        },
        { isolationLevel: "Serializable" },
      );

      return true;
    },

    async jwt({ token, trigger, session: sessionUpdate, user }) {
      if (!token.email) return token;

      // Persist demoSessionId from authorize() on sign-in
      if (trigger === "signIn" && user?.demoSessionId) {
        token.demoSessionId = user.demoSessionId;
      }

      // On sign-in, mark 2FA as not yet verified
      if (trigger === "signIn") {
        token.twoFactorVerified = false;
      }

      // Handle session update from client (e.g., after 2FA verification)
      if (trigger === "update" && sessionUpdate?.twoFactorVerified === true) {
        token.twoFactorVerified = true;
      }

      // --- Session tracking: create a new UserSession on sign-in ---
      if (trigger === "signIn") {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true },
        });
        if (dbUser) {
          const { ipAddress, userAgent } = await getRequestMeta();
          const newSession = await prisma.userSession.create({
            data: {
              userId: dbUser.id,
              ipAddress,
              userAgent,
            },
          });
          token.sessionId = newSession.id;

          // Enforce concurrent session limit: deactivate oldest sessions beyond the limit
          const activeSessions = await prisma.userSession.findMany({
            where: { userId: dbUser.id, active: true },
            orderBy: { lastActiveAt: "desc" },
            select: { id: true },
          });
          if (activeSessions.length > MAX_CONCURRENT_SESSIONS) {
            const toDeactivate = activeSessions.slice(MAX_CONCURRENT_SESSIONS).map((s) => s.id);
            await prisma.userSession.updateMany({
              where: { id: { in: toDeactivate } },
              data: { active: false },
            });
          }
        }
      }

      // --- Session validity check: if sessionId exists, verify it's still active ---
      if (token.sessionId && trigger !== "signIn") {
        const sessionRecord = await prisma.userSession.findUnique({
          where: { id: token.sessionId as string },
          select: { active: true },
        });
        if (!sessionRecord || !sessionRecord.active) {
          // Session was deactivated (force logout or concurrent limit exceeded)
          // Clear the token to force re-authentication
          return {} as typeof token;
        }
        // Update lastActiveAt (at most once per 60 seconds to avoid DB write storms)
        const now = Date.now();
        const lastUpdate = token.sessionLastUpdate as number | undefined;
        if (!lastUpdate || now - lastUpdate > 60_000) {
          await prisma.userSession
            .update({
              where: { id: token.sessionId as string },
              data: { lastActiveAt: new Date() },
            })
            .catch(() => {
              // Non-critical — don't fail the request if lastActiveAt update fails
            });
          token.sessionLastUpdate = now;
        }
      }

      const needsFullRefresh =
        trigger === "signIn" || !token.role || typeof token.permissionsVersion !== "number";

      if (needsFullRefresh) {
        // Full fetch: signIn, first load, or missing version
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          include: {
            permissions: {
              include: { permission: true },
            },
            twoFactorAuth: {
              select: { enabled: true },
            },
          },
        });

        if (!dbUser) {
          delete token.userId;
          delete token.role;
          delete token.permissions;
          delete token.permissionsVersion;
          return token;
        }

        // Verify demoSessionId ownership — reject if it doesn't belong to this user
        if (token.demoSessionId) {
          const ownsSession = await prisma.demoSession.findFirst({
            where: { id: token.demoSessionId as string, userId: dbUser.id },
            select: { id: true },
          });
          if (!ownsSession) delete token.demoSessionId;
        }

        token.userId = dbUser.id;
        token.role = dbUser.role;
        token.permissionsVersion = dbUser.permissionsVersion;
        token.twoFactorRequired = dbUser.twoFactorAuth?.enabled ?? false;
        const overrides = dbUser.permissions.map((up) => ({
          key: up.permission.key,
          granted: up.granted,
        }));
        token.permissions = await resolvePermissions(dbUser.role, overrides);
      } else {
        // Lightweight check: only fetch version to detect permission changes
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true, role: true, permissionsVersion: true },
        });

        if (!dbUser) {
          delete token.userId;
          delete token.role;
          delete token.permissions;
          delete token.permissionsVersion;
          return token;
        }

        if (dbUser.permissionsVersion !== token.permissionsVersion || dbUser.role !== token.role) {
          // Permissions or role changed — full refresh
          const fullUser = await prisma.user.findUnique({
            where: { id: dbUser.id },
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          });

          if (fullUser) {
            token.role = fullUser.role;
            token.permissionsVersion = fullUser.permissionsVersion;
            const overrides = fullUser.permissions.map((up) => ({
              key: up.permission.key,
              granted: up.granted,
            }));
            token.permissions = await resolvePermissions(fullUser.role, overrides);
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      if (token.role) session.user.role = token.role as string;
      if (token.permissions)
        session.user.permissions = token.permissions as Record<string, boolean>;
      if (token.demoSessionId) session.user.demoSessionId = token.demoSessionId as string;
      if (token.sessionId) session.user.sessionId = token.sessionId as string;
      session.user.twoFactorRequired = (token.twoFactorRequired as boolean) ?? false;
      session.user.twoFactorVerified = (token.twoFactorVerified as boolean) ?? false;
      return session;
    },
  },
});
