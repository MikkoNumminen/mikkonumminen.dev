---
title: Tio dagar, fyra sidor
description: Jag byggde om varje sida på den här webbplatsen på tio dagar. Förstasidan är nu ett enda fält av 24 000 partiklar, och mitt namn är gjort av dem.
date: 2026-07-31
locale: sv
slug: ten-days-four-pages
aiGenerated: true
tags: ['portfolio', 'three.js', 'design']
---

Under ungefär tio dagar byggde jag om varje sida på den här webbplatsen. Det här är vad som ändrades, sida för sida, skrivet för människor som inte bryr sig om vad en shader är.

## Förstasidan

Förstasidan är där merparten av de tio dagarna gick, och det är förändringen jag skulle visa först.

Det som fanns där tidigare var en hög. Mitt namn stod högst upp som fasta 3D-bokstäver i ett krommaterial, belyst av åtta separata ljus. Bakom det snurrade en spiralgalax. Meteorer for förbi och blixtrade till vid nedslag. Commit-meddelanden dök upp på en slumpmässig timer. Bokstäverna bar dekorationer: ett berg med snö på M:et, en ring runt O:et, en get. Det fanns en linsöverstrålning. Var och en var sitt eget system, och de skrek alla över varandra på samma övre del av sidan. Under det, en vanlig platt sida, med en gradient som dolde linjen där 3D:n slutade.

Jag tog bort alltihop. Det som ersatte det är en enda sak: ett fält av 24 000 partiklar som täcker hela sidan, ligger bakom allt och aldrig försvinner.

Den verkliga förändringen är att mitt namn inte längre är text. Det finns inga bokstäver på förstasidan alls. Bokstäverna ritas en gång på en dold yta, och partiklarna får veta var bläcket landade. Varje partikel känner till tre hem: en plats i galaxen, en i mitt namn, en i stjärnfältet bakom resten av sidan. Skrollning flyttar dem mellan de hemmen: galaxen häller ut sig i namnet, och längre ner splittras namnet till stjärnor som följer dig nedåt på sidan. Skrolla tillbaka upp, och namnet sätter ihop sig själv igen, och jag behövde inte bygga den delen separat. Det är samma partiklar på väg hem.

Eftersom fältet är målat i sidans egen bakgrundsfärg och täcker allt, lagas den gamla färgskarven mellan toppen och resten inte längre. Den kan inte existera.

Det formade namnet är inte en stillbild. Det skimrar, och skimret bygger på hastighet snarare än avstånd: att skjuta partiklar längre bort får bara namnet att luta, medan att göra dem snabbare läses som levande. En krön av ljusstyrka vandrar över bokstäverna var åttonde sekund. En partikel av hundra tillåts vandra bort från bokstavsformerna, och var och en som gör det tillbringar omkring tre sekunder borta innan den glider tillbaka enligt sitt eget schema. Klicka på namnet och det tar smällen, och återhämtar sig sedan.

Markören knuffar undan partiklar. Klick skickar ut krusningar, och commit-meddelandena från den här webbplatsens eget repository dyker nu upp på de krusningarna i stället för på en timer. Glöden vet vad du tittar på: högljuddast på galaxen, lugn på det formade namnet, nästan borta bland stjärnorna.

Commits är verkliga, inbakade vid byggtillfället. Ett tag i produktion var de inte det: byggsystemet checkar bara ut den senaste commiten, så en förfrågan om sextio fick en, och sidan föll tillbaka på en hårdkodad platshållarlista. En funktion byggd för att visa verklig historia visade sina första veckor uppdiktad historia. Den visar det verkliga nu. Jag kontrollerade. Två gånger.

Det fanns också en uppmätt anledning. Den gamla högen frös webbläsaren i 306 millisekunder medan den kompilerade sina tio ritprogram under de åtta ljusen, och frysningen landade precis där en besökares första skrollning kommer in. Den nya sidan håller kvar en kort laddningsskärm tills den har ritat två jämna bildrutor i rad. Kostnaden betalas innan du släpps in, inte under din första gest. På svag hårdvara tunnas fältet ut; små skärmar och besökare med reducerad rörelse får en stillbild.

