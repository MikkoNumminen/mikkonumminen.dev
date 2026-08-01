---
title: 'Maksavatko halvat agentit itsensä takaisin?'
description: 'Seitsemän instrumentoitua delegointia, kolme aitoa löytöä, yksi hylkäämäni suositus ja luvut, joita en julkaise.'
date: 2026-07-26
locale: fi
slug: do-the-cheap-agents-pay-for-themselves
project: claude-agents
aiGenerated: false
hasAudio: true
tags: ['measurement', 'agents', 'cost-routing']
---

Seitsemän delegointia yhdestä työsessiosta, instrumentoituna. Mitä kustannusreititys todella osti, ja luvut, joita kieltäydyn julkaisemasta.

Ajan Claude Codelle joukkoa kustannusreitittäviä subagentteja. Jokainen on kiinnitetty halvimpaan mallitasoon, joka pystyy sen työhön, ja orkestroivan session on määrä pitää itsellään vain se työ, joka vaatii harkintaa. En ollut koskaan tarkistanut, maksaako järjestely todella itsensä takaisin.

Joten instrumentoin yhden työsession. Seitsemän delegointia kahden repon yli, kaikki aitoa työtä: pull requestien katselmointia, agenttimääritysten kirjoittamista, blogikirjoituksen kääntämistä, korpuksen kartoitusta, ei mittaamista varten rakennettua vertailutestiä.

## Pääluvut

- **Delegointeja**: 7
- **Tokeneita, Haiku-taso**: 231 369
- **Tokeneita, Sonnet-taso**: 92 457
- **Tokeneita yhteensä**: 323 826
- **Agenttien tekemiä työkalukutsuja**: 122
- **Agenttien kelloaika**: 22,9 min
- **Kustannus delegoituna, yläraja**: 2,08 $
- **Samat tokenit Opus 5:n hinnoilla, yläraja**: 8,10 $
- **Delegoitu kustannus osuutena siitä**: 26 %

*Kuva 1, saman 323 826 tokenin kustannus.* Delegoituna 2,08 $. Kaikki Opus 5:n hinnoilla 8,10 $.

Molemmat kustannusluvut ovat ylärajoja, koska ajoympäristö raportoi agenttia kohden yhden tokenien kokonaismäärän eikä syöte/tuloste-jakoa, ja veloitin jokaisen tokenin korkeamman tulostehinnan mukaan. Todelliset luvut ovat matalampia, ja niiden suhde pysyy suunnilleen samana, koska syötteen ja tulosteen hintasuhde on 1:5 kaikilla kolmella tasolla.

## Hintaero on kapeampi kuin premissi, jolle se rakennettiin

Repon oma myyntipuhe on "lakkaa maksamasta Opus-hintoja työstä, jonka halvempi malli tekee aivan yhtä hyvin". Se kehystys on peräisin Opus 4.1:n ajalta hinnoilla 15/75 $ miljoonalta tokenilta, jolloin Haiku oli viidestoistaosa hinnasta. Se ei enää pidä paikkaansa.

- **Claude Opus 5**: 5 $ syöte, 25 $ tuloste
- **Claude Sonnet 5**: 2 $ syöte, 10 $ tuloste, kaksi viidesosaa Opus 5:stä
- **Claude Haiku 4.5**: 1 $ syöte, 5 $ tuloste, yksi viidesosa Opus 5:stä

Delegointisäästöjen katto on nyt **5x**, ja vain Haiku-tasolla. Sonnet-työ säästää 60 %, ei 87 %. Mikä tahansa väite, joka nojaa "noin viisitoista kertaa halvempaan", lainaa poistunutta hinnoittelua.

On olemassa toisen kertaluvun vaikutus, joka osoittaa toiseen suuntaan. Opus 5 ja Sonnet 5 käyttävät uudempaa tokenisoijaa, joka Anthropicin oman dokumentaation mukaan "tuottaa noin 30 % enemmän tokeneita samasta tekstistä"; Haiku 4.5 on sitä vanhempi. Haiku-agentin tokenimäärä ja Opus-orkestroijan tokenimäärä eivät siis ole samoissa yksiköissä, ja sama työ maksaa Opuksella enemmän tokeneita. Se leventää todellista eroa yli 5x:n. En aio julkaista yhdistettyä kerrointa: valmistajan arvion kertominen hintasuhteella ja lopputuloksen ilmoittaminen kolmen numeron tarkkuudella olisi juuri sitä valheellista tarkkuutta, jonka välttämiseksi tämänkaltainen raportti on olemassa.

