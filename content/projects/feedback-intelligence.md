---
title: Feedback Intelligence — grounded feedback analysis with a local LLM
project: feedback-intelligence
url: https://red-ground-0bacf9c03.7.azurestaticapps.net/
---

# Feedback Intelligence

**A feedback-intelligence engine where the LLM never computes the numbers.**

Feedback Intelligence ingests messy free-text feedback and surfaces situational signal through a strict two-layer architecture. The alert layer is deterministic and rule-coded — substring keyword matching plus plain arithmetic for counts and trends — and by construction cannot hallucinate. The LLM is used only where free-form language genuinely cannot be rule-coded: structuring raw input and synthesizing theme narratives. Every synthesized claim must cite the feedback ids it is grounded in; a claim that fails validation is dropped to a fallback and logged.

## Domain modules

The engine is domain-agnostic by design. The first application is Finnish retail, with a full hybrid grocery–hardware taxonomy — but a domain is a pluggable module, and swapping domains is configuration, not code: `--Domain:Active=game` switches the retail domain for a game domain with zero core edits. The architecture is recorded in ADR-0007 and ADR-0012, among 30+ ADRs in `docs/decisions/`.

## Model choice, by measurement

Synthesis and structuring run on Poro 2 8B, served by a local Ollama. Poro was chosen from a published 30-round blind test for Finnish naturalness, where it took 26 of 30 first places against qwen3:8b and llama3.1:8b. Its JSON discipline on messy input is covered by a mandatory salvage layer plus correction telemetry. The LLM sits behind Microsoft.Extensions.AI's `IChatClient` abstraction (`ILlmClientFactory`), so switching to a hosted provider like Azure OpenAI is a config change plus an eval run, not a rewrite.

## Data and safety

- **Synthetic corpus, GDPR-clean**: a hand-written expert core of 27 Finnish texts, multiplied offline by an LLM, then composed deterministically by a seeded generator that plants machine-checkable stories. No real customer data anywhere.
- **Prompt-injection defense in depth**: untrusted text is fenced and neutralized, injection symptoms raise a `needs_review` flag, synthesis output is bounded, and a red-team fixture is committed to the repo.

## Stack and deployment

.NET 8 (C#) with SQLite; xUnit test projects that run hermetically in CI with no LLM required; GitHub Actions CI plus CodeQL. The live demo runs on Azure Static Web Apps (free tier — zero infrastructure cost): a Node.js Azure Functions same-origin proxy forwards to the local Ollama GPU through a Tailscale Funnel. The demo is snapshot-first, falling back gracefully when the funnel is down, so cloud inference costs exactly nothing.

## Status

Live and actively developed as of July 2026. Built as a demonstrable work sample: architecture guide, 30+ ADRs, a corpus pipeline, a structuring eval harness, and a committed seed-42 snapshot with provenance verification.

[Live demo](https://red-ground-0bacf9c03.7.azurestaticapps.net/) · [GitHub](https://github.com/MikkoNumminen/feedback-intelligence)
