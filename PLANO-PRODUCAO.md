# Plano — Site Darcilene Xavier em produção via Cloudflare Tunnel

## Contexto

O que existe em `C:\Projetos\Sites\site-darcilene` não é um site publicável: são **4 artboards de um canvas do Claude Design** (`Home`, `Sobre`, `Servicos`, `Contato` em `.dc.html`), desenhados para serem editados visualmente, não servidos a visitantes.

Diagnóstico levantado nos arquivos:

| Problema | Evidência |
|---|---|
| Conteúdo renderizado por React em runtime | `support.js:1073-1077` baixa React 18 UMD + ReactDOM (+ Babel) de `unpkg.com`; todo o HTML vive dentro de `<x-dc>` e só existe depois do boot |
| Zero SEO | Nenhum `<title>`, `description`, `og:`, `lang` ou favicon nas 4 páginas |
| Não responsivo | **0 ocorrências de `@media`** em `styles.css` e nas 4 páginas; grids fixos (`grid-template-columns:1.05fr 0.95fr`), H1 de 50px |
| Estilos 100% inline | Impede qualquer override por media query (inline vence stylesheet na cascata) |
| Atributos proprietários | 48 `style-hover` (Home 17, Servicos 13, Sobre 9, Contato 9) — só funcionam com o runtime |
| URLs de arquivo | `/Home.dc.html`, `/Servicos.dc.html` |
| Placeholders no texto | `[cidade e região]` nas 4 páginas; `CREFITO nº [inserir número de registro]` em `Sobre` |
| Galeria vazia | 4 `<image-slot>` sem `src` em `Servicos.dc.html` (`antes-1`, `depois-1`, `antes-2`, `depois-2`) |
| Peso morto | `photo-darcilene.jpg` (700 KB) e `uploads/` (~1,5 MB) não são referenciados — 2,2 MB dos 4,5 MB |
| Sem versionamento | Não é repositório git |
| `cloudflared` | Não instalado nesta máquina |

**Resultado esperado:** um site estático real (zero JS, sem dependência de CDN externa, responsivo, indexável), servido desta máquina por Caddy e publicado na internet por um Cloudflare Tunnel nomeado, com HTTPS e cache da Cloudflare na frente.

**Nota:** o canvas em `.dc.html` continua sendo a fonte de edição visual. O build lê os artboards e gera `dist/` — os originais na raiz não são substituídos.

## Decisões já tomadas

- **Hospedagem:** Cloudflare Tunnel (decisão do usuário). Consequência aceita: o site depende deste PC ligado, com energia e internet.
- **Domínio:** existe, mas está fora da Cloudflare → o plano inclui a migração de nameservers.
- **Galeria Antes/Depois:** o usuário fornecerá as 4 fotos; o build já deixa os `<img>` prontos apontando para `dist/assets/`.
- **Servidor de origem:** Caddy como serviço do Windows (HTTP/2, compressão, URLs limpas, cache headers nativos).

## Bloqueios antes de ligar o túnel

1. **Cidade de atendimento** — substitui `[cidade e região]` em 4 páginas.
2. **Número do CREFITO** — obrigatório na divulgação profissional (`Sobre.dc.html`).
3. **4 fotos Antes/Depois** — sem elas, a seção sai do build.

Enquanto não vierem, o build mantém os marcadores visíveis e o site não deve ir ao ar.

---

## Fase 1 — Build estático (`build.mjs`)

Script Node 22 sem dependências (só `node:fs`/`node:path`), rodado com `node build.mjs`. Lê os 4 `.dc.html` da raiz e escreve `dist/`.

Transformações, em ordem:

