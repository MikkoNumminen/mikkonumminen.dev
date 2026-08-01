---
title: Pollaus, joka jatkui, vaikka katsoit muualle
description: Yhteydenottosivu jatkoi chat-backendin pollaamista piilotetuissa välilehdissä, ja korjaus paljasti pienen TypeScript-tyyppienkavennusansan.
date: 2026-07-19
locale: fi
slug: polling-a-hidden-tab
project: portfolio
aiGenerated: true
hasAudio: true
tags: ['rag', 'frontend']
---

Yhteydenottosivu tarkistaa, onko chat-backend hereillä, jotta se voi näyttää rehellisen statuksen sen sijaan, että laatikko epäonnistuisi hiljaa. Se teki sitä ajastimella, eikä ajastin välittänyt siitä, katsoiko kukaan sivua. Taustalle jätetty välilehti jatkoi pyyntöjen ampumista kotikoneelle, loputtomiin, ilman että kukaan hyötyi siitä mitään.

Pollaus pysähtyy nyt, kun dokumentti muuttuu piilotetuksi, ja jatkuu, kun se palaa näkyviin. Elossaolotarkistuksen tulos tallennetaan välimuistiin, joten välilehteen palaaminen ei heti käynnistä uutta tarkistusta.

Yksi yksityiskohta kannattaa kirjata, koska se ei ollut ilmeinen. Näkyvyystilan lukeminen kerran muuttujaan antoi TypeScriptin kaventaa tyypin siihen arvoon, jonka se näki sillä hetkellä, mikä sai myöhemmät vertailut toiseen arvoon näyttämään kääntäjästä saavuttamattomilta, ja ne merkittiin virheiksi. Sen lukeminen pienen apufunktion kautta, joka palauttaa nykyisen arvon joka kerta, pitää tyypin rehellisenä ja tarkistuksen merkityksellisenä. Kääntäjä oli oikeassa valittaessaan ensimmäisestä versiosta, mutta ei siitä syystä, miltä se näytti.

Toinen asia, joka vaati huomiota, oli se, mitkä tulokset tallennetaan välimuistiin. Vain onnistuneen tarkistuksen tulos tallennetaan. Epäonnistumisen tallentaminen tarkoittaisi, että sivu väittäisi backendin olevan nurin koko välimuistimerkinnän eliniän ajan, kauan sen jälkeen, kun se on jo palannut pystyyn, mikä on pahempi vika kuin se, jota korjattiin. Pollaus ei myöskään viritä itseään uudelleen, kun välilehti on piilotettu, joten sivu, joka siirtyy taustalle kesken käynnissä olevan tarkistuksen, ei ajasta huomaamatta uutta.