## Mitä en pysty mittaamaan enkä aio arvioida

Luku, jonka kaikki haluavat, on "paljonko delegointi säästi". En pysty tuottamaan sitä rehellisesti.

Säästön laskemiseksi minun pitäisi tietää, mitä sama tehtävä olisi maksanut, jos olisin tehnyt sen itse sessiossa, eikä minulla ole mittaria omalle tokenikulutukselleni. Pahempaa: näiden kahden polun ero menee toiseen suuntaan kuin ihmiset olettavat. Subagentti aloittaa kylmiltään ja lukee uudelleen kontekstin, joka orkestroijalla jo on, joten se voi kuluttaa samaan tehtävään *enemmän* tokeneita, ei vähemmän. "Tokenit halvemmalla hinnalla" on siksi vertailu mitatun ja kuvitellun luvun välillä.

Se, minkä voin todeta, on kapeampi ja totta: **tämän työn tekeminen halpojen agenttien kautta maksoi korkeintaan 2,08 $.** Se, voittaako se vaihtoehdon, on mittaamatta.

## Laatu on todellinen kysymys, ja se jakautuu kolmeen

Kustannuksella on merkitystä vain, jos tuotos on käyttökelpoinen. Kuutta seitsemästä tuotoksesta käytettiin: niitä kolmea, jotka löysivät jotain, ja niitä kolmea, jotka tuottivat käyttökelpoista työtä ilman itsenäistä löytöä. Yhtä näistä kolmesta käyttökelpoisesta tuotoksesta, alla kuvattua A/B-uudelleenkirjoitusta, käytettiin yhdistelmänä eikä sellaisenaan, mutta se päätyi julkaistuun dokumenttiin. Seitsemäs, saavutettavuuskatselmointi, on ainoa, jonka suosituksen hylkäsin suoralta kädeltä.

Tässä on erittely, joka todella ratkaisee, ansaitseeko reititys paikkansa.

*Kuva 2, kunkin delegoinnin lopputulos (n = 7).*

- **Löysi jotain, mikä minulta oli jäänyt huomaamatta**: 3, kaikki käytettiin
- **Käyttökelpoinen tuotos, ei itsenäistä löytöä**: 3, kaikki käytettiin, yksi yhdistelmänä
- **Nettonegatiivinen, oikea havainto mutta hylätty suositus**: 1, ei käytetty

Nuo kolme löytöä ovat delegoinnin puolustus, eikä yksikään niistä ollut sellainen, jonka olisin itse huomannut:

- **Vanhentunut välimuistiin jäänyt mittaus.** Alatunnisteen sijoituskorjauksen oikeellisuuskatselmointi huomasi, että alatunnisteen sijainti dokumentissa mitattiin liitoshetkellä ja päivitettiin vain `resize`-tapahtumassa, joten myöhään latautuva kuva tai vaihtunut verkkofontti siirtäisi alatunnistetta ilman että näkymän koko koskaan muuttuu, jolloin korjaus kohdistuisi sinne, missä alatunniste ennen oli. Olin kirjoittanut sen koodin ja varmistanut sen. En ollut ajatellut uudelleenladontaa.
- **Väärä positiivinen omassa tunnistimessani.** Katselmointi hookista, jonka olin kirjoittanut ja joka etsii workflow-skripteistä kiinnittämättömiä agenttikutsuja, löysi, että regex-literaali, jossa luki `agent(`, tulkittiin oikeaksi kutsuksi, koska maskaus kattoi merkkijonot ja kommentit mutta ei regexejä.
- **Väärä premissi itse tehtävässä.** Korpuksen tiedustelu paljasti, ettei sivuston blogihakemistoa indeksoida lainkaan; korpus lukee kokonaan eri puuta. Olin juuri päivittämässä vääriä tiedostoja.

## Se, joka tuli minulle kalliiksi

Saman alatunnistemuutoksen saavutettavuuskatselmointi raportoi, ettei `prefers-reduced-motion` vaimentanut uutta muunnosta, mikä altisti liikeherkät käyttäjät uudelleensijoittelulle vieritettäessä.

Hylkäsin sen, ja hylkääminen vaati täyden varmistuskierroksen: kolmen tyylitiedoston lukemisen sen toteamiseksi, että muunnos on siirtymätön kaikissa kolmessa paikassa, joissa se esiintyy, tarkoituksella, jottei se jäisi vierityksestä jälkeen, mikä tekee siitä 1:1 vieritykseen sidottua sijoittelua, samaa luokkaa kuin `position: sticky`, eikä sitä animaatiota, johon poikkeus kohdistuu. Sen vaimentaminen olisi palauttanut alkuperäisen bugin juuri niille käyttäjille, joita poikkeus palvelee.

