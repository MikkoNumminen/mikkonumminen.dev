import type { Translations } from '../types';

export const fi: Translations = {
  meta: {
    jobTitle: 'Fullstack-kehittäjä',
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
        'Kiipeä vuorelle — Mikko Nummisen kokemus, taidot ja virstanpylväät perusleiristä tähän hetkeen.',
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
        title: 'Repot syöttävät toisiaan',
        body: 'HRM toimii git-alimoduulina Platformin sisällä — sama tunnistautuminen, sama auditloki, kaksi tuotetta yhdestä ytimestä. AudiobookMaker tuottaa äänet Spacepotatikseen, strudel-patterns sen musiikin. Jokainen repliikki ja jokainen sävel jäljitetään takaisin repoon, jonka omistan itse.',
      },
      {
        title: 'Testattu tai ei lähde',
        body: 'Jokaisella repolla on CI joka pushissa. HRM:ssä 1828+ testiä 91,9 % kattavuudella, Spacepotatiksessa ~1170, AudiobookMakerissa yli 1800. Laatuportit painavat enemmän kuin mahtipontisin teknologiapino.',
      },
      {
        title: 'AI-natiivi, jäljitettävästi',
        body: 'Spacepotatis ajaa kymmentä omaa Claude Code -skilliä .claude/skills/-hakemistossa — versionhallittuja, neljännesvuosittain auditoituja, kuten tuotantokoodia. Pariohjelmointi tekoälyn kanssa on osa työkalupakkia; auditointijälki on kuitti.',
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
    body: 'Spacepotatis ehti tyhjästä reposta tuotantoon 12 päivässä: 387 commitia, ~1170 testiä, kymmenen auditoitua Claude Code -skilliä, koko Next.js + Phaser 3 + Three.js -pino. Seitsemästä portfolioreposta kuusi käynnistyi viimeisen kuuden viikon aikana. AI-natiivi ei ole sloganpuhetta — se on matematiikkaa.',
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
    listHeading: 'Hyppää projektiin',
    listAriaLabel: 'Projektiluettelo',
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
        'Tuotantokäytössä oleva yhteisöalusta oikealle WoW-killalle osoitteessa vuohiliitto.com. Turborepo-monorepo jossa HRM git-alimoduulina. Monivuokrainen, WoW-henkinen pelillistäminen (XP, tasot, saavutukset, questit), välilehtipohjainen chatti whispereineen ja slash-komentoineen, Mythic+ -tiimiseuranta Raider.IO API:n kautta ja opastettu tutustumiskierros uusille jäsenille.',
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
        'Työpöytäsovellus joka muuntaa PDF-, EPUB- ja tekstitiedostot äänikirjoiksi; skannatut PDF:t ajetaan ensin Tesseract-OCR:n läpi. Neljä puhesynteesimoottoria: Edge-TTS (pilvi, 30+ ääntä kuudella kielellä), Piper (offline, ei vaadi GPU:ta), Chatterbox "Grandmom"-äänellä äänen kloonaukseen referenssinäytteestä ja VoxCPM2 zero-shot-äänenkloonaukseen ja -suunnitteluun tekstistä (vaatii NVIDIA-näytönohjaimen, vain kehittäjäasennus). Sama Chatterbox-moottori ääninäyttelee Spacepotatiksen pelin sisäisen tarinan. Englannin puhesynteesi toimii jo hyvin; suomi on vaikeampi syntetisoida käytettävissä olevilla resursseilla, joten sitä varten on rakennettu 16-vaiheinen normalisointiputki joka hoitaa numeroiden kontekstitaivutuksen, lyhenteiden purkamisen, yksikkösymbolien käsittelyn ja vierassanojen ääntämiskorjaukset — laatu paranee joka julkaisun myötä. Jaetaan Windows-asennusohjelmana automaattipäivityksillä ja 2400+ testillä.',
      highlights: [
        'Chatterbox-ääniklooni Grandmom-äänellä',
        '16-vaiheinen suomen kielen normalisointi, 2400+ testiä',
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
        'Live-koodattua elektronista musiikkia Strudelilla — JavaScript-pohjainen kuviomoottori, TidalCyclesin sukulainen. Jokainen kappale on yksi kompostoitavissa oleva ilmaisu: pinoja syntetisaattoreita, bassolinjoja, rumpukuvioita ja efektiketjuja. Sävelletty rakenteistetulla tekoälytyönkululla — luonnollinen kuvaus → generointi → kuuntelu → iterointi, päätökset kirjattu git-historian rinnalle. Valitut kappaleet säestävät Spacepotatista (galaksinäkymä, missioteemat, tarinan kerrontapohja) ja mikkonumminen.dev-aloitussivua. Uudelleenkäytettävä komponenttikirjasto, kuratoidut syntetisaattoriasetukset, sessiomuistiot iteraatioista.',
      highlights: [
        'Live-koodattu Strudelilla',
        'Tekoälyohjattu iterointi, kirjattuna gitiin',
        'Spacepotatiksen ja mikkonumminen.devin ääniraita',
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
    yearNow: 'Nyt',
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
      body: 'Agenttilähtöistä, AI-avusteista kehitystä versioituna kurinalaisuutena. Mukautetut Claude Code -skillit menevät repoon tuotantoartefakteina — jokainen opettaa agentille projektikohtaisen reseptin (lisää vihollinen, vie tietokantamigraatio, auditoi tallennusputki) niin että se menee suoraan asiaan eikä grepaa ympäriinsä jokaisella kutsulla. Parikoodausta rinnakkaisilla subagenteilla itsenäisten siivujen yli, sen jälkeen tulosten synteesi.\n\nSkillit ovat versionhallinnassa, auditoidaan kvartaaleittain (skillin ja sen viittaaman koodin välinen drift on aito bugiluokka — kaksi oikeaa tällaista löydettiin viime auditoinnissa), ja niitä käsitellään tuotantoartefakteina. Arvioitu säästö pelkästään Spacepotatiksella: noin 2,76 miljoonaa tokenia vuodessa. Nopeammin tuotantoon ilman että rima laskee.',
      tags: [
        'Agenttikehitys',
        'Mukautetut skillit',
        'Subagentit',
        'Versioitu työnkulku',
        'Vauhti',
      ],
    },
    '2026-build': {
      title: '2026 — rakennusvuosi',
      body: 'Toukokuussa 2026: seitsemän full-stack-projektia tuotantoon yksin yhden vuoden sisällä. Oikeita käyttäjiä, oikeaa ops-puolta, täysi omistajuus skeemasta deployhin.',
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
          title: 'Triage ennen uudelleensuunnittelua',
          body: 'Kun tallennuksen korruptio iski Spacepotatikseen toukokuussa 2026: palvelinpuolen vahti samana päivänä, audit-taulu seuraavana, arkkitehtoninen korjaus vasta viikon datan jälkeen. Lievennä → observoi → arkkitehtuuri.',
        },
        {
          title: 'AI-työnkulku osana koodia',
          body: 'Spacepotatis toimittaa kymmenen Claude Code -skilliä repon sisällä — koodikatselmoidut, neljännesvuosittain auditoidut. ~2,76M tokenia säästöä ensimmäisenä vuotenaan.',
        },
        {
          title: 'Ei työkalulukitusta',
          body: 'AudiobookMaker pyörittää kolmea TTS-moottoria yhden putken alla — Edge-TTS, Piper, Chatterbox. Käyttäjä valitsee per kirja.',
        },
        {
          title: 'Mutaatiotestaus > kattavuus',
          body: 'HRM ajaa Strykerin jokaisessa PR:ssä. 91,9 % rivikattavuus tarkoittaa että rivit ajettiin; mutaatiopistemäärä tarkoittaa että assertiot oikeasti löytävät bugit.',
        },
        {
          title: 'Korjaa upstreamissa, ei paikallisesti',
          body: 'Diagnosoin muistivuodon syvällä Chatterboxin päättelypolussa; lähetin kaksi PR:ää upstreamiin resemble-ai/chatterboxiin (#505, #510), molemmat avoinna ja muiden kontribuuttoreiden bumppaamia.',
        },
        {
          title: 'Yksin full-stack, ei jonoja',
          body: 'SQL, sovelluskoodi, CI, Vercel-deployt, allekirjoitetut Windows-asentajat GitHub Releasesin kautta, OpenTelemetry — omistettuna päästä päähän kaikissa seitsemässä projektissa.',
        },
      ],
    },
    'skill-receipts': {
      title: 'Mittasin AI-työnkulun',
      body: 'Vuoden ajan väitin että työnkulku kannattaa, joten ajoin A/B:n. Jokainen mukautettu Claude Code -skilli mitattuna itseään vastaan kylmänä — sama tehtävä, subagent päällä, subagent pois — Sonnetilla, Opuksella ja Haikulla. 34 skilliä, 33 kalibroitua. Yhteissäästö: +17 %, noin 327K tokenia portfoliossa.\n\nJulkaistuun rekisteriin kuuluvat ne skillit jotka maksoivat ENEMMÄN kuin kylmänä meneminen. Ne eivät ole epäonnistumisia — niissä on tarkkuutta jonka kylmä haara ohitti (auditin perusteellisuus, protokollakuri, spec-syvyys). Arvo on täydellisyys, ei pakkaaminen. PDF on ladattavissa contact-terminaalista; jokainen luku on jäljitettävissä oikeaan transkriptiin.',
      tags: [
        'A/B-kalibroitu',
        '34 skilliä',
        'Julkaistu PDF',
        'Rehellinen kirjanpito',
        'Sonnet · Opus · Haiku',
      ],
    },
    now: {
      title: 'Katse ylöspäin',
      body: 'Saatavilla nyt. Avoin kunnianhimoisille full-stack-rooleille, joissa sekä laatu että vauhti ratkaisevat. Seitsemän tänä vuonna yksin tuotantoon vietyä projektia — todiste molemmista.',
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
      'vie full-stack-tuotantosovellukset maaliin päästä päähän. sql:stä ops:iin.',
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
    ariaLinkedIn: 'LinkedIn (avautuu uuteen välilehteen)',
  },
  terminal: {
    bootBooting: 'käynnistetään mikkOS v1.0.0 ...',
    bootMounting: '[ ok ] liitetään /portfolio',
    bootLoading: '[ ok ] ladataan projektit, kokemus, yhteystiedot',
    bootComms: '[ ok ] muodostetaan yhteyslinkki',
    bootWelcome: 'tervetuloa — mikko numminen, full-stack-kehittäjä.',
    bootTypeHelp: 'kirjoita `help` nähdäksesi mitä osaan.',
    commandNotFound: 'komentoa ei löydy:',
    typeHelpHint: 'kirjoita `help` nähdäksesi käytettävissä olevat komennot.',
    errorPrefix: 'virhe:',
    copyButton: 'kopioi',
    copyDone: 'kopioitu!',
    copyFallback: 'paina ctrl+c',
    cmdHelpDesc: 'listaa käytettävissä olevat komennot',
    cmdHelpAvailable: 'käytettävissä olevat komennot:',
    cmdHelpTip: 'vinkki: kokeile `whoami`, `contact --email` tai `download --cv`.',
    cmdWhoamiDesc: 'lyhyt esittely',
    cmdWhoamiName: 'mikko numminen',
    cmdWhoamiTitle: 'full-stack-kehittäjä · suomi',
    cmdWhoamiIntro:
      'vie full-stack-tuotantosovellukset maaliin päästä päähän. sql:stä ops:iin.',
    cmdWhoamiLargest: 'suurin:',
    cmdWhoamiAlso: 'myös:',
    cmdWhoamiYear: 'tänä vuonna:',
    cmdWhoamiCommunity: 'yhteisö',
    cmdWhoamiDesktop: 'työpöytä',
    cmdWhoamiGame: 'peli',
    cmdWhoamiCurrently: 'saatavilla nyt kunnianhimoisiin full-stack-rooleihin.',
    cmdContactDesc: 'näytä yhteystiedot',
    cmdContactUsage: 'käyttö: contact [--email]',
    cmdContactUnknownFlag: 'tuntematon valitsin:',
    cmdContactEmailLabel: 'sähköposti:',
    cmdLinksDesc: 'näytä verkkoprofiilit',
    cmdLinksUsage: 'käyttö: links [--github|--linkedin|--all]',
    cmdLinksUnknownFlag: 'tuntematon valitsin:',
    cmdDownloadDesc: 'lataa tiedosto',
    cmdDownloadUsage: 'download [--cv|--skills|--study|--replicates|--results]',
    // i18n: awaiting Finnish translation — English placeholders for now.
    cmdDownloadIntro: "pick what you'd like to grab:",
    cmdDownloadOptionCv: 'my cv — pdf, full résumé',
    cmdDownloadOptionSkills:
      'every claude code skill across my portfolio — pdf, token savings measured against going cold',
    cmdDownloadOptionSuite:
      'full mikko- library A/B — 8 skills x 3 models (opus/sonnet/haiku) + an after-optimization re-measure. honest finding: the token wins live in the script-backed skills; the prose audits are wash-to-negative on a capable cold model; and trimming SKILL.md body size buys ~0 measurable per-invocation tokens — pdf',
    cmdDownloadOptionStudy:
      'the 5-round before/after study measuring whether a SKILL.md change actually cut tokens — pdf',
    cmdDownloadOptionReplicates:
      'round-6 replication — the noisiest study cells re-measured at depth to settle the N=1 anomalies (per-cell skill-vs-cold, not a portfolio rate) — pdf',
    cmdDownloadOptionResults:
      'the two skill-auditing skills: what they cost to run, and what they fixed across the portfolio — pdf',
    cmdDownloadScopeNote:
      'note — three lenses, not one figure: +17% across the 34-skill portfolio, 33 calibrated (--skills); +36% for the two skill-auditors alone (--results); those same two auditors re-measured at depth land at 54–85% per cell (--replicates).',
    cmdDownloadTryHint:
      'try `download --cv`, `download --skills`, `download --study`, `download --replicates`, or `download --results`.',
    // i18n: awaiting Finnish translation — English placeholder for now.
    cmdDownloadAmbiguous:
      'specify only one of --cv, --skills, --study, --replicates, or --results.',
    cmdDownloadPreparing: 'valmistellaan latausta...',
    cmdDownloadNotAvailable: 'cv ei vielä saatavilla — vielä viimeistelyssä.',
    // i18n: awaiting Finnish translation — English placeholder for now.
    cmdDownloadSkillsNotAvailable:
      'skill registry pdf not available yet — run `npm run build:skills-pdf` to generate it.',
    // i18n: awaiting Finnish translation — English placeholder for now.
    cmdDownloadSuiteNotAvailable:
      'skill-suite calibration pdf not available right now — reach out and I will send it.',
    // i18n: awaiting Finnish translation — English placeholder for now.
    cmdDownloadStudyNotAvailable:
      'optimization study pdf not available right now — reach out and I will send it.',
    // i18n: awaiting Finnish translation — English placeholder for now.
    cmdDownloadReplicatesNotAvailable:
      'replicates pdf not available right now — reach out and I will send it.',
    // i18n: awaiting Finnish translation — English placeholder for now.
    cmdDownloadResultsNotAvailable:
      'skill-auditor results pdf not available right now — reach out and I will send it.',
    cmdDownloadMeantime: 'sillä välin, ota yhteyttä:',
    cmdDownloadStarted: 'lataus aloitettu.',
    cmdClearDesc: 'tyhjennä näyttö',
    cmdManDesc: 'näytä komennon käyttöohje',
    cmdManUsage: 'man <komento>',
    cmdManNoEntry: 'ei manuaalimerkintää komennolle',
    cmdManNameLabel: 'NIMI',
    cmdManUsageLabel: 'KÄYTTÖ',
    // i18n: awaiting Finnish translation — English placeholders for now.
    cmdSkillsDesc: 'list claude code skills across all repos',
    cmdSkillsUsage: 'usage: skills [--repo <name>|--all|--json]',
    cmdSkillsUnknownFlag: 'unknown flag:',
    cmdSkillsLoading: 'loading skill registry...',
    cmdSkillsNotGenerated: 'skill registry not generated yet.',
    cmdSkillsNotGeneratedHint:
      'run the `skill-registry` skill locally, then drop the json at public/data/skills-registry.json.',
    cmdSkillsGeneratedLabel: 'generated:',
    cmdSkillsAggregateTip: 'tip: `skills --repo <name>` or `skills --all` for details.',
    cmdSkillsRepoNotFound: 'repo not found:',
    cmdSkillsJsonOpened: 'opened skills-registry.json in new tab.',
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
  bgAudio: {
    soundOn: 'ääni päällä',
    soundOff: 'ääni pois',
  },
};
