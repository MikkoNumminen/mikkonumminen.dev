import type { Translations } from '../types';

export const fi: Translations = {
  meta: {
    home: {
      title: 'Mikko Numminen — full-stack-kehittäjä',
      description:
        'Mikko Nummisen portfolio. Suomesta käsin toimiva full-stack-kehittäjä rakentaa tuotantotason verkkosovelluksia AI-avusteisilla työnkuluilla.',
    },
    contact: {
      title: 'Yhteystiedot — Mikko Numminen',
      description:
        'Ota yhteyttä Mikkoon — interaktiivinen terminaali, sähköposti, linkit ja CV:n lataus.',
    },
    projects: {
      title: 'Projektit — Mikko Numminen',
      description: 'Interaktiivinen aurinkokunta Mikko Nummisen valituista projekteista.',
    },
    experience: {
      title: 'Kokemus — Mikko Numminen',
      description:
        'Kiipeä vuorelle — Mikko Nummisen kokemus, taidot ja virstanpylväät peruslähtöpisteestä tähän hetkeen.',
    },
  },
  nav: {
    home: 'etusivu',
    projects: 'projektit',
    experience: 'kokemus',
    contact: 'yhteystiedot',
    primaryAria: 'Päänavigaatio',
    languageSwitcherAria: 'Kieli',
    skipToContent: 'Siirry sisältöön',
  },
  hero: {
    sectionAria: 'Mikko Numminen — full-stack-kehittäjä',
    eyebrow: 'portfolio · 2026',
    titleSrOnly: 'Mikko Numminen',
    titleFallbackTop: 'MIKKO',
    titleFallbackBottom: 'NUMMINEN',
    subtitle: 'full-stack-kehittäjä · suomi',
    scrollHint: 'vieritä',
  },
  intro: {
    sectionAria: 'Tietoja',
    eyebrow: 'tietoja',
    heading: 'Seitsemän repoa. Ne rakentavat toistensa päälle.',
    body: 'Full-stack-kehittäjä Suomesta. HRM on Platformin arkkitehtuuripohja — Platform on tuotantokäytössä oikealla WoW-killalla osoitteessa vuohiliitto.com. AudiobookMaker tuottaa äänet Spacepotatikseen, tänä vuonna julkaisemaani selainpeliin; strudel-patterns säveltää sen musiikin. Jokainen repo seisoo omillaan — saumat niiden välillä ovat se juju.',
    statTests: 'testiä suurimmassa projektissa',
    statCoverage: 'rivikattavuus',
    statProducts: 'julkaistua projektia',
  },
  focus: {
    sectionAria: 'Miten projektit kytkeytyvät',
    eyebrow: 'kytkennät',
    heading: 'Miten projektit kytkeytyvät yhteen.',
    items: [
      {
        title: 'Reposit syöttävät toisiaan',
        body: 'HRM toimii git-alimoduulina Platformin sisällä — sama tunnistautuminen, sama auditloki, kaksi tuotetta yhdestä ytimestä. AudiobookMaker tuottaa äänet Spacepotatikseen, strudel-patterns sen musiikin. Jokainen repliikki ja jokainen sävel jäljitetään takaisin repoon, jonka omistan itse.',
      },
      {
        title: 'Testattu tai ei lähde',
        body: 'Jokaisella repolla on CI joka pushissa. HRM:ssä 1828+ testiä 91,9 % kattavuudella, Spacepotatiksessa ~1170, AudiobookMakerissa yli 1800. Laatuportit painavat enemmän kuin mahtipontisin teknologiapino.',
      },
      {
        title: 'AI-natiivi, jäljitettävästi',
        body: 'Spacepotatis ajaa kymmentä omaa Claude Code -skilliä .claude/skills/-hakemistossa — versionhallittuja, neljännesvuosittain auditoituja, kuten tuotantokoodia. Tekoäly on osa työkalupakkia; auditointijälki on kuitti.',
      },
    ],
  },
  integrations: {
    sectionAria: 'Ulkoiset integraatiot',
    eyebrow: 'integraatiot',
    heading: 'Kytköksissä maailmaan.',
    items: [
      {
        project: 'Platform',
        api: 'Raider.IO API',
        body: 'Reaaliaikainen Mythic+-tiimiseuranta oikealle WoW-killalle. Rosterit, viimeisimmät retket ja rio-pisteet haetaan tuoreina jokaisella latauksella — ei vanhentuneita ruutukaappauksia. Tunnistautuminen Google- tai GitHub-OAuthilla, lisäksi tunnukseton demo vierailijoille.',
      },
      {
        project: 'ReadLog',
        api: 'Open Library + Google Books',
        body: 'Kaksi kirja-API:a kysellään rinnakkain; tarkemmat tiedot palauttava lähde voittaa. Duplikaatit yhdistetään ennen kuin ne ehtivät käyttöliittymään. Sisäänkirjautuminen Google-OAuthilla.',
      },
      {
        project: 'AudiobookMaker',
        api: 'Microsoft Edge-TTS',
        body: '30+ pilvi-ääntä kuudella kielellä, kahden offline-moottorin (Piper, Chatterbox) lisäksi. Valitse ääni, joka sopii kirjaan.',
      },
      {
        project: 'Spacepotatis',
        api: 'Google OAuth',
        body: 'Sisäänkirjautuminen on vapaaehtoista. Pelaa offline ikuisesti, tai liity mukaan pilvitallennuksiin ja tulostaulun paikkaan.',
      },
    ],
  },
  velocity: {
    sectionAria: 'Kehitysvauhti',
    eyebrow: 'vauhti',
    heading: 'Nopeaa — todistettavasti.',
    body: 'Spacepotatis ehti tyhjästä reposta tuotantoon kahdessa viikossa: 387 commitia, ~1170 testiä, kymmenen auditoitua Claude Code -skilliä, koko Next.js + Phaser 3 + Three.js -pino. Seitsemästä portfoliorepoista kuusi käynnistyi viimeisen kuuden viikon aikana. AI-natiivi ei ole sloganpuhetta — se on matematiikkaa.',
    stats: [
      { num: '12', label: 'päivää tyhjästä reposta Spacepotatis-tuotantoon' },
      { num: '387', label: 'Spacepotatis-commitia' },
      { num: '~1170', label: 'Spacepotatis-testiä menossa läpi' },
    ],
  },
  navCards: {
    sectionAria: 'Tutustu sivuston muihin osiin',
    eyebrow: 'jatka',
    heading: 'Valitse maailma.',
    projects: {
      label: 'Projektit',
      description: 'Tutustu interaktiiviseen aurinkokuntaan projekteistani.',
    },
    experience: {
      label: 'Kokemus',
      description: 'Kiipeä vuorta pitkin läpi taitojen, työkalujen ja saavutusten.',
    },
    contact: {
      label: 'Yhteystiedot',
      description: 'Hyppää terminaaliin ja ota yhteyttä suoraan.',
    },
    footerCopyright: '© 2026 Mikko Numminen',
    footerBuiltWith: 'tehty: astro · three.js · gsap',
  },
  projectsPage: {
    eyebrow: 'Valitut työt',
    title: 'Projektit',
    lede: 'Pieni aurinkokunta rakentamistani projekteista. Vie hiiri planeetan päälle nähdäksesi tiivistelmän, klikkaa lähemmäs.',
    legendHover: 'tutkiaksesi',
    legendClick: 'planeettaa kohdistaaksesi',
    legendDrag: 'pyörittääksesi näkymää',
    legendZoom: 'lähentääksesi / loitontaaksesi',
    detailAria: 'Projektin tiedot',
    closeAria: 'Sulje projektin tiedot',
    techLabel: 'Teknologiat',
    externalApisLabel: 'Integraatiot',
    // "live demo" doesn't translate idiomatically; the Finnish/Swedish UI uses just "demo".
    liveDemo: 'demo →',
    githubLink: 'github',
    gridAria: 'Projektit',
    gridLede:
      'Projektini. Työpöytänäkymässä ne näkyvät interaktiivisena aurinkokuntana — tässä luettavana listana.',
    keyHeading: 'Selitykset',
    keyConnectionsLabel: 'Yhteydet',
    keyExternalDesc: 'kiertävä satelliitti — yhteys ulkomaailmaan',
    connectionKindLabels: {
      submodule: 'alimoduuli',
      voice: 'ääni',
      music: 'musiikki',
    },
  },
  projectsData: {
    hrm: {
      tagline: 'Full-stack-henkilöstöhallintajärjestelmä',
      description:
        'Tuotantovalmis HR-järjestelmä portfoliotasoisella toteutuksella. Kaksi tietokantaa (PostgreSQL rakenteelliselle datalle, MongoDB muuttumattomalle, hajautusketjutetulle auditlokille), 34 käyttöoikeutta käyttäjäkohtaisilla poikkeuksilla, TOTP-kaksivaiheinen tunnistautuminen, palvelinpuolen nopeusrajoitus, OpenTelemetry-jäljitys, 18 kieltä ja reaaliaikaiset toimintailmoitukset SSE:llä (polling-varavaihtoehdolla).',
      highlights: ['1828+ testiä', '91,9 % rivikattavuus', 'PostgreSQL + MongoDB'],
    },
    platform: {
      tagline: 'Yhteisöalusta HRM:n päälle rakennettuna',
      description:
        'Tuotantokäytössä oleva yhteisöalusta oikealle WoW-killalle osoitteessa vuohiliitto.com. Turborepo-monorepo jossa HRM git-alimoduulina. Monen käyttäjäryhmän tuki, WoW-henkinen pelillistäminen (XP, tasot, saavutukset, questit), välilehtipohjainen chatti whispereineen ja slash-komentoineen, Mythic+ -tiimiseuranta Raider.IO API:n kautta ja opastettu tutustumiskierros uusille jäsenille.',
      highlights: ['Oikeita käyttäjiä', 'Monivuokrainen', '1388+ testiä'],
    },
    portfolio: {
      tagline: 'Tämä sivusto',
      description:
        'Sivusto jota katsot nyt. Täysin staattinen, rakennettu Astrolla, Three.js:llä ja GSAP:lla. Visuaalinen näyte animaatio-osaamisesta, tarkoituksella eri teknologiapinolla kuin HRM ja Platform.',
    },
    readlog: {
      tagline: 'Pidä kirjaa jokaisesta lukemastasi kirjasta',
      description:
        'Henkilökohtainen lukupäiväkirja. Hakee kirjatiedot Google Booksista ja Open Librarysta samanaikaisesti, joten kirjan lisääminen on nopeaa — valitset vain formaatin (paperi, e-kirja tai äänikirja) ja milloin luit sen. Etusivulla näkyy mitä muut ovat lukeneet viime aikoina.',
      highlights: ['68 testiä', 'Monilähde-haku'],
    },
    audiobookmaker: {
      tagline: 'PDF → äänikirja',
      description:
        'Työpöytäsovellus joka muuntaa PDF-, EPUB- ja tekstitiedostot äänikirjoiksi. Kolme puhesynteesimoottoria: Edge-TTS (pilvi, 30+ ääntä kuudella kielellä), Piper (offline, ei vaadi GPU:ta) ja Chatterbox "Grandmom"-äänellä äänen kloonaukseen referenssinäytteestä. Sama Chatterbox-moottori ääninäyttelee Spacepotatiksen pelin sisäisen tarinan. Englannin puhesynteesi toimii jo hyvin; suomi on vaikeampi syntetisoida käytettävissä olevilla resursseilla, joten sitä varten on rakennettu 19-vaiheinen normalisointiputki joka hoitaa numeroiden kontekstitaivutuksen, lyhenteiden purkamisen, yksikkösymbolien käsittelyn ja vierassanojen ääntämiskorjaukset — laatu paranee joka julkaisun myötä. Jaetaan Windows-asennusohjelmana automaattipäivityksillä ja 1729 testillä.',
      highlights: [
        'Chatterbox-ääniklooni Grandmom-äänellä',
        '19-vaiheinen suomen kielen normalisointi, 1729 testiä',
        'Antaa äänen Spacepotatiksen tarinalle',
      ],
    },
    spacepotatis: {
      tagline: 'Selainampumapeli — perunasi vastaan galaksi',
      description:
        'Selainpeli, jossa suojakuplaan suljettu peruna ampuu hyönteisiä proseduraalisessa galaksissa. Käynnistyy kuin vanha terminaali, avautuu 3D-aurinkokunnaksi jota voit pyörittää ja zoomata, ja heittää sinut ylhäältä alas vyöryvään taisteluun Tyrian 2000:n hengessä. Next.js 15 + React 19 -kuori Phaser 3 -taistelukentän ympärillä, Three.js + GSAP galaksinäkymässä ja kamerasiirtymässä taisteluun, PostgreSQL Neonissa Kyselyn (tyypitetty SQL-rakentaja, ei ORM:ää) kautta. Kaikki äänet AudiobookMakerin tuottamia, kaikki musiikki kirjoitettu strudel-patterns-repoon. Mukana kymmenen omaa Claude Code -skilliä .claude/skills/-hakemistossa — versionhallittuja, neljännesvuosittain auditoituja, kuten tuotantokoodia.',
      highlights: [
        'Next.js 15 + Phaser 3 + Three.js',
        '~1170 testiä, CI joka pushissa',
        '10 omaa Claude Code -skilliä tuotantotason artefakteina',
      ],
    },
    'strudel-patterns': {
      tagline: 'Algoritminen musiikki Strudelilla',
      description:
        'Live-koodattua elektronista musiikkia Strudelilla — JavaScript-pohjainen kuviomoottori, TidalCyclesin sukulainen. Jokainen kappale on yksi kompostoitavissa oleva ilmaisu: pinoja syntetisaattoreita, bassolinjoja, rumpukuvioita ja efektiketjuja. Sävelletty rakenteistetulla tekoälytyönkululla — luonnollinen kuvaus → generointi → kuuntelu → iterointi, päätökset kirjattu git-historian rinnalle. Valitut kappaleet säestävät Spacepotatista (galaksinäkymä, missioteemat, tarinan kerrontapohja). Uudelleenkäytettävä komponenttikirjasto, kuratoidut syntetisaattoriasetukset, sessiomuistiot iteraatioista.',
      highlights: [
        'Live-koodattu Strudelilla',
        'Tekoälyohjattu iterointi, kirjattuna gitiin',
        'Spacepotatiksen ääniraita',
      ],
    },
  },
  experiencePage: {
    eyebrow: 'kiipeäminen',
    title: 'Kokemus',
    lede: 'Scrollaa vuorta ylöspäin. Jokainen merkki on askel sinne missä olen tänään.',
    scrollHint: 'vieritä',
    kindFoundation: 'perusta',
    kindWork: 'työ',
    kindLife: 'elämä',
    kindProject: 'projekti',
    kindCraft: 'käsityö',
    kindNow: 'nyt',
    summit: 'Saavutit huipun.',
    cta: 'astu terminaaliin →',
    lessonsAriaLabel: 'Tämän luvun opit',
  },
  timelineData: {
    'hardware-retail': {
      title: 'Rautakauppa',
      body: '24 vuotta rautakaupan alalla, pääosin perheyrityksen palveluksessa. Sisustus, remontointi, työkalut, rakentaminen — joka osasto, kaikenlaiset asiakkaat. Se työ joka opettaa mitä käyttäjä oikeasti tarvitsee, ennen kuin laitat ruudun väliin.',
      tags: ['Asiakaspalvelu', 'Perheyritys', '24 vuotta'],
    },
    kasvulabs: {
      title: 'Kasvu Labs Oy',
      body: 'Ensimmäinen palkallinen ohjelmointityö. Node.js-backend, React-frontend, suurten avointen datamassojen parissa. Full-stack-kehitystä, käyttöliittymäsuunnittelua, tietokantahallintaa Azuressa ja tuotteen ylläpitoa.',
      tags: ['Node.js', 'React', 'Avoin data', 'PostgreSQL', 'Azure'],
    },
    father: {
      title: 'Isäksi tuleminen',
      body: 'Jäin pois kokopäivätyöstä perhesyistä. Omat projektit etenivät taustalla.',
    },
    'ai-workflows': {
      title: 'AI-natiivit työnkulut',
      body: 'Agenttilähtöistä, AI-avusteista kehitystä versioituna kurinalaisuutena. Mukautetut Claude Code -skillit menevät repoon tuotantoartefakteina — jokainen opettaa agentille projektikohtaisen reseptin (lisää vihollinen, vie tietokantamigraatio, auditoi tallennusputki) niin että se menee suoraan asiaan eikä grepin sijaan jokaisella kutsulla. Parikoodausta rinnakkaisilla subagenteilla itsenäisten siivujen yli, sen jälkeen tulosten synteesi.\n\nSkillit ovat versionhallinnassa, auditoidaan kvartaaleittain (skillin ja sen viittaaman koodin välinen drift on aito bugiluokka — kaksi oikeaa tällaista löydettiin viime auditoinnissa), ja niitä käsitellään tuotantoartefaktteina. Arvioitu säästö pelkästään Spacepotatiksella: noin 2,76 miljoonaa tokenia vuodessa. Nopeammin tuotantoon ilman että rima laskee.',
      tags: ['Agenttikehitys', 'Mukautetut skillit', 'Subagentit', 'Versioitu työnkulku', 'Vauhti'],
    },
    '2026-build': {
      title: '2026 — rakennusvuosi',
      body: 'Toukokuussa 2026: seitsemän projektia tuotantoon yhden kalenterivuoden sisällä. Stack ja päätökset ovat todistus — alla on se mitä ne opettivat.',
      tags: [
        '7 repoa',
        'Oikeita käyttäjiä',
        'Next.js',
        'Astro',
        'Three.js',
        'Phaser 3',
        'Python',
        'Turborepo',
      ],
      lessons: [
        {
          title: 'Tyrehdytä vuoto. Sitten ajattele. Sitten suunnittele uusiksi.',
          body: 'Vaistoni oli ennen suoraviivainen: rakenteellinen bugi, rakenteellinen korjaus, elegantti ratkaisu tuotantoon, ja kumarrus. Sitten toukokuussa 2026 Spacepotatikseen iski tallennuksen korruptiobugi ja opin oikean järjestyksen kantapään kautta. Palvelinpuolen vahti samana päivänä, pysäyttämään uudet vahingot. Audit-taulu seuraavana päivänä, muuttamaan kivun fakta-aineistoksi jonka voi oikeasti lukea. Arkkitehtoninen korjaus vasta viikon datan jälkeen, kun faktoilla oli muoto. Vaisto joka jäi: lievennä ensin, observoi toiseksi, arkkitehtuuri kolmanneksi — joka kerta, tässä järjestyksessä. Suoraan "uudelleensuunnitteluun" hyppääminen on pelkkää oman arvauksen ympärille suunnittelua, ja paras arvaus on yleensä väärä tiistaina.',
        },
        {
          title: 'Lopeta saman keskustelun keksiminen uudelleen',
          body: 'Alkuaikoina Claude Codessa kävelin jokaiseen sessioon kuin se olisi ollut ensimmäinen työpäivä — "hei, lisää tähän vihollinen, tässä koko koodikanta, onnea matkaan." Lopulta huomasin maksavani samasta alustusparagrafista neljäkymmentä kertaa viikossa. Joten kirjoitin reseptit ylös. Spacepotatiksessa on nyt kymmenen Claude Code -skilliä repon sisällä — askel-askeleelta tehtäviä kuten "lisää vihollinen" tai "aja migraatio" joita tekoäly seuraa sen sijaan että aloittaisi alusta joka kutsulla. Ne käyvät koodikatselmoinnin, auditoidaan neljännesvuosittain ja säästivät ensimmäisenä vuotenaan noin 2,76 miljoonaa tokenia. Mikä muuttui: tapani työskennellä tekoälyn kanssa. Se ei ole chat-ikkuna johon huudan, vaan kontribuuttori jonka ohjeet asuvat samassa paikassa kuin koodi jota se koskee.',
        },
        {
          title: 'Yksi tuote, kolme moottoria, ei katumusta',
          body: 'AudiobookMaker syntyi "Edge-TTS-sovelluksena". Ei mennyt kauaa, kun jokainen ääniteknologia jota vastaan olin hiljaa lyönyt vetoa joko kuroi kiinni tai kiersi koko kentän — luovuin yrityksestä veikata voittajaa. AudiobookMaker on nykyään yksi putki ja sen alla kolme moottoria: Edge-TTS nopeisiin pilvi-ääniin, Piper offline-läppärille, Chatterbox studiolaatuiseen kerrontaan ja äänikloonaukseen. Käyttäjä valitsee per kirja. Kun maaperä liikkuu, tuotteen pitää seistä sen yllä, ei sen päällä. Suunnittelupöydällä suosikkien valitseminen on tapa tehdä jotain joka vanhenee jo ennen lanseeraustviittiä.',
        },
        {
          title: 'Kattavuus on fiilis. Mutaatio on fakta.',
          body: 'Pitkään vihreä testisarja oli minulle luotettava heti näkemältä — samaan tapaan kuin luotan "varoitus: kuumaa" -tarraan kahvikupissa. Sitten lisäsin Strykerin HRM:ään. Mutaatiotestaus tönäisee pieniä bugeja tuotantokoodiin jokaisessa pull requestissa ja kaataa buildin, jos yksikään testi ei ota niitä kiinni. Ensimmäinen ajo oli nöyryyttävä: iso osa "läpimenneistä" assertioistani osoittautui koristeellisiksi — ne ajoivat rivit ja menivät kotiin. 91,9 % rivikattavuus tarkoittaa että rivit ajettiin. Mutaatiopistemäärä tarkoittaa että assertiot oikeasti merkitsivät jotain. Luen näitä nyt eri signaaleina enkä ole läheskään yhtä omahyväinen vihreästä rastista.',
        },
        {
          title: 'Korjaa vuoto naapurin kellarissa',
          body: 'AudiobookMakeria rakentaessa törmäsin muistivuotoon syvällä Chatterboxin monikielisessä päättelypolussa — moottori romahti tuottamaan alle sekunnin äänitiedostoja ensimmäisen kutsun jälkeen, käyttökelvoton mihinkään tviittiä pidempään. Ennen olisin paikannut sen paikallisesti, motkottanut siitä viikon ja jatkanut matkaa. Tällä kertaa istuin sen kanssa: luin polun, löysin syyn, kirjoitin korjauksen ja lähetin kaksi pull requestia upstreamiin resemble-ai/chatterboxiin, laajasti käytettyyn open-source-TTS-kirjastoon — #505 ja #510, molemmat avoinna ja muiden kontribuuttoreiden bumppaamia. Korjauksen kirjoittaminen oli helppo puolisko. Kasvu oli toisen koodikannan lukeminen niin hyvin että pystyi korjaamaan sen rikkomatta sitä, ja sen oivaltaminen että takaisin kontribuoiminen on halpa vaihtoehto, ei lisäpiste. Laiska paikkaus olisi ollut kallis kaikille jotka törmäsivät bugiin minun jälkeeni.',
        },
        {
          title: 'Yksin tarkoittaa että ainoa joka odottaa on työ',
          body: 'Kaikissa seitsemässä projektissa tänä vuonna omistin työn päästä päähän. Skeemamigraatioita maanantaina, sovelluskoodia tiistaina, CI-putkia keskiviikkona, allekirjoitettuja Windows-asentajia GitHub Releasesin kautta torstaina, OpenTelemetryä perjantaina, viikonloppu vapaata (valhe). Postgres ja MongoDB datapuolella, GitHub Actions joka repossa typecheckiä, formattausta, linttiä ja mutaatiotestausta varten siellä missä se on relevanttia, Vercel web-deployhin. SQL:stä ihan ops-päähän. Se mikä kasvoi ei ole leveys listana — se on tyyneys jolla osaa valita oikean työkalun joka kerroksessa kun on joutunut elämään jokaisessa kerroksessa. Kun tiimi on yksi, pullonkaula on työ — ei odottelu.',
        },
      ],
    },
    now: {
      title: 'Katse ylöspäin',
      body: 'Rautakauppa-ura takana. Täysi fokus opintoihin, koodiin ja seuraavaan nousuun. Avoin kunnianhimoisille full-stack-rooleille joissa laatu ja vauhti ovat yhtä tärkeitä.',
      tags: ['Saatavilla', 'Etänä / Suomi'],
    },
  },
  contactPage: {
    h1: 'Yhteystiedot',
    interactiveAria: 'Interaktiivinen terminaali',
    windowTitle: 'mikko@portfolio — zsh — 96×30',
    inputAria: 'Terminaalin komentokenttä',
    hintType: 'kirjoita',
    hintHistory: 'historia',
    hintComplete: 'täydennä',
    noscriptIntro: 'Tämä sivu on interaktiivinen terminaali joka vaatii JavaScriptin.',
    noscriptReachMe: 'Voit tavoittaa minut suoraan:',
    noscriptEmailLabel: 'Sähköposti:',
    noscriptGithubLabel: 'GitHub:',
  },
  mobileContact: {
    typedWhoamiOutputName: 'mikko numminen — full-stack-kehittäjä · suomi',
    typedWhoamiOutputBio:
      'rakentaa tuotantotason verkkosovelluksia ai-avusteisilla työnkuluilla.',
    typedContactLabelEmail: 'sähköposti',
    typedContactLabelLinkedin: 'linkedin',
    typedContactLabelGithub: 'github',
    typedContactLabelLocation: 'sijainti',
    typedContactValueLocation: 'suomi · etätyöystävällinen',
    typedDownloadOutput: 'valmis.',
    btnEmail: 'Lähetä sähköpostia',
    btnLinkedin: 'LinkedIn',
    btnDownloadCv: 'Lataa CV',
    cardAria:
      'Mobiilin yhteystietokortti automaattisesti soitetulla terminaali-istunnolla',
  },
  terminal: {
    bootBooting: 'käynnistetään mikkOS v1.0.0 ...',
    bootMounting: '[ ok ] liitetään /portfolio',
    bootLoading: '[ ok ] ladataan projektit, kokemus, yhteystiedot',
    bootComms: '[ ok ] muodostetaan yhteyslinkki',
    bootWelcome: 'tervetuloa — mikko numminen, full-stack-kehittäjä.',
    bootTypeHelp: 'kirjoita `help` nähdäksesi mitä osaan.',
    bootSudoHint: 'vinkki: vastaan myös `sudo`-komentoihin.',
    commandNotFound: 'komentoa ei löydy:',
    typeHelpHint: 'kirjoita `help` nähdäksesi käytettävissä olevat komennot.',
    errorPrefix: 'virhe:',
    copyButton: 'kopioi',
    copyDone: 'kopioitu!',
    copyFallback: 'paina ctrl+c',
    cmdHelpDesc: 'listaa käytettävissä olevat komennot',
    cmdHelpAvailable: 'käytettävissä olevat komennot:',
    cmdHelpTip:
      'vinkki: kokeile `whoami`, `contact --email`. osa komennoista vaatii rootin.',
    cmdWhoamiDesc: 'lyhyt esittely',
    cmdWhoamiName: 'mikko numminen',
    cmdWhoamiTitle: 'full-stack-kehittäjä · suomi',
    cmdWhoamiIntro:
      'rakentaa tuotantotason verkkosovelluksia ai-avusteisilla työnkuluilla.',
    cmdWhoamiLargest: 'suurin:',
    cmdWhoamiAlso: 'myös:',
    cmdWhoamiCommunity: 'yhteisö',
    cmdWhoamiDesktop: 'työpöytä',
    cmdWhoamiCurrently:
      'parhaillaan perehtymässä three.js:ään, gsap:iin ja animaatioiden rakentamiseen.',
    cmdContactDesc: 'näytä yhteystiedot',
    cmdContactUsage: 'käyttö: contact [--email]',
    cmdContactUnknownFlag: 'tuntematon valitsin:',
    cmdContactEmailLabel: 'sähköposti:',
    cmdLinksDesc: 'näytä verkkoprofiilit',
    cmdLinksUsage: 'käyttö: links [--github|--linkedin|--all]',
    cmdLinksUnknownFlag: 'tuntematon valitsin:',
    cmdDownloadDesc: 'lataa tiedosto',
    cmdDownloadUsage: 'download --cv',
    cmdDownloadHint: 'käyttö: download --cv',
    cmdDownloadPreparing: 'valmistellaan latausta...',
    cmdDownloadNotAvailable: 'cv ei vielä saatavilla — vielä viimeistelyssä.',
    cmdDownloadMeantime: 'sillä välin, ota yhteyttä:',
    cmdDownloadStarted: 'cv-lataus aloitettu.',
    cmdProjectsDesc: 'siirry projektit-sivulle',
    cmdProjectsOpening: 'avataan /projects...',
    cmdHomeDesc: 'siirry etusivulle',
    cmdHomeOpening: 'avataan /...',
    cmdExperienceDesc: 'siirry kokemus-sivulle',
    cmdExperienceOpening: 'avataan /experience...',
    cmdClearDesc: 'tyhjennä näyttö',
    cmdEchoDesc: 'tulosta argumentit',
    cmdDateDesc: 'näytä nykyinen päivämäärä',
    cmdSudoDesc: 'aja jotain rootina',
    cmdSudoPasswordPrompt: '[sudo] salasana käyttäjälle guest: ********',
    cmdSudoApproved: 'tunnistus... hyväksytty.',
    cmdSudoExcellent: '🎯 erinomainen valinta.',
    cmdSudoReachOut: 'ota yhteyttä:',
    cmdSudoOrRun: 'tai aja `download --cv` saadaksesi ansioluettelon.',
    cmdSudoNotFound: 'komentoa ei löydy',
    cmdSudoNoCommand: '(ei komentoa)',
    cmdSudoHint: 'vinkki: kokeile `sudo hire mikko`',
    cmdManDesc: 'näytä komennon käyttöohje',
    cmdManUsage: 'man <komento>',
    cmdManNoEntry: 'ei manuaalimerkintää komennolle',
    cmdManNameLabel: 'NIMI',
    cmdManUsageLabel: 'KÄYTTÖ',
  },
  langSwitcher: {
    label: 'Kieli',
    en: 'EN',
    fi: 'FI',
    sv: 'SV',
  },
  notFound: {
    title: 'Sivua ei löytynyt · mikkonumminen.dev',
    description: 'Etsimääsi sivua ei ole olemassa.',
    heading: 'Sivua ei löytynyt',
    message: 'Tätä reittiä ei ole tällä sivustolla.',
    navAria: 'Palaa sivulle',
    linkHome: 'Etusivu',
    linkProjects: 'Projektit',
    linkExperience: 'Kokemus',
    linkContact: 'Yhteystiedot',
  },
};
