---
title: Kolmetuhatta riviä jotka eivät muuttaneet mitään
description: Pelkkä tyhjämerkkien uudelleenkirjoitus sai CodeQL:n raportoimaan neljä hälytystä uusina. Yksikään ei ollut, ja se miten tuo vika etenee on kirjaamisen arvoinen osa.
date: 2026-08-04
locale: fi
slug: three-thousand-lines-of-nothing
project: portfolio
aiGenerated: true
hasAudio: false
tags: ['build', 'ops', 'ragctl']
---

Pull request joka lisäsi ominaisuuslippuja RAG-hallintatyökaluun palasi CI:stä niin että CodeQL kaatui. Yksi korkean vakavuuden hälytys ja kolme huomautusta, kaikki raportoituna kyseisen pull requestin tuomina. Menin katsomaan niitä. Lokihakemiston `chmod` joka antaa kirjoitusoikeuden kaikille, ja kolme poikkeuskäsittelijää jotka nielaisevat virheensä paljaalla `pass`-lauseella. Niistä kaksi on JSON-jäsennys ja kolmas on `OSError` signaalin ympärillä. Kaikki neljä olivat jo masterissa, koskemattomina, vanhin niistä kuuden viikon ajan.

Syy oli rivinvaihdot. Tiedosto on tallennettu CRLF-muodossa, muokkauskierrokseni kirjoitti sen uudelleen LF:nä, ja 326 todellisen rivin muutos saapui 3804 rivin diffinä. Jokainen tiedoston rivi laskettiin kosketuksi. CodeQL rajaa uudet hälytykset muuttuneisiin riveihin, ja olin juuri kertonut sille että jokainen rivi oli muuttunut.

Ilmeinen hinta on se että katselmointi on hyödytön. Kukaan ei löydä todellista muutosta koko tiedoston uudelleenkirjoituksen sisältä, ei myöskään se joka sen teki.

Toinen hinta etenee päinvastaiseen suuntaan kuin miltä ensin näyttää. Tällainen uudelleenkirjoitus ei keksi hälytyksiä. Se raahaa mukanaan sen mitä tiedostossa jo istui. Riski ei siis ole ne neljä väärää hälytystä jotka jouduin kuittaamaan. Riski on se että aito ongelma jollakin minun 326 todellisesta rivistäni olisi saapunut samalle listalle kuuden viikon takaisten kanssa, erottumattomana niistä. Olin jo kuitannut kaikki neljä kohinana, ja viides olisi mennyt ulos niiden mukana.

Korjaus ei ollut normalisoida repositoriota. Täällä ei ole `text=auto`-sääntöä ja puu on aidosti sekalainen. `config.py` on CRLF ja `pipeline.py` on LF, joten kattava muunnos olisi toistanut saman lukukelvottoman diffin kymmenissä tiedostoissa kerralla. Sääntö on tiedostokohtainen, sen mukaan mitä kunkin tiedoston oma historia jo sanoo. Palautin sen yhden CRLF:ksi. Diff kutistui 3804 rivistä 326:een ja hälytysten kohdistus korjautui itsestään.

Sen tarkistaminen että kohdistus oli korjautunut paljasti jotain muuta. CodeQL raportoi yhä konfiguraatiosta jota se ei löytänyt, jokaisessa avoimessa pull requestissa eikä vain minun. Aiempi oma muutokseni oli nimennyt analyysikategorian uudelleen, ja masterissa on yhä analyyseja rekisteröitynä vanhalla nimellä jota mikään työnkulku ei enää tuota. GitHub vastaa siihen kieltäytymällä päättelemästä lainkaan mitkä hälytykset pull request toi. Mikään ei ollut punaisena, koska kyseinen tarkistus ei ole pakollinen ja molemmat analyysityöt menevät läpi. Juuri niin se pysyi hiljaisena. Se on yhä auki.

Kaiken tämän alla ollut pull request käsitteli työkalua joka kieltäytyy luottamasta omaan onnistumisviestiinsä. Se kirjoittaa asetuksen, käynnistää kontin uudelleen, ja lukee sitten arvon takaisin ajossa olevan prosessin sisältä sen sijaan että uskoisi riviä jossa lukee `Started`. Olin vähällä julkaista sen diffin sisällä joka kertoi väärin mitä se sisälsi.
