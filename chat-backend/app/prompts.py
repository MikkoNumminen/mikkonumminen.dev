"""Grounded prompt assembly for the RAG chat.

Turns a user question plus the retrieved corpus chunks into the message list
sent to the chat LLM. The system prompt is the guardrail: answer ONLY from the
provided context (Mikko's own portfolio content), never invent, and when the
context is empty or irrelevant say so plainly rather than hallucinate. Phase 4
hardens this with retrieval-strength gating; the instruction lives here from the
start so the model is grounded even before that.

Pure and stdlib-only, so the exact prompt shape is unit-tested.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

SYSTEM_PROMPT = (
    "You are the assistant on Mikko Numminen's developer portfolio terminal. "
    "Answer questions about Mikko, his projects, CV, and posts using ONLY the "
    "context below — it is excerpts from his own content.\n"
    "Rules:\n"
    "- Ground every claim in the context. Never invent projects, numbers, "
    "dates, tech, or features that are not there.\n"
    "- Be genuinely useful: read across all the excerpts and give a "
    "substantive, specific answer — name the relevant projects and what they "
    "do, don't just gesture at them.\n"
    "- If the exact thing asked is not spelled out, do NOT dead-end. Answer "
    "with the most relevant facts you do have and say plainly what the context "
    "doesn't cover (e.g. 'the content doesn't rank them by size, but ...'). "
    "Only when nothing in the context is relevant at all, say you don't have "
    "anything on that yet.\n"
    "- Never tell the user to type `help` or run a command — just answer.\n"
    "- Be concise and factual, in a friendly terminal voice. Write plain text "
    "with no markdown formatting — no asterisks or bold, no headings, no "
    "backticks. The terminal renders raw text, so markup shows as literal "
    "characters.\n"
    "- Refer to Mikko in the third person."
)


@dataclass(frozen=True)
class ContextChunk:
    """A retrieved corpus excerpt to ground the answer in."""

    source: str
    title: str
    content: str
    project: str | None = None


def format_context(chunks: Sequence[ContextChunk]) -> str:
    """Render retrieved chunks as a numbered, source-labelled context block."""
    if not chunks:
        return "(no relevant content found)"
    blocks = []
    for i, chunk in enumerate(chunks, start=1):
        label = chunk.title or chunk.source
        blocks.append(f"[{i}] {label} ({chunk.source})\n{chunk.content}")
    return "\n\n".join(blocks)


def build_messages(
    query: str,
    chunks: Sequence[ContextChunk],
    history: Sequence[Mapping[str, str]] = (),
) -> list[dict[str, str]]:
    """Assemble the OpenAI-style message list: system, prior turns, grounded ask.

    `history` (optional, role/content pairs) is threaded between the system
    instruction and the final grounded question so multi-turn callers keep
    context; the single-turn terminal passes none.
    """
    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in history:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    context = format_context(chunks)
    messages.append(
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"}
    )
    return messages
