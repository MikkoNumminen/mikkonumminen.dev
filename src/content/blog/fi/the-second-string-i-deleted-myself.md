---
title: 'Toisen merkkijonon poistin itse'
description: 'Julkaisubuildi kuoli poistettuun ffmpeg-tiedostonimeen, ja päivityspaneeli tyhjeni, kun poistin itse otsikon, josta sen lukija alkoi.'
date: 2026-08-19
locale: fi
slug: the-second-string-i-deleted-myself
project: audiobookmaker
aiGenerated: true
hasAudio: false
tags: ['build', 'ops']
---

AudiobookMakerin julkaisubuildi kuoli tässä kuussa 404-virheeseen latausvaiheessa, eikä julkaisua syntynyt. AudiobookMaker on Windows-sovellus, joka muuntaa PDF- ja EPUB-tiedostot äänikirjoiksi puhesynteesillä, ja julkaisubuildi lataa ffmpegin kolmannen osapuolen build-reposta tarkalla tiedostonimellä `ffmpeg-n7.1-latest-win64-gpl-7.1.zip`. Se projekti poistaa vakaan linjan, kun se siirtyy eteenpäin, ja eräänä päivänä se siirtyi. Tiedostoa ei enää ollut. Suoraan sen vaiheen yläpuolella istui kommentti, joka pyysi ohikulkijaa päivittämään kiinnityksen, kun se päivä koittaa. Kukaan ei koskaan päivittänyt.

Korjaus lataa ensin checksum-tiedoston, koska se on sekä eheystarkistus että lista siitä, mitä on oikeasti olemassa. Jos kiinnitetty nimi puuttuu listalta, buildi ottaa uusimman vakaan Windows-buildin, jonka manifesti listaa, ja varoittaa äänekkäästi, että kiinnitys pitää päivittää. Lataus varmennetaan julkaistua hashia vasten aivan kuten ennenkin. Testasin molemmat polut elävää manifestia vasten: kiinnitys ratkeaa tänään, ja ilman sitä varapolku valitsee seuraavan version.

Toisen vian tein itse. Julkaisumuistiinpanot olivat ennen kovakoodattuina CI-workflow'n sisällä, joten jokainen julkaisu ensimmäisen jälkeen lähti maailmalle väärää julkaisua kuvaavilla teksteillä. Siirsin ne tiedostoon repoon, ja siirrossa katosi kirjaimellinen `### What's new` -otsikko. Nykyiset käyttäjät päivittävät sovelluksen sisäisellä napilla, ja sen vieressä on "mitä muuttui" -paneeli, jonka sovellus rakentaa julkaisumuistiinpanoista. Paneelin lukija alkoi täsmälleen siitä otsikosta ja pysähtyi seuraavaan otsikkoon, oli se mikä tahansa. Otsikko poissa, paneeli tyhjä. GitHubin sivulla muistiinpanot näyttivät täydellisiltä. Vain sovellus näki tyhjää. Huomasin sen vain siksi, että katsoin, mitä sovellus renderöi, enkä sitä, mitä GitHub näyttää.

Sitten kävi huonommin vielä kolme kertaa, joka kerta edellisen korjauksen sisällä. Käskin lukijan pysähtyä jokaiseen otsikkoon, joka alkaa sanalla "Installation" tai "CLI". Tämä projekti toimittaa CLI:n. Rehellisesti nimetty osio "CLI gets a resume flag" olisi laskettu asennusosioksi, ja kaikki sen jälkeinen olisi kadonnut. Lisäsin loppumerkin mutta jätin vanhan arvailun pyörimään sen rinnalle. Tavallinen `---`-rivi katkaisi muistiinpanot yhä kesken. Tein merkistä ainoan lopettajan, ja julkaisu, jonka merkki katosi, näytti käyttäjälle asennusohjeet ja SHA-256-hashin uutisina. Henkiin jäänyt versio: asennusotsikot lopettavat muistiinpanot aina, ja heikommat merkit lasketaan vain, kun eksplisiittistä merkkiä ei ole. Joka kierroksella luin uudelleen kaikki kymmenen jo julkaistua julkaisutekstiä, koska juuri niitä asennetut sovellukset jäsentävät. Vanhemman version käyttäjillä paneeli kasvoi 0 merkistä 372:een.

Molemmilla korjauksilla on sama muoto. Jokin nojasi hiljaa tarkkaan merkkijonoon, ja eräänä päivänä merkkijono oli poissa. Ensimmäisen poisti vieras. Toisen poistin itse, omasta sovelluksestani.
