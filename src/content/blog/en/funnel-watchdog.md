---
title: The tunnel that goes down while nobody is looking
description: A watchdog for the Tailscale Funnel that fronts the RAG chat, and the two ways the first version of it was wrong.
date: 2026-07-21
locale: en
slug: funnel-watchdog
project: portfolio
aiGenerated: true
hasAudio: false
tags: ['rag', 'ragctl', 'ops']
---

The chat on the contact page runs on a machine at home. Traffic gets there through a Tailscale Funnel, which is a public ingress that maps a hostname onto a local port. It works until it doesn't, and the failure is quiet. The tunnel stays registered, so everything looks configured, but it stops forwarding. From the outside that reads as a chat box that never answers.

This batch of commits added a watchdog that checks the route periodically and brings it back when it has actually gone stale. Most of the follow-up work was fixing the watchdog rather than the tunnel.

The first version treated an unreadable status as a dead tunnel and restarted on that basis. That is backwards. If the status command fails for its own reasons, restarting turns a transient read error into a real outage that the watchdog itself caused. The rule that came out of it is to never assert a state you could not actually read. Reading the funnel status as JSON instead of matching on printed text helped here too, because the text form was ambiguous in exactly the cases that mattered.

The second problem was that the tunnel node is shared. Other projects run their own funnels on the same machine, so anything that resets or restarts has to be scoped to this service's port. A broad reset would have taken down unrelated things that had nothing to do with the chat.

Smaller fixes in the same area: the watchdog now guards its recorded pid against reuse, so it cannot end up signalling whatever process inherited that number, and stopping it with SIGTERM leaves the tunnel node running rather than tearing down infrastructure that other things depend on. Reconnect attempts are capped, which mostly means a broken tunnel now fails visibly instead of retrying forever in the background.
