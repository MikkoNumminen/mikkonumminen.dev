---
title: Pollning som fortsatte efter att du tittat bort
description: Kontaktsidan fortsatte att pinga chat-backend i dolda flikar, och att fixa det avslöjade en liten TypeScript-fälla för typinsnävning.
date: 2026-07-19
locale: sv
slug: polling-a-hidden-tab
project: portfolio
aiGenerated: true
hasAudio: false
tags: ['rag', 'frontend']
---

Kontaktsidan kontrollerar om chat-backend är vaken så att den kan visa en ärlig status istället för en ruta som tyst misslyckas. Den gjorde det på en timer, och timern brydde sig inte om någon faktiskt tittade på sidan. En flik som lämnats öppen i bakgrunden fortsatte att skicka förfrågningar till en maskin hemma, i det oändliga, å ingens vägnar.

Pollningen pausar nu när dokumentet blir dolt och återupptas när det kommer tillbaka. Liveness-resultatet cachas så att återgång till fliken inte omedelbart utlöser en ny sondering.

En detalj är värd att notera eftersom den inte var uppenbar. Att läsa synlighetstillståndet en gång till en variabel lät TypeScript snäva in typen till vilket värde den såg vid den tidpunkten, vilket fick senare jämförelser mot det andra värdet att se onåbara ut och flaggas som fel. Att läsa det genom en liten hjälpfunktion som returnerar det aktuella värdet varje gång håller typen ärlig och kontrollen meningsfull. Kompilatorn hade rätt i att klaga på den första versionen, bara inte av den anledning det verkade.

Den andra saken som krävde omsorg var vilka resultat som cachas. Bara en lyckad sondering lagras. Att cacha ett misslyckande skulle innebära att sidan fortsätter rapportera backend som nere under hela cache-postens livstid, långt efter att den kommit tillbaka upp, vilket är ett värre fel än det som fixades. Pollningen återladdar sig inte heller medan fliken är dold, så en sida som hamnar i bakgrunden mitt i en pågående kontroll schemalägger inte tyst en till.
