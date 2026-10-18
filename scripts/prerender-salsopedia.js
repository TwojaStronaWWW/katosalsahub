/**
 * Generator statycznego wsadu SEO (SSG Pre-render + Schema.org DefinedTermSet JSON-LD)
 * dla podstrony katosalsahub.pl/salsopedia.html (Zadanie #32).
 *
 * Cel: Pełna indeksacja wszystkich ~200 pojęć Salsopedii przez Googlebota
 * bez konieczności wykonywania asynchronicznego JavaScriptu (Zero Thin Content).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'data', 'salsopedia.json');
const HTML_PATH = path.join(ROOT_DIR, 'katosalsahub.pl', 'salsopedia.html');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanWikiLinks(text) {
  return String(text || '').replace(/\[([^\]]+)\]/g, '$1');
}

const terms = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));

// 1. Budowa struktury Schema.org DefinedTermSet (JSON-LD)
const jsonLdObject = {
  '@context': 'https://schema.org',
  '@type': 'DefinedTermSet',
  '@id': 'https://katosalsahub.pl/salsopedia.html#termset',
  name: 'Salsopedia - Encyklopedia Salsy Kubańskiej (Casino, Rueda, Timba, Afro)',
  description:
    'Otwarta baza ponad 200 figur, kroków, rytmiki, instrumentów i historii salsy kubańskiej tworzona przez społeczność Kato Salsa Hub.',
  url: 'https://katosalsahub.pl/salsopedia.html',
  inLanguage: 'pl-PL',
  publisher: {
    '@type': 'Organization',
    name: 'Kato Salsa Hub',
    url: 'https://katosalsahub.pl/',
  },
  hasDefinedTerm: terms.map((t) => ({
    '@type': 'DefinedTerm',
    name: t.term,
    description: cleanWikiLinks(t.definition),
    url: `https://katosalsahub.pl/salsopedia.html?term=${encodeURIComponent(t.id || t.term)}`,
  })),
};

// 2. Budowa statycznego katalogu HTML wewnątrz #wikiGrid (zastępowanego dynamicznie po hydracji wiki.js)
const cardsHtml = terms
  .map((t) => {
    const title = escapeHtml(t.term);
    const def = escapeHtml(cleanWikiLinks(t.definition));
    const id = escapeHtml(t.id || '');
    return `          <article class="wiki-card" data-term-id="${id}"><div class="card-header"><h3 class="term-title">${title}</h3></div><p class="term-definition">${def}</p></article>`;
  })
  .join('\n');

let html = fs.readFileSync(HTML_PATH, 'utf-8');

// Aktualizacja <head> w salsopedia.html (canonical, OpenGraph, preconnect, JSON-LD)
const seoHeadBlock = `  <meta name="theme-color" content="#fbbf24">
  <title>Salsopedia - Encyklopedia Salsy Kubańskiej | Kato Salsa Hub</title>
  <link rel="canonical" href="https://katosalsahub.pl/salsopedia.html">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="pl_PL">
  <meta property="og:site_name" content="Kato Salsa Hub">
  <meta property="og:title" content="Salsopedia - Encyklopedia Salsy Kubańskiej | Kato Salsa Hub">
  <meta property="og:description" content="Otwarta encyklopedia ponad 200 figur, kroków, rytmiki i kultury salsy kubańskiej (Casino, Rueda, Timba, Son, Rumba, Afro) tworzona przez Kato Salsa Hub.">
  <meta property="og:url" content="https://katosalsahub.pl/salsopedia.html">
  <meta property="og:image" content="https://katosalsahub.pl/assets/images/logo.jpg">
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="assets/css/style.css?v=3.7">
  <link rel="stylesheet" href="assets/css/components.css?v=3.7">
  <link rel="stylesheet" href="assets/css/sections.css?v=3.7">
  <link rel="stylesheet" href="assets/css/radio.css?v=3.7">
  <link rel="stylesheet" href="assets/css/wiki.css?v=3.7">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://stream.zeno.fm" crossorigin>
  <link rel="preconnect" href="https://api.zeno.fm" crossorigin>
  <link rel="preconnect" href="https://ai.twojastronawww.pl" crossorigin>
  <link rel="dns-prefetch" href="https://stream.zeno.fm">
  <link rel="dns-prefetch" href="https://api.zeno.fm">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@300;400;600;800&display=swap"
    rel="stylesheet">
  <link rel="icon" type="image/jpeg" href="assets/images/logo.jpg">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <script type="application/ld+json">
${JSON.stringify(jsonLdObject)}
  </script>
</head>`;

html = html.replace(/  <meta name="theme-color"[\s\S]*?<\/head>/, seoHeadBlock);
html = html.replace(
  /<span id="resultsCount">[\s\S]*?<\/span>/,
  `<span id="resultsCount">Baza wiedzy: ${terms.length} haseł</span>`
);
html = html.replace(
  /<div id="wikiGrid" class="wiki-grid">[\s\S]*?<\/div>\s*(?=\s*<!-- No Results Message -->)/,
  `<div id="wikiGrid" class="wiki-grid">\n${cardsHtml}\n        </div>\n\n`
);

fs.writeFileSync(HTML_PATH, html, 'utf-8');
console.log(`✅ Wygenerowano statyczny wsad SEO i JSON-LD dla ${terms.length} haseł w salsopedia.html`);
