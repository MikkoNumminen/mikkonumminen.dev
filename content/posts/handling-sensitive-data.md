---
title: Handling sensitive data in an AI assistant · a plain-language guide
project: portfolio
date: 2026-06-28
---

# Handling sensitive data in an AI assistant: a plain-language guide

This explains, without technical jargon, how the chat assistant on this site is
built to handle sensitive information responsibly. It is written for a business
reader (a manager, a procurement lead, a data protection officer) not an
engineer. By the end you should be able to judge whether the *design* is sound,
and know exactly where an engineer's work stops and a lawyer's begins.

## The problem, in business terms

Most organisations sit on top of a genuine tension built into the law.

On one side, you are often *required to keep* personal data: accounting records,
signed contracts, employment files. Deleting them early can itself break the
rules. On the other side, the same law tells you to *hold as little as you can*,
to use it only for the reason you collected it, and to protect it well.

So you cannot simply delete everything, and you cannot simply keep everything
freely either. You have to keep what you must, while exposing it as little as
possible.

Adding an AI assistant on top of this data makes the tension sharper. An assistant
is, by design, a machine for *surfacing* information quickly and in plain language.
That is exactly the opposite of "minimise and protect." A naive assistant becomes
a new, fast, and very convincing way for the wrong person to pull out the wrong
record. The risk is not that the AI is malicious. It is that it is helpful to
everyone equally, including people who should not see a given file.

## How this design answers it

The guiding idea is simple: **decide what the assistant is allowed to see before
it ever sees it, not afterwards.** Five mechanisms work together.

1. **Isolation at the door.** Every piece of content is sorted into a sensitivity
   level (public, internal, restricted, or personal) *as it is brought in*.
   Anything marked as personal data is never loaded into the material the assistant
   can search at all. It is not "hidden from" the assistant; it was never put in
   front of it. This matters because a filter that tries to hold
   sensitive data back at the last moment only has to fail once to leak it. Data
   that was never loaded cannot leak.

2. **Replacing names with stand-ins (pseudonymisation).** For content that *can*
   be used but mentions specific people, the names and identifiers are swapped for
   neutral stand-in labels before the assistant ever reads it. The assistant can
   still reason about "the counterparty to contract 14" without ever being told
   who that is. The key that maps a stand-in back to a real name is kept in a
   separate, locked drawer that the assistant cannot open: only an authorised
   person, working outside the assistant, can look a name up.

3. **Showing the right things to the right people (role-based access).** Each
   request carries a role: the access level of whoever is asking. The assistant is
   only allowed to draw on the sensitivity levels that role is cleared for, and that
   limit is applied *before* anything is retrieved. A public visitor and an internal
   administrator asking the identical question are working from different,
   role-appropriate sets of material. Importantly, the role is set by the system's
   own sign-in, not typed into the chat box, so nobody can simply claim "I'm an
   administrator" there to see more. (How strong that guarantee is depends, as
   always, on how trustworthy the sign-in behind it is.)

4. **A record of what was asked (audit logging).** Every request can leave a
   trail: what was asked, the categories of material the request drew on, which
   role was asking, and whether the request was refused. This is the paper trail
   that lets an organisation review, after the fact, what the assistant was asked
   and which categories of material each role's requests touched: the kind of
   record a regulator or an internal review will eventually ask for. (It records
   the *role*, a category, rather than identifying the individual user. That
   linkage, if you need it, lives in your sign-in system, not here.)

5. **Keeping the data at home (data residency).** The assistant runs on local
   infrastructure. The language model that writes the answers and the search that
   finds the material both run on the organisation's own machine. Sensitive
   categories are never sent to an outside company's service to be processed. There
   is simply no outbound path for them to take.

Taken together, these turn "an AI that helpfully surfaces everything" into "an AI
that can only ever surface what a given person is entitled to, with the most
sensitive data kept out of its reach entirely, and a record of every request."

## The honest boundary

This is an **engineer's reference implementation**. It demonstrates the design
principles above, working, in code, with tests that prove each promise. It is
deliberately built to be inspected.

It is **not** a certified compliance product, and this document does not claim that
the system is "GDPR-compliant". That is not a phrase an engineer is entitled to
stamp on anything. Whether a specific deployment meets a specific organisation's
legal obligations depends on facts an engineer does not own: what data you hold,
why you hold it, what you have told the people it concerns, your retention
schedules, and your contracts. Those are questions for your data protection officer
or legal counsel.

What an engineer *can* responsibly promise is the part above: that the architecture
is built around well-established data-protection principles. It minimises what the
assistant can reach, scopes access by role, and keeps data within your own
infrastructure: in a way you can audit. What it cannot do is decide the questions
those principles ultimately turn on: whether your *purpose* for holding a record
permits a given use, or whether a particular retention period is lawful. Those stay
with you and your data protection officer. Where the engineering ends and the legal
assessment begins is drawn deliberately here, because pretending the line is
elsewhere is exactly what an informed reader would catch. The maturity of being
clear about that line is what should earn your trust in the rest.
