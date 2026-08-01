---
title: Sivustoni pyysi ihmisiä asentamaan sen
description: Kaverini selain tarjoutui asentamaan tämän sivuston, ja hän kysyi minulta, mitä se asentaisi. En tiennyt, ja se on huono vastaus, kun kyse on omasta sivustosta.
date: 2026-08-01
locale: fi
slug: asking-people-to-install-it
project: portfolio
aiGenerated: false
hasAudio: false
tags: ['frontend']
---

Kaverini oli tällä sivustolla, ja hänen selaimensa tarjoutui asentamaan sen. Hän kysyi minulta, mitä se asentaisi. En tiennyt. Se on huono vastaus, kun kyse on omasta sivustosta.

Hän oli törmännyt PWA-asennukseen. Sivuston mukana tuli pieni tiedosto nimeltä manifest, joka kertoo selaimelle, että sivustoa voi käyttää kuin sovellusta.

Laitoin sen sinne itse, ja muistan kyllä, miksi. Testasin standalone-nimistä näyttötilaa, jossa sivusto avautuu omaan ikkunaansa ilman selaimen omaa käyttöliittymää. Ei osoitepalkkia, ei välilehtiä, pelkkä sivu. Grafiikka saa enemmän tilaa, ja se näyttää hyvältä. Sitä en tullut ajatelleeksi, että sama tiedosto saa selaimen näyttämään asennusnapin jokaiselle kävijälle.

Tässä on se kohta, joka kannattaa kirjoittaa muistiin. Sivusto ei koskaan kysynyt keneltäkään mitään. Siinä ei ole riviäkään koodia, joka tarjoaisi asennusta. Selain tekee sen ihan itse heti, kun sivu linkittää manifestin. Olin siis esittänyt pyynnön jokaiselle kävijälle, vaikka en ollut koskaan kirjoittanut sitä pyyntöä itse, ja sain tietää siitä vasta, kun joku kysyi minulta asiasta.

Eikä tarjolla ollut edes mitään pyytämisen arvoista. Asennuksesta sai ikkunan ilman osoitepalkkia ja kuvakkeen sovellusvalikkoon. Sivustoa se ei antanut käyttöön ilman verkkoa, koska siihen tarvitaan service worker, eikä tällä sivustolla ole koskaan ollut sellaista. Asenna se, katkaise verkkoyhteys, niin saat eteesi saman dinosauruksen kuin kaikki muutkin.

Nyt se on poistettu. Otan mieluummin osoitepalkin takaisin omille sivuilleni kuin pyydän tuntematonta asentamaan portfolion.
