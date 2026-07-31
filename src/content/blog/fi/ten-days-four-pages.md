---
title: Kymmenen päivää, neljä sivua
description: Rakensin tämän sivuston jokaisen sivun uudelleen kymmenessä päivässä. Etusivu on nyt yksi 24 000 partikkelin kenttä, ja nimeni on tehty niistä.
date: 2026-07-31
locale: fi
slug: ten-days-four-pages
project: portfolio
aiGenerated: true
hasAudio: false
tags: ['three.js', 'design']
---

Rakensin tämän sivuston jokaisen sivun uudelleen noin kymmenessä päivässä. Kerron, mitä muuttui, sivu sivulta, ihmisille, joita ei kiinnosta, mikä shader on.

## Etusivu

Etusivuun meni suurin osa noista kymmenestä päivästä, ja se on muutos, jonka näyttäisin ensimmäisenä.

Ennen siellä oli kasa tavaraa. Nimeni seisoi ylhäällä paksuina 3D-kirjaimina, kromin näköisenä, kahdeksan erillisen valon valaisemana. Takana pyöri spiraaligalaksi. Meteorit kiitivät ruudun poikki ja välähtivät osuessaan. Commit-viestit ponnahtelivat esiin satunnaisella ajastimella. Kirjaimissa oli koristeita: M:n päällä vuori lumihuippuineen, O:n ympärillä rengas, ja vuohi. Mukana oli vielä linssiheijastus. Jokainen näistä oli oma järjestelmänsä, ja ne huusivat kaikki toistensa päälle sivun samassa yläosassa. Alapuolella oli tavallinen litteä sivu, ja liukuväri peitti kohdan, josta 3D loppui.

Poistin koko kasan. Tilalle tuli yksi asia: 24 000 partikkelin kenttä, joka peittää koko sivun, on kaiken takana eikä katoa koskaan.

Varsinainen muutos on se, ettei nimeni ole enää tekstiä. Etusivulla ei ole yhtään kirjainta. Kirjaimet piirretään kerran piilotetulle pinnalle, ja partikkeleille kerrotaan, mihin muste osui. Jokainen partikkeli tietää kolme kotia: paikan galaksissa, paikan nimessäni ja paikan tähtitaivaassa, joka jää sivun loppuosan taakse. Vieritys siirtää niitä kodista toiseen: galaksi valuu nimeen, ja alempana nimi hajoaa tähdiksi, jotka seuraavat sinua sivua alaspäin. Vieritä takaisin ylös, ja nimi kokoaa itsensä uudelleen. Sitä osaa minun ei tarvinnut rakentaa erikseen. Ne ovat samat partikkelit matkalla kotiin.

Koska kenttä on maalattu sivun omalla taustavärillä ja peittää kaiken, vanhaa värisaumaa yläosan ja muun sivun välillä ei enää paikata. Sitä ei voi enää ollakaan.

Muodostunut nimi ei ole liikkumaton kuva. Se välkkyy, ja välke syntyy nopeudesta eikä matkasta: kun partikkeleita työntää kauemmas, nimi vain kallistuu, mutta kun niitä liikuttaa nopeammin, se näyttää elävältä. Kirkkauden harjanne kulkee kirjainten yli kahdeksan sekunnin välein. Yksi partikkeli sadasta saa harhailla pois kirjainten muodosta, ja jokainen harhailija viettää poissa noin kolme sekuntia ennen kuin liukuu takaisin omassa tahdissaan. Klikkaa nimeä, niin se ottaa iskun vastaan ja toipuu.

Kursori työntää partikkeleita sivuun. Klikkaus lähettää liikkeelle aallon, ja tämän sivuston oman repositorion commit-viestit nousevat nyt esiin näiden aaltojen mukana ajastimen sijaan. Hehku tietää, mihin katsot: voimakkaimmillaan galaksin kohdalla, rauhallisena valmiin nimen päällä, lähes olemattomana tähtien seassa.

Commitit ovat oikeita, ja ne upotetaan sivustoon koontivaiheessa. Hetken aikaa tuotannossa ne eivät kuitenkaan olleet. Koontijärjestelmä hakee versiohistoriasta vain uusimman commitin, joten kuudenkymmenen commitin pyyntöön tuli vastaukseksi yksi, ja sivu putosi takaisin kovakoodattuun varalistaan. Ominaisuus, joka oli rakennettu näyttämään oikeaa historiaa, näytti ensimmäiset viikkonsa keksittyä historiaa. Nyt se näyttää oikean. Tarkistin. Kahdesti.

Taustalla oli myös mitattu syy. Vanha kasa jäädytti selaimen 306 millisekunniksi, kun se käänsi kymmentä piirto-ohjelmaansa noiden kahdeksan valon alla, ja jäätyminen osui juuri siihen kohtaan, johon kävijän ensimmäinen vieritys tulee. Uusi sivu pitää lyhyttä latausruutua näkyvissä, kunnes se on piirtänyt kaksi sulavaa ruutua peräkkäin. Hinta maksetaan ennen kuin sinut päästetään sisään, ei kesken ensimmäistä elettäsi. Heikolla laitteistolla kenttä harvenee, ja pienillä näytöillä sekä liikkeen vähentämistä pyytäneillä se on liikkumaton kuva.

