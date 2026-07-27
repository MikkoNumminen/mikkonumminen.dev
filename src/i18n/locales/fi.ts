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
    listHeading: 'Hyppää projektiin',
    listAriaLabel: 'Projektiluettelo',
    listToggleExpand: 'Näytä projektiluettelo',
    listToggleCollapse: 'Piilota projektiluettelo',
  },
  projectsData: {
    hrm: {
      tagline: 'Full-stack-henkilöstöhallintajärjestelmä',
      description:
        'Tuotantovalmis HR-järjestelmä portfoliotasoisella toteutuksella. Kaksi tietokantaa (PostgreSQL rakenteelliselle datalle, MongoDB muuttumattomalle, hajautusketjutetulle auditlokille), 38 käyttöoikeutta käyttäjäkohtaisilla poikkeuksilla, TOTP-kaksivaiheinen tunnistautuminen, palvelinpuolen nopeusrajoitus, OpenTelemetry-jäljitys, 18 kieltä ja reaaliaikaiset toimintailmoitukset SSE:llä (polling-varavaihtoehdolla).',
      highlights: ['2906+ testiä', '92,2 % rivikattavuus', 'PostgreSQL + MongoDB'],
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
        'Henkilökohtainen lukupäiväkirja. Hakee kirjatiedot Google Booksista ja Open Librarysta samanaikaisesti, joten kirjan lisääminen on nopeaa — valitset vain formaatin (paperi, e-kirja tai äänikirja), 0–5 tähden arvion ja milloin luit sen. Etusivulla näkyy mitä muut ovat lukeneet viime aikoina.',
      highlights: ['90 testiä', 'Monilähde-haku'],
    },
    'readlog-dotnet': {
      tagline: 'ReadLog käännettynä ASP.NET Coreen',
      description:
        'Idiomaattinen ASP.NET Core -käännös ReadLogista, käynnissä ilmaiseksi Azure App Servicessä. Sama lukupäiväkirjasovellus — hae Open Librarysta ja Google Booksista, kirjaa kirjat formaatilla, lukupäivämäärällä ja 0–5 tähden arviolla, selaa kirjastoasi ja julkista "viimeksi luettua" -syötettä — toteutettuna uudelleen .NET 8 Razor Pagesilla, EF Core + SQLitellä ja ASP.NET Core Identityllä (paikallinen ja Google-kirjautuminen). Kontitettu ja toimitettu tarkastajan hyväksymällä GitHub Actions -putkella GHCR:ään ja sieltä Azureen OIDC:n yli; EF Core -migraatiot ajetaan ensimmäisellä käynnistyksellä.',
      highlights: [
        'ASP.NET Core 8 -käännös',
        'Live Azure App Servicessä',
        'EF Core · SQLite · OIDC-julkaisu',
      ],
    },
    audiobookmaker: {
      tagline: 'PDF → äänikirja',
      description:
        'Työpöytäsovellus joka muuntaa PDF-, EPUB-, Word/DOCX- ja tekstitiedostot äänikirjoiksi; skannatut PDF:t ajetaan ensin Tesseract-OCR:n läpi. Neljä puhesynteesimoottoria: Edge-TTS (pilvi, 30+ ääntä kuudella kielellä), Piper (offline, ei vaadi GPU:ta), Chatterbox "Grandmom"-äänellä äänen kloonaukseen referenssinäytteestä ja VoxCPM2 zero-shot-äänenkloonaukseen ja -suunnitteluun tekstistä (vaatii NVIDIA-näytönohjaimen, vain kehittäjäasennus). Sama Chatterbox-moottori ääninäyttelee Spacepotatiksen pelin sisäisen tarinan. Englannin puhesynteesi toimii jo hyvin; suomi on vaikeampi syntetisoida käytettävissä olevilla resursseilla, joten sitä varten on rakennettu 19-vaiheinen normalisointiputki joka hoitaa numeroiden kontekstitaivutuksen, lyhenteiden purkamisen, yksikkösymbolien käsittelyn ja vierassanojen ääntämiskorjaukset — laatu paranee joka julkaisun myötä. Jaetaan Windows-asennusohjelmana automaattipäivityksillä ja 3000+ testillä.',
      highlights: [
        'Chatterbox-ääniklooni Grandmom-äänellä',
        '19-vaiheinen suomen kielen normalisointi, 3000+ testiä',
        'Antaa äänen Spacepotatiksen tarinalle',
      ],
    },
    spacepotatis: {
      tagline: 'Selainampumapeli — perunasi vastaan galaksi',
      description:
        'Selainpeli, jossa suojakuplaan suljettu peruna ampuu hyönteisiä proseduraalisessa galaksissa. Käynnistyy kuin vanha terminaali, avautuu 3D-aurinkokunnaksi jota voit pyörittää ja zoomata, ja heittää sinut ylhäältä alas vyöryvään taisteluun Tyrian 2000:n hengessä. Next.js 16 + React 19 -kuori Phaser 4 -taistelukentän ympärillä, Three.js + GSAP galaksinäkymässä ja kamerasiirtymässä taisteluun, PostgreSQL Neonissa Kyselyn (tyypitetty SQL-rakentaja, ei ORM:ää) kautta. Kaikki äänet AudiobookMakerin tuottamia, kaikki musiikki kirjoitettu strudel-patterns-repoon. Mukana kokoelma omia Claude Code -skillejä .claude/skills/-hakemistossa — versionhallittuja, auditoituja, tuotantoartefaktien tavoin käsiteltyjä.',
      highlights: [
        'Next.js 16 + Phaser 4 + Three.js',
        '~1300 testiä, CI joka pushissa',
        'Omat Claude Code -skillit tuotantoartefakteina',
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
    'claude-continue': {
      tagline: 'Pidä Claude Code -ikkunat peräkkäin',
      description:
        'Alustariippumaton Python-työkalu — CLI ja yhden napin Tkinter-käyttöliittymä — joka pitää Claude Coden 5-tuntiset käyttöikkunat peräkkäin. Se lukee aktiivisen ikkunan nollautumisajan ccusagesta, odottaa vaihtumista ja jatkaa keskeytettyjä istuntoja — broadcast iTerm2:een macOS:llä, tmux-paneeleihin macOS:llä tai Linuxilla, tai headless-ajo Windowsilla/WSL:llä — ja virittyy seuraavaa ikkunaa varten. Toimii valvomatta launchd:n (macOS) tai Windowsin Task Schedulerin kautta. Rakennettu pitkiin autonomisiin agenttiajoihin — ja rehellinen siitä tarkastusvelasta, jota se synnyttää.',
      highlights: [
        'Python · Tkinter-GUI',
        'macOS · Windows · WSL · Linux (tmux)',
        'Valvomatta launchd / Task Scheduler',
      ],
    },
    passwordmanager: {
      tagline: 'Nollatietomallin salasananhallinta Rustilla',
      description:
        'Paikallislähtöinen salasananhallinta, jossa yksi ainoa Rust-kirjasto on ainoa paikka missä salaus tapahtuu — Argon2id-avaimenjohto ja XChaCha20-Poly1305-autentikoitu salaus, käännettynä sekä natiivisti että WebAssemblyksi. Neljä asiakassovellusta jakaa sen: offline-ensin CLI-holvi SQLitellä, synkronointipalvelin joka tallentaa vain salattua dataa, selaimessa toimiva WASM-asiakas ja Chrome-laajennus autofillillä ja tallennuksella kirjautuessa. Merkintäkohtaiset noncet ja AEAD sidottuna merkinnän id:hen ja aikaleimaan estävät tietueiden vaihtamisen; avaimet nollataan käytön jälkeen; pääsalasana ei koskaan poistu asiakkaalta. Jokainen turvallisuuspäätös on kirjattu ADR:ksi eksplisiittistä uhkamallia vasten, ja CI estää salaisuudet pääsemästä repoon samalla kun se ajaa formatoinnin, clippyn, koko työtilan testit ja wasm-käännöksen.',
      highlights: [
        'Yksi salauskirjasto, neljä asiakassovellusta',
        'Argon2id + XChaCha20-Poly1305',
        'Palvelin tallentaa vain salattua dataa',
      ],
    },
    'claude-agents': {
      tagline: 'Kustannusreititetyt subagentit Claude Codelle',
      description:
        'Pieni globaali kokoelma Claude Code -subagentteja, joka lopettaa Opus-hintojen maksamisen työstä jonka halvempi malli hoitaa yhtä hyvin. Kaksitoista agenttia, joista jokainen kiinnittää sekä mallitason että päättelyponnistuksen frontmatterissaan: Haiku vain-luku-tiedusteluun (scout, log-miner, scribe, dep-checker, tidy), Sonnet spesifikaatio-ohjattuihin muokkauksiin (mechanic, test-writer, locale-translator, doc-scribe, migrator, bisect) ja kiinnittämätön architect joka perii istunnon mallin suunnittelutyötä varten. Agentit tunnistavat itse kunkin repon teknologiapinon — testiajurin, linterin, i18n-rakenteen — joten yksi kokoelma kattaa JS-, C#- ja Python-projektit. Asentuu Claude Code -pluginina jaetusta markkinapaikasta tai skriptillä. MIT-lisensoitu.',
      highlights: [
        '12 malliin kiinnitettyä agenttia',
        'Erottaa mallitason päättelyponnistuksesta',
        'Plugin- tai skriptiasennus',
      ],
    },
    'feedback-intelligence': {
      tagline: 'Perusteltua palauteanalyysia paikallisella LLM:llä',
      description:
        'Palautteen älymoottori joka muuntaa sekavan vapaamuotoisen palautteen tilannekohtaiseksi signaaliksi päästämättä LLM:ää käsiksi lukuihin: deterministinen, sääntökoodattu hälytyskerros laskee jokaisen luvun ja trendin, ja LLM ainoastaan jäsentää syötteen ja syntetisoi teemakertomukset — jokainen väite sidottu takaisin palaute-id:ihin ja pudotetaan varajärjestelmään jos se ei läpäise validointia. Toimialat ovat liitettäviä moduuleja (ensimmäisenä: suomalainen ruoka- ja rautakaupan hybridivähittäiskauppa); konfiguraatioasetus vaihtaa toisen toimialan ilman ydinmuutoksia. .NET 8 paikallisen Poro 2 8B:n päällä Ollamassa — valittu 30 kierroksen sokkotestissä — ja live-demo Azure Static Web Appsissa joka tavoittaa paikallisen GPU:n Tailscale Funnelin kautta ilman pilvipäättelyn kustannuksia. GDPR-puhdas synteettinen korpus, kerroksittainen prompt-injektiosuoja, hermeettinen xUnit-testisarja CI:ssä.',
      highlights: [
        'Deterministiset hälytykset — LLM ei koskaan laske lukuja',
        'Liitettävät toimialat, ei ydinmuutoksia',
        'Live-demo Azuressa, päättely paikallisella GPU:lla',
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
