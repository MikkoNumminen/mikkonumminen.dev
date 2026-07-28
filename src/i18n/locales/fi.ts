import type { Translations } from '../types';

export const fi: Translations = {
  common: {
    opensInNewTab: '(avautuu uuteen välilehteen)',
  },
  meta: {
    jobTitle: 'Fullstack-kehittäjä',
    home: {
      title: 'Mikko Numminen — full-stack-kehittäjä',
      description:
        'Full-stack-kehittäjä Suomesta. Työmuistiinpanoja ja valittuja projekteja, toteutettu yksin ja tekoälylähtöisesti oletuksena.',
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
    blog: {
      title: 'Blogi — Mikko Numminen',
      description:
        'Työmuistiinpanoja Mikko Nummisen projekteista. Commit-historiasta kirjoitetut merkinnät on merkitty tekoälyn generoimiksi.',
    },
  },
  nav: {
    home: 'etusivu',
    projects: 'projektit',
    experience: 'kokemus',
    blog: 'blogi',
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
    heading: 'Lyhyt esittely.',
    // REVIEW (fi): literal mirror of the EN intro; the sarcasm does not
    // translate 1:1. Draft only, replace with your own phrasing.
    body: 'Olen full-stack-kehittäjä, ja viime aikoina työni on pyörinyt enimmäkseen kielimallien ympärillä, joiden paimentamiseen käytän suurimman osan ajastani, koska malli, joka on väärässä mutta varma asiastaan, on aivan oma ongelmansa. Päädyin tähän vuonna 2022 myytyäni rautaa 24 vuotta, joten olen se tyyppi, joka lukee käyttöohjeen ja odottaa silti laitteen hajoavan. Rakennan koko homman, tietokannasta ruudulle asti, ja mittaan sen, minkä rakennan. Joskus mittaan sen, julkaisen tulokset ja huomaan sitten, että mittari itse oli rikki, mikä on nöyryyttävä tapa oppia, että myös instrumentti pitää tarkistaa.',
  },
  latestEntries: {
    sectionAria: 'Uusimmat blogimerkinnät',
    eyebrow: 'kirjoituksia',
    heading: 'Uusimmat merkinnät.',
    viewAll: 'Kaikki merkinnät',
    empty: 'Ei vielä julkaistuja merkintöjä.',
  },
  navCards: {
    sectionAria: 'Tutustu sivuston muihin osiin',
    eyebrow: 'jatka',
    heading: 'Muualla sivustolla.',
    projects: {
      label: 'Projektit',
      description: 'Tutustu interaktiiviseen aurinkokuntaan projekteistani.',
    },
    experience: {
      label: 'Kokemus',
      description: 'Kiipeä vuorta pitkin läpi taitojen, työkalujen ja saavutusten.',
    },
    blog: {
      label: 'Blogi',
      description:
        'Työmuistiinpanoja siitä, mitä olen rakentanut, osa koottu commit-historiasta.',
    },
    contact: {
      label: 'Yhteystiedot',
      description: 'Hyppää terminaaliin ja ota yhteyttä suoraan.',
    },
    footerCopyright: '© 2026 Mikko Numminen',
    footerBuiltWith: 'tehty: astro · three.js · gsap',
  },
  blog: {
    eyebrow: 'kirjoituksia',
    title: 'Blogi',
    lede: 'Työmuistiinpanoja siitä, mitä olen rakentanut. Osa merkinnöistä on koneen kirjoittamia commit-historiasta, ja ne kertovat sen heti alussa.',
    aiBadge: 'tekoälyn generoima',
    aiNotice:
      'Tämän merkinnän on generoinut kielimalli commit-historiasta. En ole kirjoittanut sitä uudelleen. Käsittele sitä yhteenvetona muutoksista, ei jonain minun itse kirjoittamana.',
    backToIndex: 'Kaikki merkinnät',
    empty: 'Ei vielä merkintöjä.',
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
    listAriaLabel: 'Projektiluettelo',
    listToggleShow: 'Projektit',
    listToggleHide: 'Piilota',
  },
  projectsData: {
    hrm: {
      tagline: 'Full-stack HR-järjestelmä',
      description:
        'HR-järjestelmä, jossa tylsät osat on tehty kunnolla. Jokainen muutos kirjataan lokiin, johon voi vain lisätä, ja jokainen merkintä allekirjoitetaan edellistä vasten. Jos joku sorkkii historiaa, admin-päätepiste käy ketjun läpi ja kertoo, missä merkinnässä se katkesi. Tietokantoja on kaksi, koska henkilödata ja auditointidata haluavat eri asioita. Nopeusrajoitus pyörii Postgresissa, joten erillistä Redisiä ei tarvitse pitää hengissä.',
      highlights: ['2910 testiä', '92,2 % kattavuus', 'Auditloki paljastaa peukaloinnin'],
    },
    platform: {
      tagline: 'Yhteisöalusta HRM:n päällä',
      description:
        'World of Warcraft -killan yhteisösivusto, joka pyörii osoitteessa vuohiliitto.com. HRM on mukana git-alimoduulina, joten tilit, oikeudet ja auditointi tulivat valmiina ja loput rakennettiin päälle. Jäsenet keräävät XP:tä ja tasoja, juttelevat välilehtichatissa oikeine kuiskauksineen ja kokoavat Mythic+ -tiimejä hakemalla hahmojen tiedot Raider.IO:sta. Uusi jäsen saa opastetun kierroksen, ei seinällistä nappeja.',
      highlights: ['Oikeita käyttäjiä', '1388 testiä', 'HRM alimoduulina'],
    },
    portfolio: {
      tagline: 'Tämä sivusto',
      description:
        'Sivusto, jota luet juuri nyt. Täysin staattinen, mikään palvelin ei tee mitään ovelaa. Projektisivu on aurinkokunta, jota voi pyöritellä, etusivu on hiukkaskenttä, joka järjestäytyy jatkuvasti uusiksi, ja yhteyssivulla on terminaali, johon voi kirjoittaa. Animaatiokokeilut asuvat täällä, jotta tuotantosovellusten ei tarvitse kantaa niitä.',
    },
    readlog: {
      tagline: 'Pidä kirjaa lukemistasi kirjoista',
      description:
        'Lukupäiväkirja. Hae kirja, kerro luitko sen paperilla, e-kirjana vai kuuntelitko, anna arvosana, valmis. Haku kysyy Open Librarya ja Google Booksia yhtä aikaa ja yhdistää vastaukset, koska kummallakaan ei ole kaikkea. Julkinen syöte näyttää, mitä muut ovat saaneet luettua viime aikoina, ilman nimiä.',
      highlights: ['90 testiä', 'Hakee kahdesta kirja-API:sta kerralla'],
    },
    'readlog-dotnet': {
      tagline: 'ReadLog uusiksi .NETillä',
      description:
        'Sama lukupäiväkirja kirjoitettuna alusta asti uudelleen ASP.NET Corella, jotta selviäisi mitä porttaus oikeasti maksaa. Razor Pages Reactin tilalla, EF Core ja SQLite Prisman ja Postgresin tilalla. Pyörii Azuren ilmaistasolla, eli sovellus nukahtaa kahdenkymmenen minuutin päästä ja ensimmäinen käynti on hidas. Repoon on kirjattu jokainen kohta, jossa .NETin tapa ja Next.jsin tapa olivat eri mieltä.',
      highlights: [
        'Sama sovellus, toinen pino',
        'Azuren ilmaistaso',
        'Muistiinpanot joka valinnasta',
      ],
    },
    audiobookmaker: {
      tagline: 'Tekee kirjoista äänikirjoja',
      description:
        'Työpöytäsovellus, joka lukee PDF-, EPUB- tai Word-tiedoston ääneen ja tallentaa sen äänikirjaksi. Skannatut kirjat ajetaan ensin OCR:n läpi. Ääntä varten on neljä moottoria sen mukaan, haluatko ilmaisen, offline-version vai äänen, joka on kloonattu lyhyestä puhenäytteestä. Suomi on se vaikea osa, joten se siivotaan yhdeksässätoista vaiheessa ennen kuin sanaakaan lausutaan: suomen puhesynteesi sotkee numerot ja lyhenteet hyvin ennustettavilla tavoilla. Jaetaan Windows-asennuspakettina, jossa kaikki on mukana.',
      highlights: [
        '3000+ testiä',
        'Yhdeksäntoista siivousvaihetta suomelle',
        'Ääninäyttelee Spacepotatiksen tarinan',
      ],
    },
    spacepotatis: {
      tagline: 'Selainräiskintä: perunasi vastaan galaksi',
      description:
        'Selainpeli, jossa suojakuplassa istuva peruna ampuu ötököitä. Peli käynnistyy kuin vanha terminaali, avautuu 3D-aurinkokunnaksi, jota voi pyöritellä, ja pudottaa sitten ylhäältä kuvattuun taisteluun. Kaikki musiikki tulee strudel-patterns-reposta ja kaikki puhe AudiobookMakerista, kertojana Grandmom. Toukokuussa pelaajalta katosi tallennus, koska huijauksenesto tarkisti, etteivät luvut kasva liian nopeasti, mutta ei koskaan sitä, olivatko ne kutistuneet. Siitä tapauksesta on kirjoitettu runbook.',
      highlights: ['~1170 testiä', 'Oma musiikki ja puhe', 'Häiriöstä on runbook'],
    },
    'strudel-patterns': {
      tagline: 'Algoritmista musiikkia koodina',
      description:
        'Musiikkia Strudelilla, jossa kokonainen kappale on yksi JavaScript-lauseke, jota muokataan sen soidessa. Rummut, basso, syntikkakerrokset ja efektit ovat erillisiä palasia, joita voi pinota uusiksi kappaleiksi. Yhdeksän on kirjattu ylös, ja osa niistä päätyi Spacepotatiksen ääniraidaksi ja tämän etusivun musiikiksi. Jokainen sessio kirjataan git-historian rinnalle, joten kappaleen synnyn voi jäljittää.',
      highlights: [
        'Yhdeksän valmista kappaletta',
        'Soi Spacepotatiksessa ja tällä sivustolla',
      ],
    },
    'claude-continue': {
      tagline: 'Pitää Claude Coden käynnissä putkeen',
      description:
        'Claude Code toimii viiden tunnin ikkunoissa. Tämä odottaa, että ikkuna vaihtuu, ja käynnistää seuraavan, joten aikaa ei valu hukkaan sillä välin kun nukut. Pythonia ilman ainuttakaan riippuvuutta, pyörii valvomatta launchd:n tai Task Schedulerin kautta, ja tarkistaa ennen kuin kirjoittaa mitään, ettei istunto ole kesken ajatuksen. README myöntää suoraan, että näin työskentely kasvattaa kasaa koodia, jota kukaan ei ole vielä katselmoinut.',
      highlights: ['Ei riippuvuuksia', 'macOS, Windows, WSL, Linux', 'Pyörii valvomatta'],
    },
    passwordmanager: {
      tagline: 'Nollatietoinen salasananhallinta Rustilla',
      description:
        'Kaikki salaus asuu yhdessä Rust-cratessa. CLI, selainversio, synkronointipalvelin ja Chrome-laajennus käyttävät samaa cratea käännettynä joko natiivisti tai WebAssemblyksi, joten mokattavaa on vain yhdessä paikassa. Palvelin näkee pelkkää salatekstiä. Lukituksen avaaminen kestää tahallaan noin 430 millisekuntia, koska avaimen johtaminen on viritetty reilusti kirjaston oletuksia kireämmälle. README listaa myös viisi asiaa, joilta se ei suojaa, mikä tuntui hyödyllisemmältä kuin teeskentely.',
      highlights: [
        'Yksi salauscrate, neljä sovellusta',
        'Palvelin näkee vain salatekstiä',
        'Avaus ~430 ms, tarkoituksella',
      ],
    },
    'claude-agents': {
      tagline: 'Halvemmat mallit tylsiin töihin',
      description:
        'Neljätoista Claude Code -subagenttia, joista jokainen on kiinnitetty halvimpaan malliin, joka homman osaa. Lukeminen ja raportointi menee Haikulle, mekaaniset muokkaukset Sonnetille, ja vain suunnittelutyö saa kalliin mallin. Jokainen agentti selvittää itse, mitä repo käyttää, joten sama setti kattaa JavaScriptin, C#:n ja Pythonin ilman konfigurointia. Kaksi agenteista on olemassa siksi, että eräs katselmointityönkulku kulutti vaivihkaa 3,8 miljoonaa tokenia väärällä hinnalla.',
      highlights: [
        '14 malliin kiinnitettyä agenttia',
        'Sekä malli että päättelyteho kiinnitetty',
        'MIT-lisenssi',
      ],
    },
    'feedback-intelligence': {
      tagline: 'Lukee asiakaspalautetta keksimättä omiaan',
      description:
        'Ottaa sotkuisen vapaan tekstipalautteen ja tekee siitä jotain, jonka pohjalta esihenkilö voi toimia. Kiinnostavinta on, miten vähän siitä on AI:ta: malli siistii ihmisten kirjoitukset ja etsii kasasta teemat, loput on tavallista koodia. Hälytykset ovat avainsanahakuja. Sentimentti on peruslaskentoa. Suomenkielinen malli pyörii kotikoneella, joten hostaus ei maksa mitään. Jokainen päätös siitä, mihin AI päästettiin, on kirjattu ylös, myös ne neljä kierrosta, joilla sitä väännettiin takaisin pois.',
      highlights: [
        'AI tasan kahdessa paikassa',
        'Suomi edellä, pyörii paikallisesti',
        'Hostaus ei maksa mitään',
      ],
    },
  },
  experiencePage: {
    eyebrow: 'kiipeäminen',
    title: 'Kokemus',
    lede: 'Scrollaa vuorta ylöspäin. Jokainen merkki on askel sinne missä olen tänään.',
    scrollHint: 'vieritä',
    skipToTech: 'hyppää teknologioihin',
    kindFoundation: 'perusta',
    kindWork: 'työ',
    kindLife: 'elämä',
    kindProject: 'projekti',
    kindCraft: 'käsityö',
    kindNow: 'nyt',
    onwardToTech: 'teknologiat',
    summit: 'Saavutit huipun.',
    cta: 'astu terminaaliin →',
    lessonsAriaLabel: 'Tämän luvun opit',
    yearNow: 'Nyt',
  },
  techStack: {
    title: 'Teknologiat',
    lede: 'Millä olen oikeasti rakentanut. Avaa rivi nähdäksesi mitä sen alla on.',
    categories: {
      languages: 'Kielet',
      frontend: 'Frontend',
      backend: 'Backend ja data',
      ai: 'AI ja kielimallit',
      platform: 'Alusta',
    },
    viewOverall: 'teknologioittain',
    viewByProject: 'projekteittain',
    onwardToTerminal: 'terminaaliin',
    workBadge: 'työ',
    legend: 'työ = käytetty asiakastyössä. Muut ovat omista tuotantoprojekteistani.',
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
      body: 'Agenttilähtöistä, AI-avusteista kehitystä versioituna kurinalaisuutena. Mukautetut Claude Code -skillit menevät repoon tuotantoartefakteina — jokainen opettaa agentille projektikohtaisen reseptin (lisää vihollinen, vie tietokantamigraatio, auditoi tallennusputki) niin että se menee suoraan asiaan eikä grepaa ympäriinsä hinnalla $X/token. Parikoodausta rinnakkaisilla subagenteilla itsenäisten siivujen yli, sen jälkeen tulosten synteesi.\n\nSkillit ovat versionhallinnassa, auditoituja (skillin ja sen viittaaman koodin välinen drift on aito bugiluokka — drift napataan ja korjataan), ja niitä käsitellään tuotantoartefakteina. Arvioitu säästö pelkästään Spacepotatiksella: ~3,13M tokenia vuodessa. Nopeammin tuotantoon ilman että rima laskee.\n\nTyönkululla on omat työkalunsa: claude-continue pitää Claude Coden 5-tuntiset käyttöikkunat peräkkäin lukemalla aktiivisen ikkunan nollautumisajan ja jatkamalla keskeytettyjä istuntoja heti kun seuraava ikkuna avautuu — niin ettei pitkä autonominen ajo pysähdy ikkunoiden väliseen kuoppaan.',
      tags: [
        'Agenttikehitys',
        'Mukautetut skillit',
        'Subagentit',
        'claude-continue',
        'Versioitu työnkulku',
        'Vauhti',
      ],
    },
    '2026-build': {
      title: '2026 — rakennusvuosi',
      body: 'Kesäkuussa 2026: yhdeksän projektia tuotantoon yksin yhden vuoden sisällä — full-stack-verkkosovelluksia, työpöytätyökalu ja Azureen julkaistu ReadLog-käännös. Oikeita käyttäjiä, oikeaa ops-puolta, täysi omistajuus skeemasta deployhin.',
      tags: [
        '9 repoa',
        'Oikeita käyttäjiä',
        'Next.js',
        'Astro',
        'Three.js',
        'Phaser 4',
        'Python',
        'C#/.NET',
        'Azure',
        'Turborepo',
      ],
      lessons: [
        {
          title: 'Triage ennen uudelleensuunnittelua',
          body: 'Kun tallennuksen korruptio iski Spacepotatikseen toukokuussa 2026: palvelinpuolen vahti samana päivänä, audit-taulu seuraavana, arkkitehtoninen korjaus vasta viikon datan jälkeen. Lievennä → observoi → arkkitehtuuri.',
        },
        {
          title: 'AI-työnkulku osana koodia',
          body: 'Spacepotatis toimittaa kokoelman Claude Code -skillejä repon sisällä — koodikatselmoidut ja auditoidut. ~3,13M tokenia säästöä ensimmäisenä vuotenaan.',
          link: {
            href: 'https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md',
            label: 'Menetelmä',
          },
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
          body: 'SQL, sovelluskoodi, CI, Vercel- ja Azure-deployt, allekirjoitetut Windows-asentajat GitHub Releasesin kautta, OpenTelemetry — omistettuna päästä päähän kaikissa yhdeksässä projektissa.',
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
    'rust-crypto': {
      title: 'Rust, ja oman työn tarkistaminen',
      body: 'Uusi kieli ja tiukempi näytön vaatimus tulivat yhtä aikaa. Kieli on Rust, jonka otin käyttöön salasanahallintaan, jossa koko kryptografinen pinta asuu yhdessä cratessa, joka kääntyy sekä natiivisti että WebAssemblyksi. Komentorivikassa, synkronointipalvelin, selaimessa toimiva client ja Chrome-laajennus ajavat kaikki samaa koodia — neljän toisistaan hiljalleen loittonevan kopion sijaan.\n\nTapa oli kieltäytyä uskomasta omaa sanaani mistään. Avaimenjohtamisen parametrit, nonce-strategia, se mihin autentikoitu salateksti on sidottu: jokainen niistä on kirjattu päätös, johon liittyy uhkamalli, mukaan lukien selkeä lista siitä mitä suunnittelu ei suojaa. Repossa on tätä viimeistä kohtaa varten omat auditoijansa: yksi käy päätöskirjaukset läpi koodia vasten, toinen vertaa esitettyjä turvallisuusväitteitä siihen, mitä kryptografia todella tekee. Väite jota kukaan ei tarkista uudelleen on vain kommentti.',
      tags: [
        'Rust',
        'WebAssembly',
        'Argon2id',
        'XChaCha20-Poly1305',
        'Nollatieto',
        'Uhkamalli repossa',
      ],
      lessons: [
        {
          title: 'Yksi crate, neljä clientia',
          body: 'Argon2id 256 MiB:llä ja kolmella kierroksella, XChaCha20-Poly1305 tuorein nonce jokaista tietuetta kohden, ja jokainen tietue on sidottu omaan id:hensä ja aikaleimaansa niin ettei kahta tietuetta voi vaihtaa keskenään huomaamatta. Pääsalasana ei koskaan poistu clientilta, ja synkronointipalvelin pitää hallussaan vain salatekstiä. Lukituksen avaaminen maksaa noin 430 ms, mikä on ominaisuus, ei regressio.',
        },
        {
          title: 'Kolmekymmentä kierrosta, sokkona',
          body: 'Suomenkielisen kielimallin valinta paikalliseen pinoon ratkaistiin järjestämällä kolmekymmentä suomenkielistä vastausta sokkona, arvioijana äidinkielinen puhuja joka ei nähnyt kumpi malli kirjoitti minkäkin vastauksen. Poro-2-8B sijoittui ensimmäiseksi 26 kertaa 30:stä ja päätyi tuotantoon tällä tuloksella. Toinen projekti ajoi samat luvut ja jätti sen väliin, koska oikea valinta riippuu siitä miten tuotosta käytetään. Kumman tahansa valitseminen fiiliksen perusteella olisi ollut nopeampaa eikä olisi todistanut mitään.',
          link: {
            href: '/poro-findings.pdf',
            label: 'Lue tutkimus',
          },
        },
        {
          title: 'Yleensä bugi on minun',
          body: 'Kun vastaukset alkoivat liittää vääriä päivämääriä omaan tutkimukseeni, mukava selitys olisi ollut että pieni malli sekoili. Ei sekoillut. Päivämäärä putosi pois prompt-rajalla ennen kuin malli näki sitä koskaan. Kolme aiempaa yritystä korjata asia mallin puolella on kirjattu umpikujiksi, jotta seuraava katsoja ei käytä siihen viikkoa niin kuin minä käytin.',
        },
        {
          title: 'Mittaus joka ei muuttanut mitään',
          body: 'Monikielinen embedder näytti ilmeiseltä päivitykseltä suomenkieliseen hakuun. Suoraan vertailtuna jo tuotannossa oleva ratkaisu sai 0,810 pistettä ehdokkaan 0,762 pistettä vastaan, joten mikään ei mennyt tuotantoon. Kokeilu joka puhuu suunnitelmaa vastaan on yhtä arvokas kuin se joka vahvistaa sen, kunhan kummankin kirjaa ylös.',
        },
      ],
    },
    now: {
      title: 'Katse ylöspäin',
      body: 'Saatavilla nyt. Avoin kunnianhimoisille full-stack-rooleille, joissa sekä laatu että vauhti ratkaisevat. Yhdeksän tänä vuonna yksin tuotantoon vietyä projektia — todiste molemmista.',
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
    noscriptIntro:
      'Tämä sivu on interaktiivinen terminaali, joka toimii vain JavaScriptin kanssa.',
    noscriptReachMe: 'Voit tavoittaa minut suoraan:',
    noscriptEmailLabel: 'Sähköposti:',
    noscriptGithubLabel: 'GitHub:',
  },
  mobileContact: {
    typedWhoamiOutputName: 'Mikko Numminen — full-stack-kehittäjä · suomi',
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
    bootWelcome: 'tervetuloa — Mikko Numminen, full-stack-kehittäjä.',
    bootTypeHelp: 'kirjoita `help` nähdäksesi mitä osaan.',
    commandNotFound: 'komentoa ei löydy:',
    typeHelpHint: 'kirjoita `help` nähdäksesi käytettävissä olevat komennot.',
    errorPrefix: 'virhe:',
    copyButton: 'kopioi',
    copyDone: 'kopioitu!',
    copyFallback: 'paina ctrl+c',
    cmdHelpDesc: 'listaa käytettävissä olevat komennot',
    cmdHelpAvailable: 'käytettävissä olevat komennot:',
    cmdHelpTip:
      'vinkki: kokeile `whoami`, `contact --email`, `skills` tai `download --research`.',
    cmdWhoamiDesc: 'lyhyt esittely',
    cmdWhoamiName: 'Mikko Numminen',
    cmdWhoamiTitle: 'full-stack-kehittäjä · suomi',
    cmdWhoamiIntro:
      'vie full-stack-tuotantosovellukset maaliin päästä päähän. sql:stä ops:iin.',
    cmdWhoamiLargest: 'suurin:',
    cmdWhoamiLargestStats: '{tests}+ testiä, {coverage} kattavuus.',
    cmdWhoamiAlso: 'myös:',
    cmdWhoamiYear: 'tänä vuonna:',
    cmdWhoamiYearStats:
      '{projects} projektia yksin tuotantoon · ~{tokens} tokenia säästetty · {prs} PR:ää upstreamiin',
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
    cmdDownloadDesc:
      'cv:ni tai tutkimus — katalogi, skills-tutkimukset, kalibrointi ja rag suomi -tutkimus (pdf)',
    cmdDownloadUsage:
      'download [--cv|--research]; --research lists [--catalog|--study|--replicates|--results|--calibration|--finnish]',
    cmdDownloadIntro: 'valitse mitä haluat napata:',
    cmdDownloadOptionCv: 'cv:ni — pdf, koko ansioluettelo',
    cmdDownloadOptionSkills:
      'kesäkuu 2026 · uusin + laajin — 16 skilliä, kylmä-vs-skilli A/B kolmella mallilla; nykyinen tilannekuva',
    cmdDownloadOptionResearch:
      'tutkimus — 11 pdf:ää: skills-sarja + rag suomi -tutkimus + poro-löydökset + käännösauditointi + agenttidelegoinnin mittaus (ei lataus)',
    cmdDownloadResearchIntro: 'katalogi + tutkimukset, vanhimmasta uusimpaan:',
    cmdDownloadOptionCatalog:
      'jokainen skilli kaikista 4 reposta — inventaario, kustannukset mitattu (ei arvattu)',
    cmdDownloadOptionStudy:
      'toukokuu 2026 · optimointi — 5 kierrosta ennen/jälkeen yhdellä SKILL.md:llä; 3 kustannusansaa löydetty + korjattu',
    cmdDownloadOptionReplicates:
      'kierros 6 · meluisimmat solut mitattu uudelleen syvemmin — N=1-sattuma kumottu, ~+76 % vahvistettu',
    cmdDownloadOptionResults:
      'synteesi — mitä kaksi skilliauditoijaa maksoivat (~36 % halvempi ajaa) ja mitkä ansat ne paljastivat',
    cmdDownloadOptionFinnish:
      'kesäkuu 2026 · rag suomi -koe — 3 paikallista 8B-mallia suomen synteesistä vs hallinnasta, yksittäismuuttuja, €0',
    cmdDownloadOptionMethodology:
      'kesäkuu 2026 · rag suomi -tutkimus, menetelmä — miten koe huomasi ja korjasi oman virheensä; prosessi, ei löydökset',
    cmdDownloadOptionBlindTest:
      'heinäkuu 2026 · sokkotesti — äidinkielinen puhuja arvioi sokkona 3 paikallista mallia suomen luonnollisuudessa; Poro voittaa 26/30',
    cmdDownloadOptionPoro:
      'heinäkuu 2026 · Poro-2-8B tuotannossa — mitä kaksi projektia mittasi, miksi toinen otti sen käyttöön ja toinen ei, sekä sen ympärille rakennettu deterministinen kerros',
    cmdDownloadOptionTranslations:
      'heinäkuu 2026 · käännösauditointi — paikallinen suomen kielen malli lukee sivuston kaikki 396 suomenkielistä merkkijonoa englanninkielistä lähdettä vasten; sen 276 ehdotetusta muutoksesta vain 2 kesti',
    cmdDownloadOptionDelegation:
      'heinäkuu 2026 · maksavatko halvat agentit itsensä takaisin — seitsemän mitattua delegointia yhdestä istunnosta; 3 seitsemästä huomasi jotain, minkä olisin itse jättänyt huomaamatta, 1 oli väärä löydös, eikä säästöä väitetä, koska vertailukohtaa ei voi mitata',
    cmdDownloadResearchHint: 'nappaa mikä tahansa suoraan, esim. `download --catalog`.',
    cmdDownloadTryHint:
      'kokeile `download --cv`, `download --catalog`, `download --study`, `download --replicates`, `download --results`, `download --calibration` tai `download --finnish`.',
    cmdDownloadAmbiguous:
      'anna vain yksi seuraavista: --cv, --catalog, --study, --replicates, --results, --calibration tai --finnish.',
    cmdDownloadPreparing: 'valmistellaan latausta...',
    cmdDownloadNotAvailable: 'cv ei vielä saatavilla — vielä viimeistelyssä.',
    cmdDownloadSkillsNotAvailable:
      'skillien kalibrointi-pdf ei ole juuri nyt saatavilla — ota yhteyttä, niin lähetän sen.',
    cmdDownloadCatalogNotAvailable:
      'skillirekisterin pdf ei vielä saatavilla — luo se ajamalla `npm run build:skills-pdf`.',
    cmdDownloadStudyNotAvailable:
      'optimointitutkimuksen pdf ei ole juuri nyt saatavilla — ota yhteyttä, niin lähetän sen.',
    cmdDownloadReplicatesNotAvailable:
      'replikaattien pdf ei ole juuri nyt saatavilla — ota yhteyttä, niin lähetän sen.',
    cmdDownloadResultsNotAvailable:
      'skilliauditoijan tulosten pdf ei ole juuri nyt saatavilla — ota yhteyttä, niin lähetän sen.',
    cmdDownloadFinnishNotAvailable:
      'rag suomi -tutkimuksen pdf ei ole juuri nyt saatavilla — ota yhteyttä, niin lähetän sen.',
    cmdDownloadMethodologyNotAvailable:
      'rag suomi -tutkimuksen menetelmän pdf ei ole juuri nyt saatavilla — ota yhteyttä, niin lähetän sen.',
    cmdDownloadBlindTestNotAvailable:
      'sokkotestin pdf ei ole juuri nyt saatavilla — ota yhteyttä, niin lähetän sen.',
    cmdDownloadPoroNotAvailable:
      'poro-löydösten pdf ei ole juuri nyt saatavilla — ota yhteyttä, niin lähetän sen.',
    cmdDownloadTranslationsNotAvailable:
      'käännösauditoinnin pdf ei ole juuri nyt saatavilla — ota yhteyttä, niin lähetän sen.',
    cmdDownloadDelegationNotAvailable:
      'agenttidelegoinnin mittauksen pdf ei ole juuri nyt saatavilla — ota yhteyttä, niin lähetän sen.',
    cmdDownloadMeantime: 'sillä välin, ota yhteyttä:',
    cmdDownloadStarted: 'lataus aloitettu.',
    cmdClearDesc: 'tyhjennä näyttö',
    cmdManDesc: 'näytä komennon käyttöohje',
    cmdManUsage: 'man <komento>',
    cmdManNoEntry: 'ei manuaalimerkintää komennolle',
    cmdManNameLabel: 'NIMI',
    cmdManUsageLabel: 'KÄYTTÖ',
    cmdSkillsDesc: 'listaa claude code -skillit kaikista repoista',
    cmdSkillsUsage: 'käyttö: skills [--repo <nimi>|--all|--json]',
    cmdSkillsUnknownFlag: 'tuntematon valitsin:',
    cmdSkillsLoading: 'ladataan skillirekisteriä...',
    cmdSkillsNotGenerated: 'skillirekisteriä ei ole vielä luotu.',
    cmdSkillsNotGeneratedHint:
      'aja `skill-registry`-skilli paikallisesti ja pudota json polkuun public/data/skills-registry.json.',
    cmdSkillsGeneratedLabel: 'luotu:',
    cmdSkillsAggregateTip:
      'vinkki: `skills --repo <nimi>` tai `skills --all` näyttää lisätiedot.',
    cmdSkillsRepoNotFound: 'repoa ei löytynyt:',
    cmdSkillsJsonOpened: 'avattiin skills-registry.json uuteen välilehteen.',
    cmdSkillsColRepo: 'Repo',
    cmdSkillsColSkills: 'Skillit',
    cmdSkillsColRedirects: 'Uudelleenohj.',
    cmdSkillsColReceipts: 'Kuitit',
    cmdSkillsColTokensYr: 'Tokenia/v',
    cmdSkillsTotal:
      'yhteensä: {skills} skilliä · {redirects} uudelleenohjausta · {receipts} kuitein · ~{tokens} tokenia/v',
    cmdSkillsNoSkills: '(ei skillejä)',
    cmdSkillsKnownRepos: 'tunnetut repot:',
    cmdSkillsReceiptLabel: '[kuitti]',
    cmdSkillsPerYear: '/v',
    cmdLsDesc: 'listaa projektit (kokeile `ls projects`)',
    cmdLsNoSuch: 'No such file or directory',
    cmdCatDesc: 'tulosta projekti tai cv (esim. `cat projects/hrm`)',
    cmdCatUsage: 'käyttö: cat <polku> — kokeile `cat projects/hrm` tai `cat cv`',
    cmdCatNoSuch: 'No such file or directory',
    cmdCvDesc: 'lyhyt cv-yhteenveto',
    cmdCvDownloadHint: 'aja `download --cv` saadaksesi koko ansioluettelon (pdf).',
    cmdSudoDesc: 'suorita komento toisena käyttäjänä',
    cmdSudoHire:
      'pääsy myönnetty. laaditaan työtarjous — tavoitat minut yllä olevalla sähköpostilla.',
    cmdSudoDenied: 'hyvä yritys. tämä tapaus (ei) tule raportoiduksi.',
    cmdRmDesc: 'poista tiedostoja',
    cmdRmRefusal:
      'pelkäänpä etten voi antaa sinun tehdä niin. mikään täällä ei ole sinun poistettavissasi.',
    chatThinking: '...ajatellaan',
    chatError: 'yhteys katkesi — palataan käsikirjoitettuun tilaan.',
    chatAskUsage: 'käyttö: ask "kysymyksesi projekteista"',
    chatHint: '…tai kysy suoraan projekteista',
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
