---
title: 'Merkinnässä luki Opus'
description: 'Cost-routing-agenttini näyttivät kaikki pyörivän Opuksella. Jokainen selitys, johon tartuin, oli väärä, mukaan lukien se, josta olin varmin.'
date: 2026-07-21
locale: fi
slug: the-label-said-opus
aiGenerated: false
hasAudio: false
tags: ['Claude Code', 'agents', 'measurement', 'cost-routing']
---

Pyöritän pientä joukkoa subagenteja Claude Codelle, jotka reitittävät työn kustannusten mukaan. Jokainen niistä on kiinnitetty halvimpaan mallitasoon, joka pystyy tekemään sen työn. Haku ja mekaaniset muokkaukset menevät Haikulle, spesifikaation muotoiset muutokset Sonnetille, ja vain todellinen harkinta pääsee Opukselle. Tarkoitus on lopettaa Opus-hintojen maksaminen grepistä.

Kun sitten avasin agenttilistan kesken ajon ja näin "Opus 4.8" jokaisen rivin vieressä, se näytti pahalta. Find, Verify, kaikki Opuksella. Jos se oli totta, reititys oli koristetta ja jokainen token-luku, jonka olin julkaissut siitä, oli fiktiota.

Ensimmäinen oletus kirjoitti itse itsensä: bugi. Ja se oli uskottava, koska yksi oli ollut todellinen. Subagentit perivät ennen emosession mallin ja jättivät oman kiinnityksensä huomiotta, ja se oli korjattu tuoreessa versiossa. Joten menin korjaamaan repoani.

Korjaus, joka tuli mieleen, oli korvata jokainen tasoalias täydellä model ID:llä. Selkeämpi, vaikeampi session ohittaa. Paitsi että mikään tuosta ei ole totta. Alias ja täysi ID ovat samalla prioriteetilla, joten selkeytettävää ei ollut. Ja kovakoodattu ID mätänee hiljaa tason liikkuessa sen alla, kun taas alias seuraa sitä. Korjaus olisi ollut regressio, ja olisin toimittanut sen luottavaisin mielin. Olen iloinen, että luin dokumentaation ennen diffiä.

Sitten mittaus, ainoa osa, joka merkitsee. Sen sijaan että olisin luottanut käyttöliittymän merkintään, luin mallin, joka oli tallennettu kunkin subagentin oman transcriptin todellisiin API-vastauksiin. Scout pyöri Haikulla. Kääntäjä pyöri Sonnetilla. Kiinnitykset pitivät. Korjattavaa ei ollut.

Se jätti jäljelle ilmeisen kysymyksen. Jos omat agenttini olivat omilla tasoillaan, mitä olivat Opus-rivit?

Ne olivat Explore, sisäänrakennettu agenttityyppi. Minulla ei ole sille tiedostoa repossani, joten yksikään kiinnityksistäni ei koskaan koskettanut sitä, eikä se myöskään peri session mallia. Samalla ruudulla, samassa sessiossa, oma kiinnitetty scoutini istui Haikulla. Opus-rivit eivät koskaan olleet todiste reitityksestäni kumpaankaan suuntaan. Olin lukenut osaa järjestelmästä, jota reponi ei omista, ja pitänyt sitä tuomiona siitä osasta, jonka se omistaa.

Oli vielä yksi, ja se oli se, josta olin varmin. Transcriptit väittivät myös, että pääsessio oli pyörinyt Fablella. Tiesin, että se oli väärin, koska Fable-kiintiöni oli täynnä, joten se joko ei ollut pyörinyt tai olin jotenkin saanut sen ilmaiseksi. Transcriptin kenttä kertoo mallin, joka vastaukset todella tuotti. Niissä oli oikeita output-tokeneita, eikä datassa ollut merkkiäkään uudelleenreitityksestä. Fable pyöri. Täysi kiintiö on juuri sitä, mitä muutama sata Fable-kutsua jättää jälkeensä. Olin osoittanut seurausta ikään kuin se olisi ollut ristiriita. Ainoa oletus, jonka alle olin varmasti pannut nimeni, oli se, joka petti.

Olen kirjoittanut tämän postauksen ennenkin. Kerran se oli rate limiter, joka hiljaa turmeli vertailun. Kerran se oli jäsennin, joka oli väärässä kertoimella 23. Muuttuja vaihtuu. Muoto ei. Merkintä ei ole mittaus, ja se, mistä olet varmin, on ensimmäinen asia, joka pitää tarkistaa.
