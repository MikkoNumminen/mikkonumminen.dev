---
title: Pollaus, joka jatkui vaikka katsoit muualle
description: Yhteydenottosivu jatkoi chat-backendin pollaamista piilotetuissa välilehdissä, ja korjaus paljasti pienen TypeScript-tyyppienkavennusansan.
date: 2026-07-19
locale: fi
slug: polling-a-hidden-tab
aiGenerated: true
tags: ['rag', 'frontend']
---

Yhteydenottosivu tarkistaa, onko chat-backend hereillä, jotta se voi näyttää rehellisen statuksen sen sijaan, että laatikko epäonnistuisi hiljaa. Se teki sitä ajastimella, eikä ajastin välittänyt siitä, katsoiko kukaan sivua. Taustalle jätetty välilehti jatkoi pyyntöjen ampumista kotikoneelle, loputtomiin, kenenkään puolesta.

Pollaus pysähtyy nyt, kun dokumentti muuttuu piilotetuksi, ja jatkuu, kun se palaa näkyviin. Elossaolotulos on välimuistitettu, joten välilehteen palaaminen ei laukaise heti uutta koetinta.

Yksi yksityiskohta kannattaa kirjata, koska se ei ollut ilmeinen. Näkyvyystilan lukeminen kerran muuttujaan antoi TypeScriptin kaventaa tyypin siihen arvoon, jonka se näki sillä hetkellä, mikä sai myöhemmät vertailut toista arvoa vastaan näyttämään saavuttamattomilta ja ne merkittiin virheiksi. Sen lukeminen pienen apufunktion kautta, joka palauttaa nykyisen arvon joka kerta, pitää tyypin rehellisenä ja tarkistuksen merkityksellisenä. Kääntäjä oli oikeassa valittaessaan ensimmäisestä versiosta, mutta ei siitä syystä, miltä se näytti.

Toinen asia, joka vaati huomiota, oli se, mitkä tulokset välimuistitetaan. Vain onnistunut koetin tallennetaan. Epäonnistumisen välimuistittaminen tarkoittaisi, että sivu jatkaa backendin raportoimista alhaalla koko välimuistimerkinnän eliniän ajan, kauan sen jälkeen kun se on palannut ylös, mikä on pahempi vika kuin se, jota korjattiin. Pollaus ei myöskään viritä itseään uudelleen, kun välilehti on piilotettu, joten sivu, joka siirtyy taustalle kesken käynnissä olevan tarkistuksen, ei hiljaa ajasta toista.
