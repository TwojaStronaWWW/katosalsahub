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

// 1. Budowa struktury Schema.org DefinedTermSet w grafie @graph (JSON-LD [REF-08])
const jsonLdObject = {
  '@context': 'https://schema.org',
  '@graph': [
    {
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
    },
  ],
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

// Aktualizacja <head> w salsopedia.html zgodnie z kolejnością capo.js ([REF-02])
const seoHeadBlock = `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salsopedia – Figury Salsy i Szkoły Katowice | Kato Salsa Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
  <link rel="preconnect" href="https://stream.zeno.fm" crossorigin>
  <link rel="preconnect" href="https://api.zeno.fm" crossorigin>
  <link rel="preconnect" href="https://ai.twojastronawww.pl" crossorigin>
  <link rel="dns-prefetch" href="https://stream.zeno.fm">
  <link rel="dns-prefetch" href="https://api.zeno.fm">
  <link rel="stylesheet" href="assets/css/style.css?v=5.1">
  <link rel="stylesheet" href="assets/css/components.css?v=5.1">
  <link rel="stylesheet" href="assets/css/sections.css?v=5.1">
  <link rel="stylesheet" href="assets/css/radio.css?v=5.1">
  <link rel="stylesheet" href="assets/css/wiki.css?v=5.1">
  <link rel="stylesheet" href="assets/css/schedule.css?v=5.1">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@300;400;600;800&display=swap"
    rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <meta name="description" content="Salsopedia – otwarta encyklopedia 200+ figur salsy kubańskiej (Casino, Rueda, Timba), katalog szkół tańca i instruktorów w Katowicach • Kato Salsa Hub.">
  <meta name="keywords" content="salsopedia, figury salsy kubańskiej, komendy rueda de casino, szkoły tańca katowice, instruktorzy salsy katowice, salsa katowice, kato salsa hub">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <meta name="geo.region" content="PL-24">
  <meta name="geo.placename" content="Katowice">
  <meta name="geo.position" content="50.257728;19.024833">
  <meta name="ICBM" content="50.257728, 19.024833">
  <meta name="theme-color" content="#fbbf24">
  <link rel="canonical" href="https://katosalsahub.pl/salsopedia.html">
  <link rel="alternate" hreflang="pl" href="https://katosalsahub.pl/salsopedia.html">
  <link rel="alternate" hreflang="es" href="https://katosalsahub.pl/salsopedia.html?lang=es">
  <link rel="alternate" hreflang="en" href="https://katosalsahub.pl/salsopedia.html?lang=en">
  <link rel="alternate" hreflang="x-default" href="https://katosalsahub.pl/salsopedia.html">
  <link rel="alternate" type="text/markdown" href="https://katosalsahub.pl/llms.txt" title="LLMs.txt – Baza wiedzy AI Kato Salsa Hub">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="pl_PL">
  <meta property="og:site_name" content="Kato Salsa Hub – Salsa Katowice">
  <meta property="og:title" content="Salsopedia – Figury Salsy i Szkoły Katowice | Kato Salsa Hub">
  <meta property="og:description" content="Otwarta encyklopedia ponad 200 figur, kroków, rytmiki i kultury salsy kubańskiej (Casino, Rueda, Timba) oraz szkół tańca w Katowicach.">
  <meta property="og:url" content="https://katosalsahub.pl/salsopedia.html">
  <meta property="og:image" content="https://katosalsahub.pl/assets/images/hero.png">
  <meta property="og:image:width" content="800">
  <meta property="og:image:height" content="800">
  <meta property="og:image:alt" content="Salsopedia – Encyklopedia Salsy Kubańskiej i Szkół Tańca w Katowicach">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Salsopedia – Figury Salsy i Szkoły Katowice | Kato Salsa Hub">
  <meta name="twitter:description" content="Otwarta encyklopedia ponad 200 figur salsy kubańskiej (Casino, Rueda, Timba), katalog szkół tańca i instruktorów w Katowicach.">
  <meta name="twitter:image" content="https://katosalsahub.pl/assets/images/hero.png">
  <link rel="manifest" href="manifest.json">
  <link rel="icon" type="image/jpeg" href="assets/images/logo.jpg">
  <script type="application/ld+json">
${JSON.stringify(jsonLdObject)}
  </script>
</head>`;

html = html.replace(/<head>[\s\S]*?<\/head>/, seoHeadBlock);
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