## Projekt

Det finns ett litet solsystem på den här webbplatsen. Man kan dra runt det och zooma, och varje planet är ett av mina projekt.

Det stämde också innan, i teorin. Sen mätte jag det. Vid standardkamerapositionen låg nio av de tolv banorna helt utanför den synliga bilden, så bara tre projekt syntes någonsin. Värre, den maximala utzoomningen var satt närmare än den yttersta banan, vilket innebar att man inte kunde nå de andra nio ens genom att försöka. Jag hade byggt ett solsystem och gjort det mesta av det oåtkomligt.

Alla tolv syns nu på skärmen, oavsett fönstrets form, och var och en av dem går att nå. Webbplatsen själv sitter i mitten som solen, med projekten kretsande runt den.

Sidan startar också mycket snabbare. Den första bildrutan brukade frysa webbläsaren i 1 159 millisekunder, vilket är tillräckligt länge för att undra om fliken har dött. Fixen som fungerade var trist: beräkna varje planets yta en gång och återanvänd den, i stället för att räkna om varje pixel varje bildruta. Det tog bort 69 procent av frysningen. Två självsäkra teorier misslyckades innan den, och den mer självsäkra av de två, att slå ihop ritprogrammen till ett enda, gjorde frysningen 230 millisekunder värre.

## Erfarenhet

Förstasidans enda rival om den största förbättringen sitter i slutet av erfarenhetssidan: ett kort som listar de 107 teknologier jag faktiskt bygger med, i fem grupper (språk, frontend, backend och data, AI och LLM, plattform). Varje rad öppnas för att visa vad som ligger under den. Öppna Rust och du ser kryptografibiblioteken. Öppna Python och du ser dokument- och talbiblioteken.

Kortet har en växel mellan två läsningar av samma data: efter teknologi, eller efter projekt. Vänd på den, och samma information omorganiseras till tolv projekt, var och en visar vad den är byggd av. Båda vyerna kommer från en enda lista, så de kan aldrig motsäga varandra.

Listan skrevs inte heller ur minnet. Den lästes ur de faktiska beroendefilerna för femton repositorier på min dator. Sen skars resultatet ner hårt. Modellnamn och operativsystemsverktyg försvann. Det gjorde också de vanliga bibliotek som varenda utvecklare på jorden använder. En lista som innehåller trivialiteter får de seriösa raderna att se ut som utfyllnad, och jag visar hellre 107 rader jag kan försvara än 300 som ser imponerande ut. En liten "work"-markering visar allt som använts i betalt kunduppdrag snarare än i mina egna projekt.

Resten av sidan ritar mitt yrkesliv som en bergsklättring, från 24 år inom järnhandeln längst ner till idag på toppen. Den brukade gå åt fel håll, så att klättra innebar att skrolla nedåt. Nu går den uppåt, som klättring brukar göra. Sidan brukade också avsluta med ett meddelande som sa att du hade nått slutet, följt av ytterligare två avsnitt. Nu finns det ett enda avslutande kort.

## Kontakt

Den sista sidan är en terminal man skriver i. Den svarar på frågor om mina projekt på vanligt språk, och modellen som ger svaren körs på en dator i mitt hem, på min egen hårdvara, snarare än hos något företags tjänst. När den saknar källa för ett svar vägrar den i stället för att hitta på ett. Jag betraktar vägran som en funktion.

Den senaste ändringen är liten. När den maskinen hemma är vaken meddelar terminalen det nu, så att en besökare vet att det finns något i andra änden som är villig att ta emot riktiga frågor. Tidigare var de enda ledtrådarna små och lätta att missa, och jag misstänker att de flesta skrev in ett kommando eller två och lämnade utan att någonsin upptäcka den intressanta delen.

## Hela varvet

De fyra sidorna stämmer nu överens med varandra, och med mitt CV, eftersom de alla läser från samma källor i stället för från mitt minne av dem. Om jag någonsin vill påstå mig ha en färdighet jag inte har, måste jag först förfalska beroendefilerna för femton repositorier. Vid den punkten är det ärligt talat mindre arbete att lära sig saken.
