---
title: 'Etiketten sa Opus'
description: 'Mina cost-routing-agenter verkade alla köra på Opus. Varje förklaring jag sökte mig till var fel, inklusive den jag var mest säker på.'
date: 2026-07-21
locale: sv
slug: the-label-said-opus
project: claude-agents
aiGenerated: false
hasAudio: false
tags: ['claude-code', 'agents', 'measurement', 'cost-routing']
---

Jag kör en liten uppsättning subagenter för Claude Code som dirigerar arbete efter kostnad. Var och en är fastlåst till den billigaste modellnivå som klarar sitt jobb. Sökning och mekaniska ändringar går till Haiku, spec-formade ändringar till Sonnet, och bara verkligt omdöme når Opus. Poängen är att sluta betala Opus-priser för grep.

Så när jag öppnade agentlistan mitt i en körning och såg "Opus 4.8" bredvid varje rad såg det illa ut. Find, Verify, allt på Opus. Om det var sant var routingen bara dekoration och varje token-siffra jag hade publicerat om den var fiktion.

Det första antagandet skrev sig själv: en bugg. Och det var rimligt, eftersom det hade funnits en riktig sådan. Subagenter brukade ärva förälder-sessionens modell och ignorera sin egen fastlåsning, och det hade fixats i en nyare version. Så jag gick för att fixa mitt repo.

Fixen som föll mig in var att byta ut varje nivåalias mot det fullständiga model ID:t. Mer explicit, svårare för sessionen att åsidosätta. Förutom att inget av det stämmer. Ett alias och ett fullständigt ID ligger på samma prioritetsnivå, så det fanns inget att göra mer explicit. Och ett hårdkodat ID ruttnar tyst medan nivån flyttas under det, medan aliaset följer med. Fixen hade varit en regression, och jag hade levererat den med full tillförsikt. Jag är glad att jag läste dokumentationen innan diffen.

Sedan mätningen, den enda del som räknas. Istället för att lita på etiketten i gränssnittet läste jag modellen som fanns registrerad på de faktiska API-svaren i varje subagents egen transcript. Scout kördes på Haiku. Översättaren kördes på Sonnet. Fastlåsningarna höll. Det fanns inget att fixa.

Det lämnade den uppenbara frågan. Om mina agenter var på sina nivåer, vad var Opus-raderna?

De var Explore, en inbyggd agenttyp. Jag har ingen fil för den i mitt repo, så ingen av mina fastlåsningar rörde den någonsin, och den ärver inte heller sessionens modell. På samma skärm, i samma session, satt min egen fastlåsta scout på Haiku. Opus-raderna var aldrig bevis om min routing i någon riktning. Jag hade läst en del av systemet som mitt repo inte äger, och behandlat den som en dom över den del det äger.

Det fanns en till, och det var den jag var säkrast på. Transcripten sa också att huvudsessionen hade körts på Fable. Jag visste att det var fel, eftersom min Fable-kvot var full, så antingen hade den inte körts eller så hade jag på något sätt fått den gratis. Transcript-fältet är den servade modellen, svaren bar riktiga output-token, och det fanns ingen omdirigeringsmarkör någonstans i datan. Fable kördes. En full kvot är precis vad några hundra Fable-anrop lämnar efter sig. Jag hade pekat på konsekvensen som om den vore motsägelsen. Det enda antagande med mitt namn tryggt på var det som gick sönder.

Jag har skrivit det här inlägget förut. En gång var det en rate limiter som tyst korrumperade en jämförelse. En gång var det en parser som var fel med en faktor 23. Variabeln ändras. Formen gör det inte. Etiketten är inte mätningen, och det du är mest säker på är det du ska kontrollera först.
