import { prisma } from "@/db";
import { captureAuditContext, deferAudit, type DeferredAuditEntry } from "@/auditLog";
import { Prisma } from "@prisma/client";

/** Context fields automatically filled by withAuditedTransaction. */
type AuditContext = Pick<DeferredAuditEntry, "userId" | "userEmail" | "sessionId">;

/** Everything a caller must supply — the audit meta without the context fields. */
type AuditEntryInput = Omit<DeferredAuditEntry, keyof AuditContext>;

/** The callback receives the transaction client and an addAudit helper. */
type AuditedTransactionFn<T> = (
  tx: Prisma.TransactionClient,
  addAudit: (entry: AuditEntryInput) => void,
) => Promise<T>;

/**
 * Runs a Prisma transaction with automatic audit log capture.
 *
 * The repeated pattern across all server actions is:
 *   const ctx = await captureAuditContext();   // often INSIDE the tx — wrong
 *   const auditEntries: DeferredAuditEntry[] = [];
 *   await prisma.$transaction(async (tx) => {
 *     // ... mutations ...
 *     auditEntries.push({ ...ctx, action, entityType, ... });
 *   });
 *   deferAudit(auditEntries);
 *
 * This helper:
 *   - captures audit context BEFORE the transaction (correct — avoids tx timeouts)
 *   - exposes an addAudit() helper inside the callback to accumulate entries
 *   - calls deferAudit() with all collected entries after the transaction commits
 *   - returns the value produced by the callback
 *
 * Usage:
 *   const result = await withAuditedTransaction(async (tx, addAudit) => {
 *     const person = await tx.person.create({ data: { ... } });
 *     addAudit({ action: "create", entityType: "person", entityId: person.id, after: { ... } });
 *     return person;
 *   });
 */
export async function withAuditedTransaction<T>(fn: AuditedTransactionFn<T>): Promise<T> {
  // Capture user + session context before entering the transaction so that
  // auth() / headers() calls do not run inside the PostgreSQL transaction window.
  const ctx = await captureAuditContext();
  const entries: DeferredAuditEntry[] = [];

  const result = await prisma.$transaction((tx) =>
    fn(tx, (entry: AuditEntryInput) => entries.push({ ...ctx, ...entry })),
  );

  deferAudit(entries);
  return result;
}
