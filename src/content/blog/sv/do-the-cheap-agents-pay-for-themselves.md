---
title: 'Betalar de billiga agenterna för sig?'
description: 'Sju instrumenterade delegeringar, tre verkliga fynd, en rekommendation jag avvisade och siffrorna jag inte publicerar.'
date: 2026-07-26
locale: sv
slug: do-the-cheap-agents-pay-for-themselves
aiGenerated: false
tags: ['measurement', 'agents', 'cost-routing']
---

Sju delegeringar från en arbetssession, instrumenterade. Vad kostnadsdirigeringen faktiskt köpte, och siffrorna jag vägrar publicera.

Jag kör en uppsättning kostnadsdirigerande underagenter för Claude Code. Var och en är fastlåst till den billigaste modellnivå som klarar sitt jobb, och den orkestrerande sessionen ska bara behålla det arbete som kräver omdöme. Jag hade aldrig kontrollerat om upplägget verkligen lönar sig.

Så jag instrumenterade en arbetssession. Sju delegeringar över två repositorier, allt verkligt arbete: granska pull requests, skriva agentdefinitioner, översätta ett blogginlägg, kartlägga ett korpus, inte ett riktmärke byggt för att mätas.

## Huvudsiffrorna

- **Delegeringar**: 7
- **Tokens, Haiku-nivån**: 231 369
- **Tokens, Sonnet-nivån**: 92 457
- **Tokens, totalt**: 323 826
- **Verktygsanrop gjorda av agenter**: 122
- **Agenternas klocktid**: 22,9 min
- **Kostnad som delegerad, övre gräns**: 2,08 $
- **Samma tokens till Opus 5-priser, övre gräns**: 8,10 $
- **Delegerad kostnad som andel av det**: 26 %

*Figur 1, kostnaden för samma 323 826 tokens.* Som delegerad, 2,08 $. Allt till Opus 5-priser, 8,10 $.

Båda kostnadssiffrorna är övre gränser, eftersom körtiden rapporterar en total tokensiffra per agent i stället för en uppdelning i in och ut, och jag debiterade varje token till det högre utpriset. De verkliga siffrorna är lägre, och förhållandet mellan dem är i stort sett stabilt eftersom priskvoten in mot ut är 1:5 på alla tre nivåerna.

## Prisgapet är smalare än premissen det byggdes på

Repositoriets egen säljpitch är "sluta betala Opus-priser för arbete som en billigare modell gör precis lika bra". Den formuleringen härrör från Opus 4.1 med 15/75 $ per miljon tokens, där Haiku kostade en femtondel. Det stämmer inte längre.

- **Claude Opus 5**: 5 $ in, 25 $ ut
- **Claude Sonnet 5**: 2 $ in, 10 $ ut, två femtedelar av Opus 5
- **Claude Haiku 4.5**: 1 $ in, 5 $ ut, en femtedel av Opus 5

Taket för delegeringsbesparingar är nu **5x**, och bara för Haiku-nivån. Sonnet-arbete sparar 60 %, inte 87 %. Varje påstående som vilar på "ungefär femton gånger billigare" citerar pensionerad prissättning.

Det finns en andra ordningens effekt som pekar åt andra hållet. Opus 5 och Sonnet 5 använder en nyare tokeniserare som enligt Anthropics egen dokumentation "producerar ungefär 30 % fler tokens för samma text"; Haiku 4.5 är äldre än den. En Haiku-agents tokenantal och en Opus-orkestrerares är därför inte i samma enheter, och samma arbete kostar fler tokens på Opus. Det vidgar det verkliga gapet över 5x. Jag tänker inte publicera en sammanslagen multipel: att multiplicera en leverantörs approximation med en priskvot och ange resultatet med tre siffror vore precis den falska precision som den här sortens rapport finns för att undvika.

## Vad jag inte kan mäta, och inte tänker uppskatta

Siffran alla vill ha är "hur mycket sparade delegeringen". Den kan jag inte ta fram ärligt.

För att räkna ut en besparing skulle jag behöva veta vad samma uppgift hade kostat om jag gjort den själv i sessionen, och jag har inget instrument för min egen tokenförbrukning. Värre: de två vägarna är inte likvärdiga i den riktning folk antar. En underagent startar kall och läser om kontext som orkestreraren redan har, så den kan lägga *fler* tokens på samma uppgift, inte färre. "Tokens till ett billigare pris" är därför en jämförelse mellan en mätt och en föreställd siffra.

Det jag kan slå fast är smalare och sant: **att göra det här arbetet genom billiga agenter kostade högst 2,08 $.** Om det slår alternativet är omätt.

## Kvalitet är den verkliga frågan, och den delar sig i tre

