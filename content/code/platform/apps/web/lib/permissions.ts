export const ROLES = ["superuser", "vuohi", "admin", "user", "pending"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  // Admin
  "admin:users": "Manage users and permissions",
  "admin:settings": "Manage platform settings",

  // Content
  "board:create": "Create boards",
  "board:edit": "Edit any board",
  "board:delete": "Delete any board",
  "post:create": "Create posts",
  "post:edit": "Edit any post",
  "post:delete": "Delete any post",
  "forum:create": "Create forums",
  "forum:edit": "Edit any forum",
  "forum:delete": "Delete any forum",
  "topic:create": "Create topics",
  "topic:edit": "Edit any topic",
  "topic:delete": "Delete any topic",
  "thread:create": "Create threads/comments",
  "thread:edit": "Edit any thread",
  "thread:delete": "Delete any thread",

  // Calendar
  "event:create": "Create calendar events",
  "event:edit": "Edit any event",
  "event:delete": "Delete any event",

  // Issues
  "issue:resolve": "Resolve or reopen issue reports",

  // Custom Quests
  "quest:manage": "Create, edit, and complete custom quests",
  "quest:view": "View global custom quest list",

  // Survey
  "survey:results": "View survey results",

  // Direct Messages
  "dm:send": "Send direct messages",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

const ROLE_DEFAULTS: Record<Role, PermissionKey[]> = {
  superuser: Object.keys(PERMISSIONS) as PermissionKey[],
  vuohi: [
    "admin:users",
    "admin:settings",
    "board:create",
    "board:edit",
    "board:delete",
    "post:create",
    "post:edit",
    "post:delete",
    "forum:create",
    "forum:edit",
    "forum:delete",
    "topic:create",
    "topic:edit",
    "topic:delete",
    "thread:create",
    "thread:edit",
    "thread:delete",
    "event:create",
    "event:edit",
    "event:delete",
    "issue:resolve",
    "quest:manage",
    "quest:view",
    "survey:results",
    "dm:send",
  ],
  admin: [
    "admin:users",
    "board:create",
    "board:edit",
    "board:delete",
    "post:create",
    "post:edit",
    "post:delete",
    "forum:create",
    "forum:edit",
    "forum:delete",
    "topic:create",
    "topic:edit",
    "topic:delete",
    "thread:create",
    "thread:edit",
    "thread:delete",
    "event:create",
    "event:edit",
    "event:delete",
    "issue:resolve",
    "quest:view",
    "survey:results",
    "dm:send",
  ],
  user: ["post:create", "topic:create", "thread:create", "event:create", "dm:send"],
  pending: [],
};

export function resolvePermissions(
  role: string,
  overrides: Array<{ key: string; granted: boolean }> = [],
): Record<string, boolean> {
  const defaults = ROLE_DEFAULTS[role as Role] || ROLE_DEFAULTS.pending;
  const permissions: Record<string, boolean> = {};

  for (const key of Object.keys(PERMISSIONS)) {
    permissions[key] = defaults.includes(key as PermissionKey);
  }

  for (const override of overrides) {
    if (override.key in permissions) {
      permissions[override.key] = override.granted;
    }
  }

  return permissions;
}