1. **Desmontar o envelope do canvas:** extrair o conteúdo entre `<x-dc>` e `</x-dc>`; remover `<script src="./support.js">`; mover o conteúdo de `<helmet>` para o `<head>` real, descartando `<script src="./image-slot.js">`.
2. **Hoisting dos estilos inline** — a mudança central. Cada `style="..."` único vira uma classe determinística (`.s-<hash8>`) em `dist/generated.css`, e o elemento recebe `class="s-<hash8>"`. Isso tira o inline da cascata (pré-requisito do responsivo), deduplica estilos repetidos e reduz muito o HTML.
3. **`style-hover` → CSS real:** cada valor vira `.h-<hash8>:hover{...}` em `generated.css`, com a classe somada ao elemento; o atributo é removido.
4. **`<image-slot>` → `<img>`:** os 4 slots de `Servicos` viram `<img src="/assets/<id>.webp" alt="..." loading="lazy" width height>` preservando `aspect-ratio:1/1`, `object-fit:cover` e `border-radius:18px`. Se o arquivo não existir em `assets/`, o build **omite a seção inteira** e emite aviso — nunca publica placeholder vazio.
5. **URLs limpas:** `Home.dc.html`→`/`, `Sobre.dc.html`→`/sobre`, `Servicos.dc.html`→`/servicos`, `Contato.dc.html`→`/contato`. Saída em `dist/index.html`, `dist/sobre.html`, etc. (o `try_files` do Caddy resolve).
6. **`<head>` completo** montado a partir de `seo.json` (Fase 2).
7. **Copiar assets** referenciados para `dist/assets/`, reescrevendo os `./arquivo.ext` para `/assets/arquivo.ext`. `photo-darcilene.jpg` e `uploads/` ficam de fora.
8. **Anexar `responsive.css`** (Fase 3) depois de `generated.css`, para vencer por ordem de origem.

O build deve ser **idempotente** (limpa `dist/` antes) e falhar com código de saída ≠ 0 se algum marcador `[...]` sobreviver — trava de segurança contra publicar `[cidade]`.

**Arquivos criados:** `build.mjs`, `seo.json`, `responsive.css`
**Arquivos lidos:** `Home.dc.html`, `Sobre.dc.html`, `Servicos.dc.html`, `Contato.dc.html`, `styles.css`

## Fase 2 — SEO e `<head>` (`seo.json`)

Um objeto por página com `title`, `description`, `slug`, `ogImage`. O build gera para cada uma:

- `<html lang="pt-BR">`, `<title>`, `<meta name="description">`
- `<link rel="canonical">` absoluto
- OG + Twitter Card (imagem de compartilhamento derivada de `logo-completo.png`)
- Favicon a partir de `logo-simbolo.png` (`.ico` 32px + `apple-touch-icon` 180px)
- `<link rel="preconnect">` para `fonts.googleapis.com`/`fonts.gstatic.com` (a Archivo é importada em `styles.css:2`); alternativa melhor: auto-hospedar a fonte e remover o `@import`
- **JSON-LD `LocalBusiness`/`Physiotherapy`** só no `index.html`: nome, telefone `+5583988559983`, `areaServed`, `openingHours` (seg–sex 08:00–18:00), `url`. É o que sustenta a busca local, o canal real desse negócio.

Também: `dist/robots.txt`, `dist/sitemap.xml` (4 URLs) e uma `dist/404.html` reaproveitando o header/footer.

## Fase 3 — Responsivo (`responsive.css`)

Como as classes geradas são hashes, os overrides precisam de âncoras estáveis: adicionar `data-r="..."` nos ~10 contêineres relevantes dos `.dc.html` de origem (o canvas ignora atributos extras) e escrever as media queries contra `[data-r="..."]`.

Âncoras e comportamento:

| Âncora | ≤900px | ≤640px |
|---|---|---|
| `header` | nav quebra para segunda linha | logo + botão Agendar; nav em menu horizontal rolável |
| `hero` | grid 2col → 1col, imagem depois do texto | H1 50px → 30px, padding 72px → 40px |
| `cards` / `servicos` | 3col → 2col | 1col |
| `antes-depois` | mantém 2col | 1col |
| `contato` | 2col → 1col | idem |
| `footer` | colunas empilham | idem |

Regra geral no topo: `img,video{max-width:100%;height:auto}` e `body{overflow-x:hidden}` como rede de segurança.

## Fase 4 — Assets  *(mapeada, não executada)*

**Status:** pendente. Não bloqueia deploy — o site já funciona. É ganho de
performance e de custo de banda, a ser feito quando fizer diferença (Lighthouse
baixo, 3G lento, ou quando a Vercel começar a cobrar tráfego).

### Diagnóstico medido

Dimensão real do arquivo contra o tamanho em que ele é de fato renderizado:

| Arquivo | Original | Renderizado | Alvo (2x) | Estimado | Ganho |
|---|---|---|---|---|---|
| `darcilene-retrato.jpg` | 687×906, **700 KB** | coluna ~550px | 687px (mantém) | ~70 KB | **90%** |
| `logo-completo.png` | 760×747, **207 KB** | 176px de largura | 352px | ~15 KB | **93%** |
| `logo-simbolo.png` | 520×543, **138 KB** | **44×44px** | 88px | ~4 KB | **97%** |
| `foto-senhora-pilates.jpg` | 1078×1243, 190 KB | card ~360px | 800px | ~60 KB | 68% |
| `foto-ventosaterapia.jpg` | 868×1280, 86 KB | card ~360px | 800px | ~50 KB | 42% |
| `video-atendimento.mp4` | 344 KB | 118×88px | — | manter | — |

