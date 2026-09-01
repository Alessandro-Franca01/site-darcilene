#!/usr/bin/env node
/**
 * Converte os artboards do canvas (*.dc.html) em um site estático publicável.
 *
 * Os .dc.html são a fonte editável: o conteúdo vive dentro de <x-dc> e só
 * aparece depois que support.js carrega React de uma CDN externa. Aqui esse
 * envelope é desmontado e o resultado é HTML puro, sem JavaScript.
 *
 *   node build.mjs            build normal (marcadores pendentes = aviso)
 *   node build.mjs --strict   falha se sobrar qualquer [marcador] — usar antes de publicar
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');
const STRICT = process.argv.includes('--strict');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo.json'), 'utf8'));
const { site, pages } = config;
// Em preview da Vercel o domínio muda a cada deploy; canonical e OG seguem junto.
if (process.env.VERCEL_URL) site.baseUrl = `https://${process.env.VERCEL_URL}`;

const warnings = [];
const warn = (msg) => { warnings.push(msg); };

/* ---------------------------------------------------------------- helpers */

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Registro global de estilos: o mesmo style em páginas diferentes vira uma classe só. */
const cssRules = new Map();
function classFor(decls, pseudo = '') {
  const body = decls.trim().replace(/;$/, '');
  if (!body) return null;
  const name = (pseudo ? 'h-' : 's-') + hash(pseudo + body);
  if (!cssRules.has(name)) cssRules.set(name, `.${name}${pseudo}{${body}}`);
  return name;
}

/** Recorta um elemento pelo id, respeitando aninhamento da mesma tag. */
function cutElementById(html, tag, id) {
  const open = new RegExp(`<${tag}\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i');
  const m = open.exec(html);
  if (!m) return html;
  const scan = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'gi');
  scan.lastIndex = m.index + m[0].length;
  let depth = 1, hit;
  while ((hit = scan.exec(html))) {
    depth += hit[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(0, m.index) + html.slice(hit.index + hit[0].length);
  }
  warn(`<${tag} id="${id}"> não foi fechado — seção não removida`);
  return html;
}

/* ------------------------------------------------------------ transformações */

/** 1. Desmonta o envelope do canvas: fica só o conteúdo de <x-dc>, sem <helmet>. */
function unwrapCanvas(src, file) {
  const open = /<x-dc(?:\s[^>]*)?>/.exec(src);
  const close = src.lastIndexOf('</x-dc>');
  if (!open || close === -1) throw new Error(`${file}: <x-dc> não encontrado`);
  return src.slice(open.index + open[0].length, close)
    .replace(/<helmet>[\s\S]*?<\/helmet>/i, '')
    .trim();
}

/** 2+3. Hoisting: style="" vira .s-xxxx e style-hover="" vira .h-xxxx:hover. */
function hoistStyles(html) {
  const TAG = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  return html.replace(TAG, (full, tag, attrs, selfClose) => {
    const extra = [];

    attrs = attrs.replace(/\sstyle="([^"]*)"/g, (_, decls) => {
      const c = classFor(decls);
      if (c) extra.push(c);
      return '';
    });
    attrs = attrs.replace(/\sstyle-hover="([^"]*)"/g, (_, decls) => {
      const c = classFor(decls, ':hover');
      if (c) extra.push(c);
      return '';
    });
    if (!extra.length) return full;

    if (/\sclass="/.test(attrs)) {
      attrs = attrs.replace(/\sclass="([^"]*)"/, (_, c) => ` class="${c} ${extra.join(' ')}"`);
    } else {
      attrs = ` class="${extra.join(' ')}"` + attrs;
    }
    return `<${tag}${attrs.replace(/\s+/g, ' ').replace(/\s+$/, '')}${selfClose}>`;
  });
}

/** 4. <image-slot> vira <img> real, ou derruba a seção se a foto não existir. */
function resolveImageSlots(html, page) {
  const slots = [...html.matchAll(/<image-slot\b([^>]*)><\/image-slot>/g)];
  if (!slots.length) return html;

  const missing = [];
  for (const [, attrs] of slots) {
    const id = /\bid="([^"]*)"/.exec(attrs)?.[1] ?? '';
    if (!findAsset(`${id}.webp`) && !findAsset(`${id}.jpg`)) missing.push(id);
  }

  if (missing.length) {
    warn(`${page.slug}: fotos ausentes (${missing.join(', ')}) — seção "#${page.optionalSection}" omitida`);
    return cutElementById(html, 'section', page.optionalSection);
  }

  return html.replace(/<image-slot\b([^>]*)><\/image-slot>/g, (_, attrs) => {
    const id = /\bid="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const alt = /\bplaceholder="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const radius = /\bradius="([^"]*)"/.exec(attrs)?.[1] ?? '18';
    const file = findAsset(`${id}.webp`) ?? findAsset(`${id}.jpg`);
    const cls = classFor(`width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:${radius}px;display:block`);
    return `<img src="/assets/${file}" alt="${esc(alt)}" loading="lazy" decoding="async" class="${cls}">`;
  });
}

const findAsset = (name) => fs.existsSync(path.join(ROOT, name)) ? name : null;

/** 5+7. Links de arquivo viram URLs limpas; assets apontam para /assets/. */
function rewriteUrls(html) {
  // Preserva âncora e query: "Servicos.dc.html#ventosaterapia" → "/servicos#ventosaterapia".
  html = html.replace(/(href|src)="([\w.-]+\.dc\.html)((?:#|\?)[^"]*)?"/g, (full, attr, file, frag = '') => {
    const target = pages.find((p) => p.source === file);
    if (!target) { warn(`link para artboard desconhecido: ${file}`); return full; }
    return `${attr}="${target.url}${frag}"`;
  });
  return html.replace(/(src|href|poster)="\.\/([^"]+)"/g, (_, attr, file) => {
    // Prefere a versão otimizada quando ela existe (npm run otimizar); o canvas
    // segue apontando para o original em alta, que continua sendo a fonte.
    const webp = file.replace(/\.(jpe?g|png)$/i, '.webp');
    const use = webp !== file && findAsset(webp) ? webp : file;
    assetsUsed.add(use);
    return `${attr}="/assets/${use}"`;
  });
}
const assetsUsed = new Set();

/** Dimensões reais dos assets, escritas por scripts/otimizar-imagens.mjs. */
const assetDims = fs.existsSync(path.join(ROOT, 'assets.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'assets.json'), 'utf8'))
  : {};

/** Sem width/height o layout salta enquanto a imagem carrega (CLS no Lighthouse). */
function addImageDimensions(html) {
  return html.replace(/<img\b([^>]*)>/g, (full, attrs) => {
    if (/\bwidth=/.test(attrs)) return full;
    const src = /\bsrc="\/assets\/([^"]+)"/.exec(attrs)?.[1];
    const dim = src && assetDims[src];
    return dim ? `<img${attrs} width="${dim.width}" height="${dim.height}">` : full;
  });
}

/** 6. <head> completo — o que o canvas nunca teve. */
function buildHead(page) {
  const url = site.baseUrl + page.url;
  const ogImage = site.baseUrl + '/assets/' + site.ogImage;
  const ld = page.url === '/' ? `
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Physiotherapy',
    name: site.name,
    description: pages[0].description,
    url: site.baseUrl,
    telephone: site.telephone,
    image: ogImage,
    areaServed: site.areaServed,
    priceRange: '$$',
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '08:00', closes: '18:00',
    }],
  })}</script>` : '';

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1e5c37">
<link rel="icon" href="/assets/${site.favicon}">
<link rel="apple-touch-icon" href="/assets/${site.favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${site.fontHref}">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/generated.css">
<link rel="stylesheet" href="/responsive.css">${ld}`;
}