## Projektit

Tällä sivustolla on pieni aurinkokunta. Sitä voi raahata ja zoomata, ja jokainen planeetta on yksi projekteistani.

Näin oli teoriassa ennenkin. Sitten mittasin. Oletuskameran kohdalla yhdeksän rataa kahdestatoista oli kokonaan kuvan ulkopuolella, joten ruudulla ei koskaan ollut kuin kolme projektia. Pahempaa oli se, että uloszoomauksen raja oli lähempänä kuin uloin rata, joten niihin muihin yhdeksään ei päässyt edes yrittämällä. Olin rakentanut aurinkokunnan ja tehnyt suurimman osan siitä saavuttamattomaksi.

Nyt kaikki kaksitoista näkyvät ruudulla ikkunan muodosta riippumatta, ja jokaisen luo pääsee. Sivusto itse on keskellä aurinkona, ja projektit kiertävät sitä.

Sivu myös käynnistyy paljon nopeammin. Ennen ensimmäinen ruutu jäädytti selaimen 1 159 millisekunniksi, mikä on tarpeeksi kauan, että ehtii miettiä, onko välilehti kuollut. Toiminut korjaus oli tylsä: laske jokaisen planeetan pinta kerran ja käytä sitä uudelleen, sen sijaan, että laskisit joka pikselin uusiksi joka ruudulla. Se poisti jäätymisestä 69 prosenttia. Kaksi itsevarmaa teoriaa kaatui ennen sitä, ja niistä itsevarmempi, piirto-ohjelmien yhdistäminen yhdeksi, pahensi jäätymistä 230 millisekunnilla.

## Kokemus

Etusivun ainoa kilpailija suurimman parannuksen tittelistä on kokemussivun lopussa: yksi kortti, jolla on ne 107 teknologiaa, joita oikeasti käytän, viidessä ryhmässä (kielet, frontend, backend ja data, tekoäly ja kielimallit, alusta). Jokainen rivi aukeaa ja näyttää, mitä sen alla on. Avaa Rust, niin näet kryptografiakirjastot. Avaa Python, niin näet dokumentti- ja puhekirjastot.

Kortissa on kytkin, joka vaihtaa saman tiedon kahden lukutavan välillä: teknologioittain tai projekteittain. Käännä se, ja sama tieto järjestyy kahdeksitoista projektiksi, joista jokainen näyttää, mistä se on rakennettu. Molemmat näkymät tulevat samasta listasta, joten ne eivät voi mennä keskenään ristiin.

Listaa ei myöskään kirjoitettu muistista. Se luettiin viidentoista repositorion oikeista riippuvuustiedostoista koneellani. Sen jälkeen tulosta karsittiin rankalla kädellä. Mallien nimet ja käyttöjärjestelmän apuohjelmat lähtivät. Samoin ne tavalliset kirjastot, joita jokainen kehittäjä maailmassa käyttää. Lista, jossa on mukana pikkujuttuja, saa vakavasti otettavat rivit näyttämään täytteeltä, ja näytän mieluummin 107 riviä, jotka pystyn perustelemaan, kuin 300, jotka näyttävät vaikuttavilta. Pieni work-merkintä kertoo, mitä on käytetty maksetussa asiakastyössä eikä omissa projekteissa.

Sivun loppuosa piirtää työelämäni vuorikiipeilynä, alhaalla 24 vuotta rautakaupan alalla ja huipulla tämä päivä. Ennen se kulki väärinpäin, joten kiipeäminen tarkoitti alaspäin vierittämistä. Nyt se kulkee ylöspäin, niin kuin kiipeäminen yleensä. Ennen sivu myös päättyi viestiin, joka kertoi, että olet päässyt loppuun, ja sen jälkeen tuli vielä kaksi osiota. Nyt lopussa on yksi kortti.

## Yhteydenotto

Viimeinen sivu on terminaali, johon kirjoitetaan. Se vastaa kysymyksiin projekteistani tavallisella kielellä, ja malli, joka vastaukset antaa, pyörii kotonani omalla koneellani, ei minkään yrityksen palvelimella. Kun sillä ei ole lähdettä vastaukseen, se kieltäytyy sen sijaan, että keksisi jotain. Pidän kieltäytymistä ominaisuutena.

Uusin muutos on pieni. Kun se kotikone on hereillä, terminaali kertoo siitä nyt itse, jotta kävijä tietää, että toisessa päässä on jotain, joka ottaa oikeita kysymyksiä vastaan. Ennen vihjeet olivat pieniä ja helppoja ohittaa, ja epäilen, että useimmat kirjoittivat komennon tai kaksi ja lähtivät löytämättä koskaan sitä kiinnostavaa osaa.

## Ympyrä sulkeutuu

Ne neljä sivua ovat nyt keskenään samaa mieltä, ja samaa mieltä ansioluetteloni kanssa, koska ne kaikki lukevat samoista lähteistä eivätkä minun muistikuvistani. Jos joskus haluan väittää osaavani jotain, mitä en osaa, minun pitää ensin väärentää viidentoista repositorion riippuvuustiedostot. Siinä vaiheessa on rehellisesti sanottuna vähemmän työtä opetella se asia.
