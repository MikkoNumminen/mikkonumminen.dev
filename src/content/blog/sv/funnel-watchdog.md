---
title: Tunneln som går ner när ingen tittar
description: En vakthund för Tailscale Funnel som ligger framför RAG-chatten, och de två sätt som första versionen av den hade fel.
date: 2026-07-21
locale: sv
slug: funnel-watchdog
aiGenerated: true
tags: ['ragctl', 'ops']
---

Chatten på kontaktsidan körs på en maskin hemma. Trafiken kommer dit via en Tailscale Funnel, som är en publik ingång som mappar ett värdnamn till en lokal port. Det fungerar tills det inte gör det, och felet är tyst. Tunneln förblir registrerad, så allt ser konfigurerat ut, men den slutar vidarebefordra. Utifrån sett ser det ut som en chattruta som aldrig svarar.

Den här omgången commits lade till en vakthund som kontrollerar rutten periodiskt och återställer den när den faktiskt har blivit inaktuell. Det mesta av uppföljningsarbetet gick åt till att fixa vakthunden snarare än tunneln.

Den första versionen behandlade en oläsbar status som en död tunnel och startade om på den grunden. Det är bakvänt. Om statuskommandot misslyckas av egna skäl förvandlar en omstart ett övergående läsfel till ett verkligt avbrott som vakthunden själv orsakade. Regeln som kom ut av det är att aldrig påstå ett tillstånd man faktiskt inte kunde läsa. Att läsa funnelstatusen som JSON istället för att matcha mot utskriven text hjälpte också här, eftersom textformen var tvetydig i exakt de fall som spelade roll.

Det andra problemet var att tunnelnoden är delad. Andra projekt kör sina egna funnels på samma maskin, så allt som nollställer eller startar om måste vara avgränsat till den här tjänstens port. En bred nollställning hade tagit ner orelaterade saker som inte hade något med chatten att göra.

Mindre fixar inom samma område: vakthunden skyddar nu sitt sparade pid mot återanvändning, så den kan inte hamna i att signalera vilken process som helst som ärvt det numret, och att stoppa den med SIGTERM lämnar tunnelnoden igång istället för att riva ner infrastruktur som andra saker är beroende av. Återanslutningsförsök är begränsade, vilket mest innebär att en trasig tunnel nu misslyckas synligt istället för att försöka i det oändliga i bakgrunden.
