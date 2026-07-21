---
title: Tunneli, joka kaatuu kun kukaan ei katso
description: Vahtikoira Tailscale Funnelille, joka toimii RAG-chatin edessä, ja kaksi tapaa joilla sen ensimmäinen versio oli väärässä.
date: 2026-07-21
locale: fi
slug: funnel-watchdog
aiGenerated: true
tags: ['ragctl', 'ops']
---

Yhteydenottosivun chat pyörii kotikoneella. Liikenne pääsee sinne Tailscale Funnelin kautta, joka on julkinen sisääntulo, joka kartoittaa hostnimen paikalliseen porttiin. Se toimii, kunnes ei toimi, ja vikaantuminen on hiljainen. Tunneli pysyy rekisteröitynä, joten kaikki näyttää olevan kunnossa, mutta se lakkaa välittämästä liikennettä. Ulkopuolelta se näyttää chat-laatikolta, joka ei koskaan vastaa.

Tämä commit-erä lisäsi vahtikoiran, joka tarkistaa reitin säännöllisin väliajoin ja palauttaa sen, kun se on todella vanhentunut. Suurin osa jatkotyöstä oli vahtikoiran korjaamista eikä tunnelin.

Ensimmäinen versio tulkitsi lukukelvottoman statuksen kuolleeksi tunneliksi ja käynnisti uudelleen sen perusteella. Se on väärinpäin. Jos status-komento epäonnistuu omista syistään, uudelleenkäynnistys muuttaa ohimenevän lukuvirheen todelliseksi katkokseksi, jonka vahtikoira itse aiheutti. Sääntö, joka tästä syntyi, on ettei koskaan väitä tilaa, jota ei todellisuudessa pystynyt lukemaan. Funnel-statuksen lukeminen JSON-muodossa printatun tekstin täsmäyttämisen sijaan auttoi tässäkin, koska tekstimuoto oli epäselvä juuri niissä tapauksissa, joissa sillä oli väliä.

Toinen ongelma oli, että tunnelisolmu on jaettu. Muut projektit ajavat omia funneleitaan samalla koneella, joten kaiken, mikä nollaa tai käynnistää uudelleen, täytyy olla rajattu tämän palvelun porttiin. Laaja nollaus olisi kaatanut asiaan kuulumattomia asioita, joilla ei ollut mitään tekemistä chatin kanssa.

Pienempiä korjauksia samalla alueella: vahtikoira suojaa nyt tallennettua pid-arvoaan uudelleenkäytöltä, joten se ei voi päätyä signaloimaan mitä tahansa prosessia, joka on perinyt kyseisen numeron, ja sen pysäyttäminen SIGTERM:llä jättää tunnelisolmun ajoon sen sijaan, että se purkaisi infrastruktuuria, josta muut asiat riippuvat. Uudelleenyhdistämisyritykset on rajoitettu, mikä pääasiassa tarkoittaa, että rikkinäinen tunneli epäonnistuu nyt näkyvästi sen sijaan, että se yrittäisi loputtomasti taustalla.