**Varmistettu vähennetyn liikkeen tilassa.** Tuon päättelyn julkaiseminen ratkaistuna olisi ollut sama virhe, jonka välttämiseksi tämä raportti on olemassa, joten menin mittaamaan sen. Kun ajoin oikeaa sivua Chromessa `prefers-reduced-motion: reduce` emuloituna, muunnosta *ei* vaimenneta: sivun muu sisältö nousee edelleen alatunnisteen koko korkeuden verran, 0:sta −90 pikseliin koossa 884×900, samoin kuin sessiossa, jossa asetusta ei ole. Agentin tosiasiahavainto oli oikea. Mittaus osoittaa myös, ettei liike ole animaatiota: muunnoksen laskettu `transition-duration` on `0s` molemmissa paikoissa, ja kun dokumentin viimeiset 200 pikseliä käydään läpi 20 pikselin askelin, jokaista 20 pikselin vieritystä kohden tulee täsmälleen −20 pikseliä vastasiirtymää, alkaen vasta kun alatunniste tulee näkymään ja pysähtyen kun se asettuu. Ei pehmennystä, ei ylitystä, ei omaa liikettä.

Havainto oli siis oikea ja kumoamiseni premissi pitää. Niiden väliin jää harkintakysymys: onko 1:1 vieritykseen sidottu uudelleensijoittelu sellaista "liikettä", jolta vähennettyä liikettä pyytävä käyttäjä pitäisi säästää. Luen sen sijoitteluksi enkä animaatioksi, samaan luokkaan kuin `position: sticky`, ja olen edelleen sitä mieltä, että sen vaimentaminen vahingoittaisi juuri niitä käyttäjiä, joita se väittää suojelevansa. Se tulkinta on tulkinta eikä ratkaistu WCAG-raja, enkä aio esittää sitä sellaisena.

Siksi lopputuloserittely kutsuu tätä delegointia oikeaksi havainnoksi hylätyllä suosituksella eikä vääräksi löydöksi. Aiempi merkintä liioitteli sitä, minkä olin osoittanut. Se oli silti nettonegatiivinen: löydön varmistaminen maksoi enemmän kuin se tuotti, ja varmistustyö osui kalliille mallille. Suhteessa 1:7 se on siedettävää. Ilmaista se ei ole.

## A/B: kumpikaan versio ei voittanut

Yhden tehtävän tein kahdesti, korpusdokumentin uudelleenkirjoituksen, kerran Sonnetille delegoituna ja kerran itse, identtisestä toimeksiannosta.

Kumpikaan ei ollut parempi. Delegoitu versio valitsi kaksi osaotsikkoa, jotka löytyvät haussa paremmin kuin omani (`The workflow-inheritance gap` voittaa proosamaisen vaihtoehtoni dokumentissa, joka paloitellaan ja upotetaan) ja sai avauskappaleeseen käsitteen, jonka olin unohtanut. Minun versioni paloittui paremmin, koska olin jakanut kaksi uutta agenttikuvausta omaan alalukuunsa siinä missä delegoitu versio ahtoi ne yksittäisiin ylisuuriin luetelmakohtiin, ja se oli täsmällisempi yhden tunnisteen kohdalla.

Julkaistu dokumentti on yhdistelmä, minkä vuoksi tämä delegointi lasketaan yllä olevassa erittelyssä käytetyksi, vaikka mikään siitä ei mennyt julkaisuun muokkaamattomana. Delegoitu kustannus tuolle luonnokselle: 23 746 tokenia, kolme työkalukutsua, 27 sekuntia. Keinona hankkia toinen kokonainen luonnos, jonka kanssa väitellä, se on halpa. Tapana hankkia valmis dokumentti se ei ollut, ja kehystys, joka kohtelee delegointia muodossa "ota tuotos vastaan ja käytä se", on väärä malli.

## Missä reitityssääntö pettää

Sääntö, jota noudatan, nimeää selvät kynnykset: kolmen tai useamman tiedoston haku menee tiedustelijalle, sama muokkaus kolmessa tai useammassa tiedostossa menee mekaanikolle. Tämän session aikana osuin tapaukseen, joka täytti kynnyksen ja jossa sen noudattaminen olisi ollut väärin: kolme yhden rivin korjausta kolmeen korpustiedostoon, joissa riittävän täsmällisen toimeksiannon kirjoittaminen olisi kestänyt kauemmin kuin muokkausten tekeminen.