/* --------------------------------------------------------- passe responsivo */

/** Conta as trilhas de um grid-template-columns; 0 = já é fluido (auto-fit/fill). */
function trackCount(value) {
  if (/repeat\(\s*auto-/.test(value)) return 0;
  const rep = /repeat\(\s*(\d+)\s*,/.exec(value);
  if (rep) return Number(rep[1]);
  return value.trim().split(/\s+(?![^(]*\))/).length;
}

/**
 * Deriva as media queries dos próprios estilos hoisted, em vez de uma lista
 * manual de seletores: se o canvas mudar, o responsivo acompanha sozinho.
 */
function autoResponsive() {
  const at900 = [], at640 = [];

  for (const [name, rule] of cssRules) {
    if (name.startsWith('h-')) continue;
    const body = rule.slice(rule.indexOf('{') + 1, -1);

    const grid = /(?:^|;)\s*grid-template-columns\s*:\s*([^;]+)/.exec(body);
    if (grid) {
      const n = trackCount(grid[1]);
      // 3+ colunas caem para 2; duas colunas assimétricas (ex.: hero 1.05fr/0.95fr)
      // já não cabem em tablet e caem direto para uma.
      if (n >= 3) at900.push(`.${name}{grid-template-columns:repeat(2,1fr)}`);
      else if (n === 2 && !/^\s*1fr\s+1fr\s*$/.test(grid[1])) at900.push(`.${name}{grid-template-columns:1fr}`);
      if (n >= 2) at640.push(`.${name}{grid-template-columns:1fr}`);
    }

    const font = /(?:^|;)\s*font-size\s*:\s*(\d+)px/.exec(body);
    if (font && Number(font[1]) >= 32) {
      at640.push(`.${name}{font-size:${Math.round(Number(font[1]) * 0.62)}px}`);
    }

    const pad = /(?:^|;)\s*padding\s*:\s*([^;]+)/.exec(body);
    if (pad && /\b(4[89]|[5-9]\d|\d{3,})px/.test(pad[1])) {
      const tight = pad[1].replace(/(\d+)px/g, (_, v) => Math.max(16, Math.round(v * 0.5)) + 'px');
      at640.push(`.${name}{padding:${tight}}`);
    }
  }

  const block = (q, rules) => rules.length
    ? `\n@media (max-width:${q}px){\n${[...new Set(rules)].sort().join('\n')}\n}\n` : '';
  return { css: block(900, at900) + block(640, at640), count: at900.length + at640.length };
}

/* --------------------------------------------------------------------- build */

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(ASSETS, { recursive: true });

const built = [];
const emitted = new Map();
const omittedAnchors = new Set();
for (const page of pages) {
  let html = unwrapCanvas(fs.readFileSync(path.join(ROOT, page.source), 'utf8'), page.source);
  html = resolveImageSlots(html, page);
  html = rewriteUrls(html);
  html = addImageDimensions(html);
  html = hoistStyles(html);

  const pending = [...html.matchAll(/\[[a-zà-ú][^\]]{2,40}\]/gi)].map((m) => m[0]);
  if (pending.length) warn(`${page.slug}: marcador de conteúdo pendente ${[...new Set(pending)].join(' ')}`);

  // Auto-verificação: nada do runtime do canvas pode sobreviver no HTML servido.
  for (const leak of ['x-dc', 'support.js', 'style-hover', 'unpkg', '.dc.html', '<image-slot', 'style="']) {
    if (html.includes(leak)) warn(`${page.slug}: resíduo do canvas no HTML final — "${leak}"`);
  }

  if (page.optionalSection && !html.includes(`id="${page.optionalSection}"`)) {
    omittedAnchors.add(`${page.url}#${page.optionalSection}`);
  }
  const doc = `<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n${buildHead(page)}\n</head>\n<body>\n${html}\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(DIST, page.slug), doc);
  emitted.set(page.url, { slug: page.slug, doc });
  built.push(page.slug);
}

// Âncora para uma seção omitida ficaria morta: degrada o link para a própria página.
for (const [url, page] of emitted) {
  let doc = page.doc, changed = false;
  for (const anchor of omittedAnchors) {
    if (!doc.includes(`href="${anchor}"`)) continue;
    const fallback = anchor.split('#')[0];
    doc = doc.replaceAll(`href="${anchor}"`, `href="${fallback}"`);
    warn(`${url}: link para ${anchor} degradado para ${fallback} (seção omitida)`);
    changed = true;
  }
  if (changed) fs.writeFileSync(path.join(DIST, page.slug), doc);
}

// generated.css — ordem estável para não gerar diff a cada build
const responsive = autoResponsive();
fs.writeFileSync(path.join(DIST, 'generated.css'),
  '/* Gerado por build.mjs a partir dos style= e style-hover= dos artboards. Não editar. */\n'
  + [...cssRules.keys()].sort().map((k) => cssRules.get(k)).join('\n') + '\n'
  + responsive.css);

// styles.css sem o @import de fonte (agora é <link> com preconnect no <head>)
fs.writeFileSync(path.join(DIST, 'styles.css'),
  fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8')
    .replace(/^@import url\(['"]https:\/\/fonts\.googleapis\.com[^)]*\);\s*$/m, ''));

fs.copyFileSync(path.join(ROOT, 'responsive.css'), path.join(DIST, 'responsive.css'));

for (const file of assetsUsed) {
  const from = path.join(ROOT, file);
  if (!fs.existsSync(from)) { warn(`asset referenciado mas ausente: ${file}`); continue; }
  fs.copyFileSync(from, path.join(ASSETS, path.basename(file)));
}
for (const extra of [site.favicon, site.ogImage]) {
  // Nenhum dos dois aparece no HTML — só no <head> — então não entram por assetsUsed.
  if (findAsset(extra)) fs.copyFileSync(path.join(ROOT, extra), path.join(ASSETS, extra));
  else warn(`asset do <head> ausente: ${extra}`);
}

fs.writeFileSync(path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${site.baseUrl}/sitemap.xml\n`);

fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + pages.map((p) => `  <url><loc>${site.baseUrl}${p.url}</loc></url>`).join('\n')
  + `\n</urlset>\n`);

/* -------------------------------------------------------------------- relato */

const kb = (f) => (fs.statSync(path.join(DIST, f)).size / 1024).toFixed(1) + ' KB';
console.log(`\n  ${built.length} páginas → dist/`);
for (const f of built) console.log(`    ${f.padEnd(16)} ${kb(f)}`);
console.log(`    ${'generated.css'.padEnd(16)} ${kb('generated.css')}  (${cssRules.size} regras)`);
console.log(`    ${'assets/'.padEnd(16)} ${assetsUsed.size} arquivos`);

if (warnings.length) {
  console.log('');
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (STRICT && warnings.some((w) => w.includes('marcador'))) {
  console.error('\n  --strict: há marcadores de conteúdo pendentes. Build recusado.\n');
  process.exit(1);
}
console.log('');