O caso mais grave é o `logo-simbolo.png`: 138 KB entregues para desenhar 44×44
pixels, em **todas** as páginas. O `darcilene-retrato.jpg` tem 700 KB para
687px de largura — está salvo em qualidade quase sem perdas, não é questão de
dimensão. Hoje a home baixa **1,3 MB só de imagem**; a estimativa depois é
~200 KB.

### Como plugar no build (a única mudança de código)

Não é preciso tocar nos artboards nem no HTML. Em `rewriteUrls()`, fazer o build
**preferir um irmão `.webp`** quando ele existir:

```js
return html.replace(/(src|href|poster)="\.\/([^"]+)"/g, (_, attr, file) => {
  const webp = file.replace(/\.(jpe?g|png)$/i, '.webp');
  const use = (webp !== file && fs.existsSync(path.join(ROOT, webp))) ? webp : file;
  assetsUsed.add(use);
  return `${attr}="/assets/${use}"`;
});
```

Consequências: a conversão passa a ser opt-in por arquivo, o canvas continua
apontando para os `.jpg`/`.png` originais (que seguem sendo a fonte de alta
resolução), e reverter é apagar o `.webp`. Nenhum `<picture>` é necessário —
WebP tem suporte universal desde 2020.

### Como converter

Nenhuma ferramenta de imagem está instalada nesta máquina (`cwebp`, `magick` e
`ffmpeg` ausentes). Como o build já roda em Node, o caminho de menor atrito é
`sharp` como devDependency — sem instalação de sistema:

```bash
npm init -y && npm i -D sharp
node scripts/otimizar-imagens.mjs   # a escrever: lê a tabela acima, gera os .webp
```

O script deve redimensionar para o alvo da tabela, converter em WebP com
qualidade ~82, e **nunca sobrescrever o original** — grava o `.webp` ao lado.

### Dois cuidados

1. **A imagem de OG não pode encolher.** `logo-completo.png` acumula dois papéis:
   logo do rodapé (176px) e imagem de compartilhamento em `seo.json`. Reduzir
   para 352px estraga o preview no WhatsApp e no Facebook, que querem ≥1200×630.
   Gerar um `og-image.jpg` dedicado (1200×630, fundo sólido, logo centralizado) e
   apontar `site.ogImage` para ele.
2. **`width`/`height` explícitos nos `<img>`.** Hoje não existem, e sem eles há
   layout shift durante o carregamento (penalizado no Lighthouse). Como o build
   já conhece cada arquivo, ele pode ler as dimensões e injetar os atributos
   sozinho — vale fazer junto.

### Verificação

- `du -sh dist/assets/` sai de ~1,7 MB para ~600 KB (o vídeo passa a dominar)
- Aba Network do DevTools na home: total de imagem abaixo de 250 KB
- Lighthouse mobile ≥ 90 em Performance
- Nenhum `.jpg`/`.png` restante em `dist/assets/` além dos que não foram convertidos
- Preview do link colado no WhatsApp continua mostrando a imagem corretamente

## Fase 5 — Servidor local (Caddy)

`Caddyfile` na raiz do projeto:

```
http://127.0.0.1:8080 {
	root * C:/Projetos/Sites/site-darcilene/dist
	try_files {path} {path}.html {path}/index.html
	file_server
	encode zstd gzip
	header /assets/* Cache-Control "public, max-age=31536000, immutable"
	header *.html Cache-Control "public, max-age=300"
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
	}
}
```

Instalação: `winget install CaddyServer.Caddy`. Ligado **apenas em loopback** — quem expõe é o túnel, não o firewall. Registrar como serviço do Windows para subir sozinho no boot.

## Fase 6 — Domínio para a Cloudflare

1. Adicionar o site no dashboard da Cloudflare (plano Free) — ela importa os registros DNS existentes.
2. **Conferir a importação antes de trocar nada**, sobretudo MX e TXT/SPF, para não derrubar e-mail.
3. Trocar os nameservers no registrador atual pelos dois da Cloudflare.
4. Aguardar a propagação (poucas horas; até 24h no `.com.br`). O site antigo, se houver, continua no ar durante a troca.

Esta fase precede a Fase 7 e é a única com espera externa — vale iniciá-la em paralelo com a Fase 1.

