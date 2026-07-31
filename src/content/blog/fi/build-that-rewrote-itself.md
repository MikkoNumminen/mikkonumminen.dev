---
title: Build-vaihe, joka kirjoitti jatkuvasti uudelleen tiedoston, jota se ei ollut muuttanut
description: Skills-rekisterin PDF generoitiin uudelleen jokaisella buildilla, mikä tuotti likaisen working treen ja merkityksettömän binäärisen diffin.
date: 2026-07-20
locale: fi
slug: build-that-rewrote-itself
project: portfolio
aiGenerated: true
hasAudio: false
tags: ['build', 'skills-pdf']
---

Skills-rekisterin PDF on commitoitu repositorioon, ja build generoi sen uudelleen joka ikinen kerta. Koska renderöijä ei tuota tavulleen samaa lopputulosta ajojen välillä, tämä tarkoitti, että jokainen build jätti muokatun binääritiedoston working treehen. Diffi ei kantanut mitään informaatiota. Se oli vain kohinaa, joka piti joko commitoida tai heittää pois jokaisen ajon jälkeen.

Korjaus oli laskea hajautusarvo niistä asioista, joista PDF todella riippuu, ja ohittaa renderöinti, kun hajautusarvo täsmää siihen, mikä tuotti olemassa olevan tiedoston. Periaatteessa suoraviivaista. Osa, joka vaati toisen kierroksen, oli itse cache-avain, joka aluksi kattoi vain sisältösyötteet. Myös Chromen tulostusvalitsimet muuttavat lopputulosta jättäen sisällön koskemattomaksi, joten lipukkeen muutos olisi jäänyt huomiotta hiljaisesti ja vanhentunut PDF olisi säilynyt. Nuo valitsimet ovat nyt osa avainta.

Samasta työstä seurasi kaksi pienempää asiaa. Olemassaolotarkistus ennen välimuistiin tallennetun tiedoston lukemista korvattiin pelkällä lukemisella ja puuttuvan tiedoston virheen käsittelyllä, koska tarkistuksen ja lukemisen välisessä raossa voi tapahtua mitä tahansa. Ja PDF sai gitattributes-merkinnän, joka merkitsee sen binääriseksi, mikä estää gitiä yrittämästä rivipohjaista diffiä siihen. Sen olisi pitänyt olla siellä alusta asti.

Lähellä oli myös laskentavirhe, jolla ei ollut mitään tekemistä välimuistin kanssa. Rekisterissä on yksi merkintä, joka on uudelleenohjaus eikä varsinainen skill, ja se oli laskettu mukaan kannen lukuun. Aggregaatit johtavat nyt aktiivisen määrän per-skill-lipuista ja sulkevat uudelleenohjaukset pois, joten kannen numero on 33 eikä 34.
