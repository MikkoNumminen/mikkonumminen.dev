// Pure per-transcript token accounting for skill-calibration / optim-rollout draws.
// No IO — takes raw JSONL content, returns the draw's summed cost. scripts/draw-tokens.mjs
// wraps this with file reads. Unit-tested in transcript-tokens.test.mjs.
//
// Convention (matches scripts/build-review-stats.mjs + the study):
//   tokenCost = input_tokens + output_tokens + cache_creation_input_tokens
//   deduped by (sessionId, requestId); cache_read excluded (paid upstream).

/**
 * Account one transcript's JSONL `content`.
 * @returns {{ total: number, nAsst: number, model: string|null, drawId: string|null }}
 *   total   summed token cost across deduped assistant messages
 *   nAsst   number of counted assistant messages
 *   model   family (opus/sonnet/haiku) of the first assistant message with a model, else null
 *   drawId  the DRAW_ID:<id> marker from the first user message, else null
 */
export function accountTranscript(content) {
  const seen = new Set();
  let total = 0;
  let nAsst = 0;
  let model = null;
  let drawId = null;
  let firstUserSeen = false;
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type === 'user' && !firstUserSeen) {
      firstUserSeen = true;
      const c = o.message?.content;
      const txt =
        typeof c === 'string'
          ? c
          : Array.isArray(c)
            ? c.map((p) => (typeof p === 'string' ? p : (p?.text ?? ''))).join(' ')
            : '';
      const m = txt.match(/DRAW_ID:\s*([A-Za-z0-9_.-]+)/);
      if (m) drawId = m[1];
    }
    if (o.type !== 'assistant') continue;
    if (!o.message?.usage || !o.requestId) continue;
    const dedupe = `${o.sessionId}|${o.requestId}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const u = o.message.usage;
    total +=
      (u.input_tokens ?? 0) +
      (u.output_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0);
    nAsst++;
    if (!model && typeof o.message?.model === 'string') {
      const r = o.message.model.toLowerCase();
      model = r.includes('opus')
        ? 'opus'
        : r.includes('sonnet')
          ? 'sonnet'
          : r.includes('haiku')
            ? 'haiku'
            : o.message.model;
    }
  }
  return { total, nAsst, model, drawId };
}