## Fase 7 — Túnel

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create darcilene
cloudflared tunnel route dns darcilene <dominio>
cloudflared tunnel route dns darcilene www.<dominio>
```

`C:\Users\sandro-desktop\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL-ID>
credentials-file: C:\Users\sandro-desktop\.cloudflared\<TUNNEL-ID>.json
ingress:
  - hostname: <dominio>
    service: http://127.0.0.1:8080
  - hostname: www.<dominio>
    service: http://127.0.0.1:8080
  - service: http_status:404
```

Validar em primeiro plano (`cloudflared tunnel run darcilene`) e só então instalar como serviço:

```powershell
cloudflared service install
```

O arquivo de credenciais é um segredo — não versionar.

## Fase 8 — Configuração na Cloudflare

- SSL/TLS: **Full (strict)** — o túnel já é autenticado ponta a ponta.
- Always Use HTTPS + HSTS (ativar depois de confirmar que tudo responde em HTTPS).
- Brotli ligado.
- Redirect Rule `www` → apex (301).
- Cache Rule: `/assets/*` com Edge TTL longo; HTML com TTL curto.
- Bot Fight Mode desligado (interfere em crawlers legítimos).

## Fase 9 — Operação

- **Energia:** plano de energia sem suspensão de disco/sistema; desativar hibernação. Sem isso, o site cai toda noite.
- **Git:** `git init` + remoto privado. Hoje não há versionamento — qualquer perda é definitiva.
- **Monitor externo** (ex.: UptimeRobot) na home, para avisar quando o PC cair — a Cloudflare não vai avisar.
- **Deploy:** editar o canvas → `node build.mjs` → arquivos novos em `dist/`, servidos na hora. Sem restart de serviço.

## Estrutura final

```
site-darcilene/
├─ Home.dc.html  Sobre.dc.html  Servicos.dc.html  Contato.dc.html   ← canvas (fonte)
├─ styles.css  support.js  image-slot.js  _ds/                      ← runtime do canvas
├─ *.jpg  *.png  *.mp4                                              ← originais
├─ build.mjs        ← novo
├─ seo.json         ← novo
├─ responsive.css   ← novo
├─ Caddyfile        ← novo
└─ dist/            ← saída publicada (gerada, git-ignored)
   ├─ index.html  sobre.html  servicos.html  contato.html  404.html
   ├─ generated.css  responsive.css  styles.css
   ├─ robots.txt  sitemap.xml  favicon.ico
   └─ assets/
```

## Verificação

**Build (local, antes de qualquer publicação)**
1. `node build.mjs` conclui com código 0 e sem avisos de marcador pendente.
2. `grep -r "x-dc\|support.js\|style-hover\|unpkg\|\.dc\.html" dist/` → **nenhum resultado**.
3. `grep -rc "style=" dist/*.html` → 0 (todo estilo hoisted).
4. Cada `.html` de `dist/` tem `<title>`, `<meta name="description">`, `lang="pt-BR"` e canonical.

**Visual e funcional**
5. `caddy run` e abrir `http://127.0.0.1:8080` — comparar as 4 páginas lado a lado com os `.dc.html` no canvas: mesmo layout em desktop.
6. DevTools em 1280 / 900 / 640 / 375 px: sem scroll horizontal, nav utilizável, H1 legível, grids colapsados.
7. **Com JavaScript desativado no browser, as 4 páginas devem renderizar idênticas.** É a prova de que o runtime saiu.
8. Passar o mouse nos botões e links: os hovers convertidos de `style-hover` funcionam.
9. Todo link interno resolve (`/`, `/sobre`, `/servicos`, `/contato`); os `wa.me` abrem o WhatsApp com a mensagem pré-preenchida; o vídeo da home toca.
10. Lighthouse mobile: meta ≥ 90 em Performance, SEO e Best Practices.

**Túnel**
11. `cloudflared tunnel info darcilene` mostra conexões ativas.
12. De **fora da rede local** (4G no celular): `https://<dominio>` carrega, cadeado válido, `www` redireciona para o apex.
13. `curl -sI https://<dominio>/assets/<img>.webp` retorna `cf-cache-status` e `Cache-Control: max-age=31536000`.
14. `curl -sI https://<dominio>/rota-inexistente` retorna 404 servido pela `404.html`.
15. Parar o Caddy → o domínio deve dar erro da Cloudflare (confirma que a origem é o túnel); religar e reconfirmar.
16. Reiniciar o Windows e, sem tocar em nada, confirmar que o site volta sozinho — valida os dois serviços em autostart.