Kostnad spelar bara roll om resultatet går att använda. Sex av de sju resultaten användes: de tre som hittade något, och de tre som gav användbart arbete utan ett självständigt fynd. Ett av de tre användbara resultaten, A/B-omskrivningen som beskrivs nedan, användes som en sammanslagning snarare än rakt av, men det nådde det publicerade dokumentet. Det sjunde, en tillgänglighetsgranskning, är det enda vars rekommendation jag avvisade rakt av.

Här är uppdelningen som faktiskt avgör om dirigeringen förtjänar sin plats.

*Figur 2, utfall för varje delegering (n = 7).*

- **Hittade något jag missat**: 3, alla användes
- **Användbart resultat, inget självständigt fynd**: 3, alla användes, ett som sammanslagning
- **Nettonegativ, korrekt observation men avvisad rekommendation**: 1, användes inte

De tre fynden är argumentet för delegering, och inget av dem var något jag skulle ha fångat själv:

- **En inaktuell cachad mätning.** En korrekthetsgranskning av en fotpositionsfix noterade att fotens position i dokumentet mättes vid montering och uppdaterades bara vid `resize`, så en sent laddad bild eller ett utbytt webbtypsnitt skulle flytta foten utan att vyn någonsin ändrade storlek, och rikta korrigeringen dit foten brukade vara. Jag hade skrivit den koden och verifierat den. Jag hade inte tänkt på omflöde.
- **En falsk positiv i min egen detektor.** En granskning av en hook jag skrivit, en som söker igenom workflow-skript efter ofastlåsta agentanrop, fann att en reguljäruttrycksliteral som innehöll `agent(` lästes som ett verkligt anrop, eftersom maskeringen täckte strängar och kommentarer men inte reguljära uttryck.
- **En felaktig premiss i själva uppgiften.** Spaning på korpuset avslöjade att sajtens bloggkatalog inte indexeras alls; korpuset läser ett helt annat träd. Jag var på väg att uppdatera fel filer.

## Den som kostade mig

En tillgänglighetsgranskning av samma fotändring rapporterade att `prefers-reduced-motion` inte undertryckte den nya transformen, vilket utsatte rörelsekänsliga användare för omplacering vid skrollning.

Jag avvisade den, och att avvisa den krävde en full verifieringsrunda: att läsa tre stilmallar för att fastställa att transformen är övergångslös på alla tre ställen den förekommer, medvetet, så att den inte kan släpa efter skrollningen, vilket gör den till 1:1 skrollbunden positionering av samma slag som `position: sticky`, inte den animation undantaget siktar på. Att undertrycka den hade återinfört den ursprungliga buggen för precis de användare undantaget tjänar.

**Verifierat under reducerad rörelse.** Att publicera det resonemanget som avgjort hade varit samma fel som rapporten finns för att undvika, så jag gick och mätte det. När jag körde den verkliga sidan i Chrome med `prefers-reduced-motion: reduce` emulerat undertrycks transformen *inte*: kromet lyfts fortfarande med fotens fulla intrång, 0 till −90 px vid 884×900, identiskt med en session utan angiven preferens. Agentens faktapåstående var korrekt. Vad mätningen också visar är att rörelsen inte är animation: beräknad `transition-duration` för transformen är `0s` på båda ställena, och när dokumentets sista 200 px stegas 20 px i taget ger varje 20 px skrollning exakt −20 px motförskjutning, som börjar först när foten kommer in i vyn och slutar när den parkerar. Ingen mjukning, ingen översläng, ingen egen rörelse.

Observationen var alltså riktig och min vederläggnings premiss håller. Mellan dem ligger en bedömningsfråga: om 1:1 skrollbunden omplacering är sådan "rörelse" som en användare med reducerad rörelse bör slippa. Jag läser det som positionering snarare än animation, av samma slag som `position: sticky`, och jag anser fortfarande att undertrycka den skulle skada just de användare den påstår sig skydda. Den läsningen är en tolkning, inte en avgjord WCAG-gräns, och jag tänker inte presentera den som en sådan.

Därför kallar utfallsuppdelningen den här delegeringen en korrekt observation med avvisad rekommendation snarare än ett falskt fynd. Den tidigare etiketten övertolkade vad jag hade visat. Den var ändå nettonegativ: fyndet kostade mer att verifiera än det gav tillbaka, och verifieringsarbetet landade på den dyra modellen. Vid 1 av 7 är det överkomligt. Gratis är det inte.

## A/B: ingen version vann

En uppgift gjorde jag två gånger, en omskrivning av ett korpusdokument, en gång delegerad till Sonnet och en gång själv, från ett identiskt uppdrag.

