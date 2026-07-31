---
title: 'Kiinnitykset kattoivat vain yhden oven'
description: 'Jokainen agenttini oli kiinnitetty halpaan malliin. Sitten löysin toisen tavan käynnistää agentti, jossa kiinnitykset eivät koskaan olleet päteneet.'
date: 2026-07-26
locale: fi
slug: the-pins-only-covered-one-door
project: claude-agents
aiGenerated: true
hasAudio: false
tags: ['Claude Code', 'agents', 'cost-routing', 'workflows']
---

Viisi päivää sitten tarkistin, pyörivätkö cost-routing-agenttini todella niillä malleilla, joihin olin ne kiinnittänyt. Pyörivät. Luin mallin, joka oli tallennettu todellisiin API-vastauksiin, en käyttöliittymän merkintää, ja jokainen kiinnitys piti. Sen verran oli totta. Lause, jonka rakensin sen päälle, oli suurempi kuin se, minkä olin mitannut.

Kiinnitykset elävät frontmatterissa, yksi tiedosto agenttia kohden, ja Agent tool kunnioittaa niitä. Se on vain yksi tapa käynnistää subagentti. Workflow-skripti jakaa työtä `agent(prompt, options)`-kutsuilla, ja ne kulkevat eri koodipolkua. Kutsu, joka ei nimeä mallia, saa geneerisen työntekijän, joka perii sen sijaan orkestroivan session mallin ja effortin.

Joten samaan aikaan kun vahvistin, että scout pyöri Haikulla, review-workflowni jakoivat työtä kymmenkunnalle agentille kerrallaan, ja jokainen niistä pyöri sillä, mikä sattui olemaan session malli. Se oli Opus korkealla effortilla, koska sen olen asettanut sille työlle, jonka tarkoituksella pidän pääsessiossa.

Mikään ei ilmoittanut tästä. Se näkyy vain yhdessä paikassa, kunkin agentin omassa metadatassa, jossa tyyppinä lukee workflow-subagent agentin nimen sijaan. Viisi review-workflow'ta oli mennyt sillä tavalla. Yhteensä ne kuluttivat suunnilleen 3,8 miljoonaa tokenia orkestraattorin hinnoilla, eivätkä arvostelut olleet siitä viisi kertaa parempia.

Korjauksia oli kolme. Aukko on nyt kirjattu README:en, koska seuraava, joka kompastuu siihen, olen minä. Kaksi uutta agenttia, reviewer ja refuter, antavat review-fan-outille jotain halpaa, johon osoittaa: yksi katsaus diffiin Sonnetilla, yksi adversariaalinen läpikäynti per löydös Haikulla. Ja opt-in-hook lukee workflow-skriptin ennen kuin se ajetaan ja nimeää kutsut, jotka eivät kiinnitä mitään.

Hook on tahallaan vain varoittava. Se palauttaa koodin, joka nostaa viestin näkyviin, ei koodia, joka estäisi kutsun, koska perintä on joskus oikea vastaus. Lopullinen synteesivaihe yleensä haluaakin session mallin. Tarkoitus on tehdä valinta näkyväksi, ei tehdä sitä puolestasi.

Se oli myös kolmesti väärässä ennen kuin se oli oikeassa, tavoilla, joita omat testini eivät olleet osanneet kysyä. Se löytää kutsut skannaamalla tekstiä, joten kiinnittämätön kutsu, jonka promptissa sattui olemaan sanat model:, tulkittiin kiinnitetyksi, sisäkkäinen kutsu antoi sisemmän kiinnityksen todistaa ulomman puolesta, ja regex, jossa oli merkit agent(, laskettiin itsessään kutsuksi. Kaikki kolme johtuivat siitä, että koko kutsua käsiteltiin koodina. Nyt se tyhjentää ensin merkkijonot, template literalit, kommentit ja regex-literaalit, ja laskee sulkeet siitä, mitä jää jäljelle.

Sitten ajoin sen uudelleen kaikkia 85 workflow-skriptiä vasten, jotka ovat tällä koneella kuukausien todellisesta työstä. Se merkitsi 73 ja jätti loput 12 rauhaan, ja kaikki 12 ovat aidosti kiinnitettyjä. Se ei siis ole hypoteettista. Se olisi lauennut suuren enemmistön kohdalla kaikista workflow'ista, joita olen koskaan ajanut, mukaan lukien kaikki viisi kallista.

Agentit, hook ja porrastus, joka päättää, mikä reititetään minne, ovat julkisia osoitteessa [github.com/MikkoNumminen/claude-agents](https://github.com/MikkoNumminen/claude-agents). Myöhemmin instrumentoin istunnon nähdäkseni, maksavatko halvat tasot itsensä takaisin, ja kokosin sen, minkä pystyin mittaamaan ja minkä en, [lyhyeksi raportiksi](/fi/blog/do-the-cheap-agents-pay-for-themselves).

Viime kerralla opetus oli, että merkintä ei ole mittaus. Tämä istuu aivan sen vierellä. Olin mitannut yhden oven huolellisesti ja kuvaillut sitten koko rakennuksen. Kiinnitys, joka kattaa yhden koodipolun, on täsmälleen yhden koodipolun arvoinen, ja kaikki sen jälkeen oli omaa yleistystäni todesta tuloksesta.
