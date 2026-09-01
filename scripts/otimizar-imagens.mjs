#!/usr/bin/env node
/**
 * Gera as versões otimizadas dos assets — WebP dimensionado para o tamanho em
 * que a imagem é de fato renderizada, mais o favicon e a imagem de OG.
 *
 * Os originais nunca são sobrescritos: cada `.webp` é gravado ao lado do
 * `.jpg`/`.png`, que continua sendo a fonte de alta resolução. O build prefere
 * o `.webp` quando ele existe, então reverter uma otimização é apagar o arquivo.
 *
 *   npm run otimizar
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.join(import.meta.dirname, '..');
const SURFACE = '#f3f7ee'; // --color-surface do design system

/**
 * `width` é o alvo em pixels do arquivo final — dobro do tamanho em que a
 * imagem aparece na tela, para telas retina. `null` mantém a dimensão original
 * (caso em que só a recompressão já resolve).
 *
 * `q` é a qualidade WebP. 90 só onde o render é grande e há rosto em destaque
 * (o retrato), porque é ali que o artefato salta aos olhos. Logo é arte chapada
 * e as fotos de card aparecem a ~360px: 82 basta, e a diferença é grande —
 * a foto de Pilates custa 80 KB em q82 contra 118 KB em q90.
 */
const TARGETS = [
  { src: 'logo-simbolo.png', width: 88, q: 82, note: 'header, 44×44 na tela' },
  { src: 'logo-completo.png', width: 352, q: 82, note: 'rodapé, 176px na tela' },
  { src: 'darcilene-retrato.jpg', width: null, q: 90, note: 'retrato, coluna ~550px' },
  { src: 'foto-senhora-pilates.jpg', width: 800, q: 82, note: 'cards' },
  { src: 'foto-ventosaterapia.jpg', width: 800, q: 82, note: 'cards' },
];

const kb = (n) => (n / 1024).toFixed(0).padStart(4) + ' KB';
const manifest = {};
let antes = 0, depois = 0;

console.log('\n  WebP\n');

for (const { src, width, q, note } of TARGETS) {
  const from = path.join(ROOT, src);
  if (!fs.existsSync(from)) { console.log(`  ! ${src} não encontrado`); continue; }

  const out = src.replace(/\.(jpe?g|png)$/i, '.webp');
  let img = sharp(from);
  const meta = await img.metadata();
  if (width && meta.width > width) img = img.resize({ width, withoutEnlargement: true });

  const buf = await img.webp({ quality: q, effort: 6 }).toBuffer();
  fs.writeFileSync(path.join(ROOT, out), buf);

  const dim = await sharp(buf).metadata();
  manifest[out] = { width: dim.width, height: dim.height };

  const de = fs.statSync(from).size;
  antes += de; depois += buf.length;
  const corte = (100 - (buf.length / de) * 100).toFixed(0);
  console.log(`  ${out.padEnd(28)} ${kb(de)} → ${kb(buf.length)}  −${corte}%   ${dim.width}×${dim.height}  q${q}  (${note})`);
}

// Favicon: o apple-touch-icon pede 180×180, bem maior que o logo do header.
const favicon = 'favicon.png';
await sharp(path.join(ROOT, 'logo-simbolo.png'))
  .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .png({ compressionLevel: 9, palette: true, quality: 90 })  // 27 KB → 9 KB, sem perda visível a 180px
  .toFile(path.join(ROOT, favicon));
manifest[favicon] = { width: 180, height: 180 };

// Imagem de compartilhamento: precisa de 1200×630 e não pode encolher junto
// com o logo do rodapé, ou o preview no WhatsApp quebra.
const og = 'og-image.jpg';
const logo = await sharp(path.join(ROOT, 'logo-completo.png'))
  .resize({ width: 520, withoutEnlargement: true }).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: SURFACE } })
  .composite([{ input: logo, gravity: 'center' }])
  .jpeg({ quality: 88 })
  .toFile(path.join(ROOT, og));
manifest[og] = { width: 1200, height: 630 };

// Dimensões dos originais que seguem em uso (o build injeta width/height).
for (const f of ['video-atendimento.mp4']) if (fs.existsSync(path.join(ROOT, f))) manifest[f] = null;

fs.writeFileSync(path.join(ROOT, 'assets.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`\n  Derivados`);
console.log(`  ${favicon.padEnd(28)} ${kb(fs.statSync(path.join(ROOT, favicon)).size)}         180×180  (apple-touch-icon)`);
console.log(`  ${og.padEnd(28)} ${kb(fs.statSync(path.join(ROOT, og)).size)}        1200×630  (Open Graph)`);
console.log(`\n  Total das convertidas: ${kb(antes)} → ${kb(depois)}  (−${(100 - (depois / antes) * 100).toFixed(0)}%)`);
console.log(`  assets.json escrito com ${Object.keys(manifest).length} entradas\n`);