Ingen var bättre. Den delegerade versionen valde två avsnittsrubriker som hämtar bättre än mina (`The workflow-inheritance gap` slår mitt prosaformade alternativ för ett dokument som ska styckas och bäddas in) och fick in ett begrepp i inledningsstycket som jag hade glömt. Min styckades bättre, eftersom jag delat två nya agentbeskrivningar i ett eget underavsnitt där den delegerade versionen tryckte in dem i enstaka överdimensionerade punkter, och den var mer precis om en identifierare.

Det publicerade dokumentet är en sammanslagning, vilket är varför den här delegeringen räknas som använd i uppdelningen ovan trots att inget av den gick ut oredigerat. Delegerad kostnad för det utkastet: 23 746 tokens, tre verktygsanrop, 27 sekunder. Som ett sätt att få ett andra komplett utkast att argumentera mot är det billigt. Som ett sätt att få ett färdigt dokument var det inte det, och formuleringen som behandlar delegering som "ta emot resultatet och använd det" är fel modell.

## Var dirigeringsregeln går sönder

Regeln jag arbetar under namnger tydliga trösklar: en sökning över tre eller fler filer går till en spanare, samma ändring upprepad över tre eller fler filer går till en mekaniker. Under den här sessionen träffade jag ett fall som uppfyllde tröskeln och där det hade varit fel att följa den: tre enradskorrigeringar i tre korpusfiler, där att skriva ett uppdrag precist nog att delegera hade tagit längre tid än att göra ändringarna.

Det finns ett golv under vilket delegering kostar mer än den sparar, och den nuvarande regeln uttrycker det inte. Tröskeln borde troligen vara en konjunktion: tre eller fler filer **och** tillräcklig specifikation för att uppdraget ska bli kortare än arbetet.

## Begränsningar

- **n = 7.** En session, en orkestreringsmodell, två repositorier, en författare. Inget här är en frekvens; siffran 1 av 7 avvisade rekommendationer kunde lika gärna vara 1 av 3 eller 1 av 20.
- **En gräns i tillgänglighetsfallet är en tolkning**, inte en mätning. Beteendet är mätt; huruvida det utgör en defekt är min läsning.
- **Kontrafaktiskt jämförelsefall saknas av konstruktion**, som beskrivits ovan. Ingen besparing hävdas.
- **Utfallsbedömningen är min**, och jag bedömde arbete jag själv beställt. "Hittade något jag missat" går att kontrollera mot de commits det gav upphov till; "användbart resultat" är en bedömningsfråga.
- **Kostnaderna är övre gränser**, med intokens debiterade till utpriser.

## Ett sidofynd som väger tyngre än rapporten

Allt ovan mäter de delegeringar jag gjorde medvetet. Medan jag mätte dem hittade jag en andra kodväg där fastlåsningarna aldrig hade tillämpats alls. Ett workflow-skript fördelar arbete med sina egna `agent()`-anrop, och ett anrop som inte namnger någon modell får inte den fastlåsta agenten: det får en generisk arbetare som ärver den orkestrerande sessionens modell och ansträngningsnivå. Min sessionsmodell är Opus på hög ansträngning, för det är vad jag håller huvudtråden på. Varje ofastlåst utfördelning hade kört där.

Ingenting annonserade det. Det syns på ett enda ställe, i varje agents egen metadata, där typen står som `workflow-subagent` i stället för agentens namn, vilket är precis dit jag råkade titta när jag samlade in tokensiffror per delegering till den här rapporten. Jag har skrivit upp den historien separat i [Fastlåsningarna täckte bara en dörr](/sv/blog/the-pins-only-covered-one-door).

Notan dvärgar den som rapporten gav sig ut för att mäta. Bland det här repositoriets workflow-underagenter står anrop på orkestreringsnivå för **3 755 242 tokens** på samma in-plus-ut-basis som används överallt annars här. Till Opus 5-priser och samma övre gräns-konvention, varje token debiterad till utpriset 25 $/M, blir det **93,88 $, övre gräns**. De sju medvetna delegeringar rapporten handlar om kostade 2,08 $. Vägen jag inte bevakade kostade ungefär fyrtiofem gånger den jag bevakade.

Rapporten publiceras även som PDF, [samma dokument renderat från samma markdown](/agent-delegation.pdf).

Reparationen är tre saker: luckan är nedskriven i repositoriets README, två granskningsformade agenter ger en utfördelning något billigt att peka på, och en frivillig hook läser ett workflow-skript innan det körs och namnger de anrop som inte låser fast något.

## Vad jag ändrade som följd

Inget om nivåindelningen. Underlaget stöder den: tre självständiga fynd för 2,08 $ är en bra affär redan innan någon kostnadsjämförelse, och den enda avvisade rekommendationen var billig att avvisa.

En sak ändrades utöver sidofyndet ovan. Prispåståendet i repositoriets dokumentation korrigeras, eftersom "Opus-priser" nu betyder ett 5x-gap och den gamla formuleringen tyst överdriver det.
