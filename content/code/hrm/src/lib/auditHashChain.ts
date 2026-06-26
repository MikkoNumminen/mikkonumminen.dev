import { createHmac } from "crypto";
import { getAuditLogCollection } from "@/mongoDb";
import type { AuditLogDocument } from "@/mongoDb";
import type { WithId } from "mongodb";

// HMAC secret for audit log hash chain integrity.
// Falls back to a development-only key so the feature works out of the box.
function getHmacSecret(): string {
  return process.env.AUDIT_HMAC_SECRET ?? "dev-audit-hmac-secret-change-in-production";
}

// Compute the canonical string representation of a log entry for hashing.
// Field order is fixed to ensure deterministic hashing.
function canonicalize(doc: {
  userId: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: string | null;
  after: string | null;
  sessionId: string | null;
  createdAt: Date;
  prevHash: string | null;
}): string {
  return JSON.stringify([
    doc.userId,
    doc.userEmail,
    doc.action,
    doc.entityType,
    doc.entityId,
    doc.before,
    doc.after,
    doc.sessionId,
    doc.createdAt.toISOString(),
    doc.prevHash,
  ]);
}

// Compute HMAC-SHA256 of the canonical log entry.
export function computeHash(doc: {
  userId: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: string | null;
  after: string | null;
  sessionId: string | null;
  createdAt: Date;
  prevHash: string | null;
}): string {
  const hmac = createHmac("sha256", getHmacSecret());
  hmac.update(canonicalize(doc));
  return hmac.digest("hex");
}

// Get the hash of the most recent audit log entry for a given session.
// Returns null if no entries exist (genesis).
export async function getLatestHash(sessionId: string | null): Promise<string | null> {
  const col = getAuditLogCollection();
  const latest = await col.findOne(
    { sessionId },
    { sort: { createdAt: -1, _id: -1 }, projection: { hash: 1 } },
  );
  return (latest as WithId<AuditLogDocument & { hash?: string }> | null)?.hash ?? null;
}

export interface VerificationResult {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  firstBrokenAt?: {
    id: string;
    index: number;
    createdAt: string;
    expected: string;
    actual: string;
  };
}

// Walk the full hash chain for a session and verify integrity.
export async function verifyChain(sessionId: string | null): Promise<VerificationResult> {
  const col = getAuditLogCollection();
  const docs = await col.find({ sessionId }).sort({ createdAt: 1, _id: 1 }).toArray();

  const entries = docs as Array<WithId<AuditLogDocument & { prevHash?: string; hash?: string }>>;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Skip entries that predate the hash chain (no hash field)
    if (!entry.hash) continue;

    const expected = computeHash({
      userId: entry.userId,
      userEmail: entry.userEmail,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      sessionId: entry.sessionId,
      createdAt: entry.createdAt,
      prevHash: entry.prevHash ?? null,
    });

    if (expected !== entry.hash) {
      return {
        valid: false,
        totalEntries: entries.length,
        verifiedEntries: i,
        firstBrokenAt: {
          id: entry._id.toString(),
          index: i,
          createdAt: entry.createdAt.toISOString(),
          expected,
          actual: entry.hash,
        },
      };
    }
  }

  return {
    valid: true,
    totalEntries: entries.length,
    verifiedEntries: entries.filter((e) => e.hash).length,
  };
}
