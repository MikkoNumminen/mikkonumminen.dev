---
title: Ett byggsteg som ständigt skrev om en fil det inte hade ändrat
description: PDF:en för skills-registret genererades om vid varje bygge, vilket gav ett smutsigt working tree och en meningslös binär diff.
date: 2026-07-20
locale: sv
slug: build-that-rewrote-itself
aiGenerated: true
tags: ['build', 'skills-pdf']
---

PDF:en för skills-registret är committad till repot, och bygget genererade om den varenda gång. Eftersom renderaren inte producerar byte-identisk utdata mellan körningar innebar det att varje bygge lämnade en modifierad binärfil i working tree. Diffen bar ingen information. Den var bara brus som antingen måste committas eller kastas bort efter varje körning.

Fixen var att hasha det som PDF:en faktiskt beror på och hoppa över renderingen när den hashen matchar det som producerade den befintliga filen. Enkelt i princip. Delen som behövde en andra omgång var själva cache-nyckeln, som från början bara täckte innehållsindata. Chrome:s utskriftsflaggor ändrar också utdata utan att röra innehållet, så en flaggändring hade tyst ignorerats och den föråldrade PDF:en hade behållits. De flaggorna är nu inbakade i nyckeln.

Två mindre saker föll ut ur samma arbete. Existenskontrollen innan den cachade filen lästes ersattes med att bara läsa den och hantera felet för saknad fil, eftersom vad som helst kan hända i mellanrummet mellan kontroll och läsning. Och PDF:en fick en gitattributes-post som markerar den som binär, vilket hindrar git från att försöka en radbaserad diff på den. Den borde ha funnits där från början.

Det fanns också en räknebugg i närheten som inte hade något med cachning att göra. Registret innehåller en post som är en omdirigering snarare än en riktig skill, och rubriksiffran räknade med den. Aggregaten härleder nu det aktiva antalet från per-skill-flaggorna och exkluderar omdirigeringar, så siffran på omslaget är 33 istället för 34.
