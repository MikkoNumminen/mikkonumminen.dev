import { cache } from "react";
import { prisma } from "@/db";
import { auth } from "@/auth";
import { ActionError } from "@/actionErrors";

export const PERMISSION_KEYS = [
  "person:create",
  "person:delete",
  "person:update_position",
  "person:update_name",
  "person:update_email",
  "person:read",
  "team:create",
  "team:delete",
  "team:update_name",
  "team:update_manager",
  "team:add_member",
  "team:remove_member",
  "team:read",
  "department:create",
  "department:delete",
  "department:update",
  "department:assign_team",
  "department:read",
  "data:reset",
  "data:seed",
  "admin:manage_users",
  "admin:assign_permissions",
  "admin:view_audit_log",
  "dashboard:view",
  "data:import",
  "data:export",
  "review:view",
  "review:manage",
  "review:submit",
  "leave:view",
  "leave:request",
  "leave:approve",
  "leave:manage_types",
  "position:manage",
  "reports:view",
  "reports:export",
  "admin:manage_jobs",
  "admin:manage_feature_flags",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const ROLE_DEFAULTS: Record<string, PermissionKey[]> = {
  superuser: [...PERMISSION_KEYS],
  administrator: [
    "person:create",
    "person:delete",
    "person:update_position",
    "person:update_name",
    "person:update_email",
    "person:read",
    "team:create",
    "team:delete",
    "team:update_name",
    "team:update_manager",
    "team:add_member",
    "team:remove_member",
    "team:read",
    "department:create",
    "department:delete",
    "department:update",
    "department:assign_team",
    "department:read",
    "admin:view_audit_log",
    "dashboard:view",
    "data:export",
    "review:view",
    "review:manage",
    "review:submit",
    "leave:view",
    "leave:request",
    "leave:approve",
    "leave:manage_types",
    "position:manage",
    "reports:view",
    "reports:export",
    "admin:manage_jobs",
    "admin:manage_feature_flags",
  ],
  user: [
    "person:read",
    "team:read",
    "department:read",
    "review:view",
    "review:submit",
    "leave:view",
    "leave:request",
    "reports:view",
  ],
  guest: ["person:read", "team:read", "department:read"],
};

export async function seedPermissions(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const key of PERMISSION_KEYS) {
      await tx.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: formatPermissionDescription(key) },
      });
    }
  });
}

function formatPermissionDescription(key: PermissionKey): string {
  const descriptions: Record<PermissionKey, string> = {
    "person:create": "Create new persons",
    "person:delete": "Delete persons",
    "person:update_position": "Update person positions",
    "person:update_name": "Change person names",
    "person:update_email": "Update person emails",
    "person:read": "View person list",
    "team:create": "Create new teams",
    "team:delete": "Delete teams",
    "team:update_name": "Rename teams",
    "team:update_manager": "Assign or change team managers",
    "team:add_member": "Add members to teams",
    "team:remove_member": "Remove members from teams",
    "team:read": "View team list",
    "department:create": "Create new departments",
    "department:delete": "Delete departments",
    "department:update": "Update department name, description, and head",
    "department:assign_team": "Assign or remove teams from departments",
    "department:read": "View department list",
    "data:reset": "Reset all data",
    "data:seed": "Seed mock data",
    "admin:manage_users": "Access user management",
    "admin:assign_permissions": "Grant or revoke user permissions",
    "admin:view_audit_log": "View audit log history",
    "dashboard:view": "View dashboard with analytics",
    "data:import": "Import data from CSV files",
    "data:export": "Export data to CSV files",
    "review:view": "View performance reviews and cycles",
    "review:manage": "Create and manage review templates and cycles",
    "review:submit": "Submit assigned performance reviews",
    "leave:view": "View leave requests and balances",
    "leave:request": "Submit leave requests",
    "leave:approve": "Approve or reject leave requests",
    "leave:manage_types": "Create and manage leave types",
    "position:manage": "Create and manage position catalog",
    "reports:view": "View reports and analytics",
    "reports:export": "Export report data to CSV",
    "admin:manage_jobs": "Manage background job queues",
    "admin:manage_feature_flags": "Manage feature flags and user overrides",
  };
  return descriptions[key];
}

// Per-request memoized — without React cache, every hasPermission() call inside
// a single page render would issue an independent prisma.user.findUnique with a
// permissions join. The home page calls hasPermission ~5x (one per query), so
// this turns 5 round-trips per render into 1.
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      permissions: {
        include: { permission: true },
      },
    },
  });

  return user;
});

export async function resolvePermissions(
  role: string,
  overrides: { key: string; granted: boolean }[],
): Promise<Partial<Record<PermissionKey, boolean>>> {
  // Unknown/corrupted roles get zero permissions (deny-all) rather than
  // falling back to guest which grants read access.
  const defaults = ROLE_DEFAULTS[role] ?? [];
  const result: Partial<Record<PermissionKey, boolean>> = {};

  for (const key of PERMISSION_KEYS) {
    result[key] = defaults.includes(key);
  }

  if (role !== "superuser") {
    for (const override of overrides) {
      if (override.key in result) {
        result[override.key as PermissionKey] = override.granted;
      }
    }
  }

  return result;
}

// Per-request memoized for the no-arg call (current user). The userId variant
// remains unmemoized because admin pages may legitimately look up multiple
// users in one render, and React.cache only deduplicates by argument identity.
const getCurrentUserPermissions = cache(
  async (): Promise<Partial<Record<PermissionKey, boolean>>> => {
    const user = await getCurrentUser();
    if (!user) return resolvePermissions("guest", []);
    const overrides = user.permissions.map((up) => ({
      key: up.permission.key,
      granted: up.granted,
    }));
    return resolvePermissions(user.role, overrides);
  },
);

export async function getUserPermissions(
  userId?: string,
): Promise<Partial<Record<PermissionKey, boolean>>> {
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
    if (!user) return resolvePermissions("guest", []);
    const overrides = user.permissions.map((up) => ({
      key: up.permission.key,
      granted: up.granted,
    }));
    return resolvePermissions(user.role, overrides);
  }

  return getCurrentUserPermissions();
}

export async function hasPermission(permissionKey: PermissionKey): Promise<boolean> {
  const permissions = await getUserPermissions();
  return permissions[permissionKey] ?? false;
}

export async function requirePermission(permissionKey: PermissionKey): Promise<void> {
  const allowed = await hasPermission(permissionKey);
  if (!allowed) {
    // Lazy import to avoid circular dependency (permissions → auditLog → auth → permissions)
    const { logPermissionDenial } = await import("@/auditLog");
    await logPermissionDenial(permissionKey);
    throw new ActionError("permissionDenied", `Permission denied: ${permissionKey}`);
  }
}