On olemassa lattia, jonka alapuolella delegointi maksaa enemmän kuin se säästää, eikä nykyinen sääntö ilmaise sitä. Kynnyksen pitäisi luultavasti olla konjunktio: kolme tai useampi tiedosto **ja** riittävä täsmällisyys, jotta toimeksianto on lyhyempi kuin työ.

## Rajoitukset

- **n = 7.** Yksi sessio, yksi orkestroijamalli, kaksi repoa, yksi tekijä. Mikään näistä luvuista ei ole yleistettävä osuus; 1:7:n hylättyjen suositusten luku voisi yhtä hyvin olla 1:3 tai 1:20.
- **Yksi raja saavutettavuustapauksessa on tulkinnanvarainen**, ei mitattu. Käyttäytyminen on mitattu; se, onko kyseessä vika, on minun lukutapani.
- **Vastaskenaario puuttuu rakenteellisesti**, kuten yllä kuvattiin. Säästöä ei väitetä.
- **Lopputulosten arvostelu on minun**, ja arvostelin työtä, jonka olin itse tilannut. "Löysi jotain, mikä minulta oli jäänyt huomaamatta" on tarkistettavissa niistä commiteista, jotka se tuotti; "käyttökelpoinen tuotos" on harkintakysymys.
- **Kustannukset ovat ylärajoja**, syötetokenit veloitettuna tulostehinnoilla.

## Sivulöydös, joka painaa raporttia enemmän

Kaikki edellä mittaa niitä delegointeja, jotka tein tarkoituksella. Niitä mitatessani löysin toisen koodipolun, jossa kiinnityksiä ei ollut koskaan sovellettu lainkaan. Workflow-skripti jakaa työtä omilla `agent()`-kutsuillaan, ja kutsu joka ei nimeä mallia ei saa kiinnitettyä agenttia: se saa yleisen työntekijän, joka perii orkestroivan session mallin ja effortin. Sessiomallini on Opus korkealla effortilla, koska sitä pidän päälangalla. Jokainen kiinnittämätön fan-out oli ajettu siellä.

Mikään ei ilmoittanut tästä. Se näkyy vain yhdessä paikassa, kunkin agentin omassa metatiedossa, jossa tyyppinä lukee `workflow-subagent` agentin nimen sijaan, ja juuri sinne satuin katsomaan kerätessäni tähän raporttiin delegointikohtaisia tokenimääriä. Olen kirjoittanut tuon tarinan erikseen tekstiin [Kiinnitykset kattoivat vain yhden oven](/fi/blog/the-pins-only-covered-one-door).

Lasku jättää varjoonsa sen, jota tämä raportti lähti mittaamaan. Tämän repon workflow-subagenteista orkestroijatason kutsut muodostavat **3 755 242 tokenia** samalla syöte-plus-tuloste-perusteella, jota käytetään kaikkialla muualla täällä. Opus 5:n hinnoilla ja samalla ylärajakäytännöllä, jossa jokainen token veloitetaan 25 $/M tulostehinnalla, se on **93,88 $, yläraja**. Ne seitsemän tarkoituksellista delegointia, joista tämä raportti kertoo, maksoivat 2,08 $. Polku, jota en katsonut, maksoi noin neljäkymmentäviisi kertaa niin paljon kuin se, jota katsoin.

Tämä raportti julkaistaan myös PDF-muodossa, [sama dokumentti samasta markdownista renderöitynä](/agent-delegation.pdf).

Korjaus on kolme asiaa: puute on kirjattu repon README-tiedostoon, kaksi katselmoinnin muotoista agenttia antaa fan-outille halvan kohteen, johon osoittaa, ja valinnainen hook lukee workflow-skriptin ennen sen ajoa ja nimeää kutsut, jotka eivät kiinnitä mitään.

## Mitä muutin tämän seurauksena

Porrastukseen en koskenut. Näyttö tukee sitä: kolme itsenäistä löytöä 2,08 dollarilla on hyvä vaihtokauppa jo ennen mitään kustannusvertailua, ja se yksi hylätty suositus oli halpa hylätä.

Yksi asia muuttui yllä olevan sivulöydöksen lisäksi. Repon dokumentaation hintaväite korjataan, koska "Opus-hinnat" tarkoittaa nyt 5x:n eroa ja vanha kehystys liioittelee sitä hiljaisesti.
