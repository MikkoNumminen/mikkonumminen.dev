// Server-side event bus for real-time event distribution.
// Uses Node.js EventEmitter for in-process pub/sub with a per-session ring buffer
// for polling clients. Designed so swapping to Redis pub-sub is a one-file change.

import { EventEmitter } from "events";
import type { RealtimeEvent } from "@/features/realtime/schemas";

const EVENT_NAME = "realtime";
const MAX_BUFFER_SIZE = 100;
const MAX_LISTENERS = 1000;

// Singleton emitter — survives hot reloads in dev via globalThis
const globalEmitter = globalThis as unknown as { __realtimeEmitter?: EventEmitter };
if (!globalEmitter.__realtimeEmitter) {
  globalEmitter.__realtimeEmitter = new EventEmitter();
  globalEmitter.__realtimeEmitter.setMaxListeners(MAX_LISTENERS);
}
const emitter = globalEmitter.__realtimeEmitter;

// Per-session ring buffer for polling — also survives hot reloads
const globalBuffer = globalThis as unknown as {
  __realtimeBuffer?: Map<string | null, RealtimeEvent[]>;
};
if (!globalBuffer.__realtimeBuffer) {
  globalBuffer.__realtimeBuffer = new Map();
}
const ringBuffers = globalBuffer.__realtimeBuffer;

/** Emit a real-time event to all subscribers and store in the ring buffer. */
export function emitRealtimeEvent(event: RealtimeEvent): void {
  // Store in ring buffer for polling
  const key = event.sessionId;
  let buffer = ringBuffers.get(key);
  if (!buffer) {
    buffer = [];
    ringBuffers.set(key, []);
  }
  buffer.push(event);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.shift();
  }
  // Also update the map reference in case we just created the array
  ringBuffers.set(key, buffer);

  // Emit to SSE subscribers
  emitter.emit(EVENT_NAME, event);
}

/** Subscribe to real-time events for a specific session. Returns an unsubscribe function. */
export function subscribeEvents(
  sessionId: string | null,
  callback: (event: RealtimeEvent) => void,
): () => void {
  const listener = (event: RealtimeEvent) => {
    if (event.sessionId === sessionId) {
      callback(event);
    }
  };
  emitter.on(EVENT_NAME, listener);
  return () => {
    emitter.removeListener(EVENT_NAME, listener);
  };
}

/** Get recent events from the ring buffer newer than the given timestamp (for polling). */
export function getRecentEvents(sessionId: string | null, afterTimestamp: number): RealtimeEvent[] {
  const buffer = ringBuffers.get(sessionId);
  if (!buffer) return [];
  return buffer.filter((e) => e.timestamp > afterTimestamp);
}

/** Clear the ring buffer for a session (call during session cleanup). */
export function clearSessionEvents(sessionId: string | null): void {
  ringBuffers.delete(sessionId);
}

// Expose for testing
export function _getEmitter(): EventEmitter {
  return emitter;
}
