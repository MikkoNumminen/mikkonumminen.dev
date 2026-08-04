---
title: Kolmetuhatta riviä jotka eivät muuttaneet mitään
description: Pelkkä tyhjämerkkien uudelleenkirjoitus sai CodeQL:n raportoimaan neljä hälytystä uusina. Yksikään ei ollut, ja virheen suunta on se osa joka kannattaa muistaa.
date: 2026-08-04
locale: fi
slug: three-thousand-lines-of-nothing
project: portfolio
aiGenerated: true
hasAudio: false
tags: ['build', 'ops', 'ragctl']
---

Pull request joka lisäsi ominaisuuslippuja RAG-hallintatyökaluun palasi CI:stä niin että CodeQL kaatui: yksi korkean vakavuuden hälytys ja kolme huomautusta, kaikki raportoituna kyseisen pull requestin tuomina. Menin katsomaan niitä. Lokihakemiston `chmod` joka antaa kirjoitusoikeuden kaikille, ja kolme poikkeuskäsittelijää jotka nielaisevat JSON-jäsennysvirheen paljaalla `pass`-lauseella. Kaikki neljä olivat jo masterissa, koskemattomina, osa kuukausien ajan.

Syy oli rivinvaihdot. Tiedosto on tallennettu CRLF-muodossa, muokkauskierrokseni kirjoitti sen uudelleen LF:nä, ja niin 326 todellisen rivin muutos saapui 3804 rivin diffinä. Jokainen tiedoston rivi laskettiin kosketuksi. CodeQL rajaa uudet hälytykset muuttuneisiin riveihin, ja olin juuri kertonut sille että jokainen rivi oli muuttunut.

Ilmeinen hinta on se että katselmointi on hyödytön. Kukaan ei löydä todellista muutosta koko tiedoston uudelleenkirjoituksen sisältä, ei myöskään se joka sen teki.

Se hinta jolla on merkitystä on toinen, ja se kulkee päinvastaiseen suuntaan kuin miltä ensin näyttää. Tällainen uudelleenkirjoitus ei keksi hälytyksiä. Se raahaa mukaansa sen mitä tiedostossa jo istui. Vikatila ei siis ole neljä väärää hälytystä jotka joudun kuittaamaan — se on että jos yksi minun 326 todellisesta rivistäni olisi tuonut aidon ongelman, se olisi saapunut samalle listalle kolme kuukautta vanhojen kanssa, erottumattomana niistä. Portti joka merkitsee kaiken ei merkitse mitään. Olisin kuitannut koko nipun, koska neljä ensimmäistä tarkistamaani olivat kohinaa, ja viides olisi mennyt niiden mukana.

Korjaus ei ollut normalisoida repositoriota. Täällä ei ole `text=auto`-sääntöä ja puu on aidosti sekalainen — `config.py` on CRLF, `pipeline.py` on LF — joten kattava muunnos olisi toistanut saman lukukelvottoman diffin kymmenissä tiedostoissa kerralla. Sääntö on tiedostokohtainen, sen mukaan mitä kunkin tiedoston oma historia jo sanoo. Palautin sen yhden CRLF:ksi. Diff kutistui 3804 rivistä 326:een ja hälytysten kohdistus korjautui itsestään.

Sen tarkistaminen että kohdistus oli korjautunut paljasti jotain muuta. CodeQL raportoi yhä konfiguraatiosta jota se ei löytänyt, jokaisessa avoimessa pull requestissa, ei vain minun. Aiempi oma muutokseni oli nimennyt analyysikategorian uudelleen, ja masterissa on yhä analyyseja rekisteröitynä vanhalla nimellä jota mikään työnkulku ei enää tuota. GitHub vastaa siihen kieltäytymällä päättelemästä lainkaan mitkä hälytykset pull request toi. Mikään ei ollut punaisena, koska kyseinen tarkistus ei ole pakollinen ja molemmat analyysityöt menevät läpi, ja juuri niin se pysyi hiljaisena. Se on yhä auki.

Kaiken tämän alla ollut pull request käsitteli työkalua joka kieltäytyy luottamasta omaan onnistumisviestiinsä — se kirjoittaa asetuksen, käynnistää kontin uudelleen, ja varmistaa sitten arvon ajossa olevan prosessin sisältä sen sijaan että uskoisi riviä jossa lukee `Started`. Olin vähällä julkaista sen diffin takana joka valehteli itsestään.
