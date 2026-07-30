---
title: 'Fastlåsningarna täckte bara en dörr'
description: 'Varenda en av mina agenter var fastlåst till en billig modell. Sedan hittade jag det andra sättet att starta en, där fastlåsningarna aldrig hade gällt alls.'
date: 2026-07-26
locale: sv
slug: the-pins-only-covered-one-door
aiGenerated: true
tags: ['Claude Code', 'agents', 'cost-routing', 'workflows']
---

För fem dagar sedan kontrollerade jag om mina cost-routing-agenter verkligen körde på de modeller jag hade fastlåst dem till. Det gjorde de. Jag läste modellen som fanns registrerad på de faktiska API-svaren, inte etiketten i gränssnittet, och varje fastlåsning höll. Så mycket var sant. Meningen jag byggde ovanpå det var större än det jag faktiskt hade mätt.

Fastlåsningarna finns i frontmatter, en fil per agent, och Agent tool respekterar dem. Det är bara ett sätt att starta en subagent. Ett workflow-skript delar ut arbete med `agent(prompt, options)`-anrop, och de tar en annan kodväg. Ett anrop som inte namnger någon modell får istället en generisk arbetare som ärver den orkestrerande sessionens modell och effort.

Så medan jag bekräftade att scout kördes på Haiku, delade mina review-workflows ut ett dussin agenter åt gången, var och en på vad sessionen än råkade vara. Det var Opus på hög effort, eftersom det är vad jag sätter för det arbete jag medvetet håller kvar i huvudsessionen.

Inget aviserade detta. Det syns bara på ett enda ställe, i varje agents egen metadata, där typen läser workflow-subagent istället för agentens namn. Fem review-workflows hade gått ut på det sättet. Tillsammans spenderade de omkring 3,8 miljoner token till orkestrator-priser, och recensionerna blev inte fem gånger bättre för det.

Fixen bestod av tre saker. Luckan är nu nedskriven i README, eftersom nästa person som snubblar över den blir jag. Två nya agenter, en reviewer och en refuter, ger en review-fan-out något billigt att peka på: en genomläsning av en diff på Sonnet, en adversarial genomgång per fynd på Haiku. Och en opt-in-hook läser ett workflow-skript innan det körs och namnger de anrop som inte fastlåser något.

Hooken är avsiktligt bara varnande. Den avslutas med koden som visar ett meddelande, inte koden som blockerar anropet, eftersom att ärva ibland är rätt svar. En slutlig syntespassage vill oftast faktiskt ha sessionens modell. Poängen är att göra valet synligt, inte att göra det åt dig.

Den var också fel tre gånger innan den blev rätt, på sätt mina egna tester inte hade tänkt att fråga om. Den hittar anrop genom att skanna text, så ett ofastlåst anrop vars prompt råkade innehålla orden model: lästes som fastlåst, ett nästlat anrop lät den inre fastlåsningen gå i god för den yttre, och ett regex som innehöll tecknen agent( räknades som ett anrop i sig. Alla tre berodde på att hela anropet behandlades som kod. Nu tömmer den först strängar, template literals, kommentarer och regex literals, och räknar parenteser på det som blir kvar.

Sedan körde jag den igen på de 85 workflow-skript som ligger på den här maskinen från månader av verkligt arbete. Den flaggade 73 och var tyst om 12, och alla 12 är genuint fastlåsta. Så det är inte hypotetiskt. Den hade slagit till på den stora majoriteten av alla workflows jag någonsin kört, inklusive alla fem av de dyra.

Agenterna, hooken och stegen som avgör vad som dirigeras vart är offentliga på [github.com/MikkoNumminen/claude-agents](https://github.com/MikkoNumminen/claude-agents). Senare instrumenterade jag en session för att se om de billiga nivåerna verkligen betalar sig, och sammanställde det jag kunde och inte kunde mäta i [en kort rapport](/sv/blog/do-the-cheap-agents-pay-for-themselves).

Förra gången var lärdomen att etiketten inte är mätningen. Den här sitter precis intill. Jag hade mätt en dörr noggrant och sedan beskrivit hela byggnaden. En fastlåsning som täcker en kodväg är värd exakt en kodväg, och allt bortom det var jag som generaliserade från ett sant resultat.
