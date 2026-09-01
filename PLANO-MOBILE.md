# Plano — Layout mobile da home

> Status: **executado em 2026-09-01**. Resultados medidos no fim do arquivo.
> Complementa o `PLANO-PRODUCAO.md` (Fase 3, "Responsivo", que ficou só no
> automático). Não depende das Fases 5–8 (Cloudflare Tunnel), que seguem adiadas.

## Contexto

O site é servido a partir de `dist/`, gerado por `node build.mjs` a partir dos
quatro artboards `.dc.html`. O passe responsivo hoje é **100% automático**
(`autoResponsive()` em `build.mjs:227`): deriva media queries só dos próprios
estilos — colapsa grids, encolhe títulos ≥32px por 0,62 e corta paddings ≥48px.
Isso evitou o layout quebrar no celular, mas não produz um layout *pensado* para
celular. Como o público chega majoritariamente por celular e o objetivo é mostrar
os serviços e gerar contato no WhatsApp, a home tem três problemas medidos:

1. **Os serviços aparecem tarde.** Ordem atual no celular: hero → como funciona →
   sobre a Darcilene → citação + 2 fotos → **serviços**. São ~4 telas de rolagem
   antes de o visitante ver o que é oferecido.
2. **Cansaço por altura e repetição.** A home no celular tem 7.325px (medido a 390px). As
   credenciais aparecem duas vezes seguidas (card de 5 itens em `Home.dc.html:104-110`
   e a mesma lista dentro do parágrafo em `Home.dc.html:115`); a faixa "Resultados"
   (`Home.dc.html:181-194`) leva hoje para `/servicos` genérico, porque a seção de
   fotos Antes/Depois é omitida do build enquanto as 4 fotos não existirem.
3. **Topo pesado e uma regra morta.** O header ocupa 3 linhas no celular (logo /
   botão / nav rolável). E `responsive.css:31` (`body section > div[class][style]`)
   **nunca casa**: o build faz hoisting de todo `style=`
   (`grep -c 'style=' dist/index.html` → 0), então os 6 círculos decorativos
   absolutos seguem sem tratamento no celular.

Também: o fator 0,62 do auto-responsivo derruba os H2 de seção de 32px para
**20px** no celular — menor que os H3 dos cards (19px), o que achata a hierarquia.

**Resultado esperado:** no celular, o visitante vê os quatro serviços na segunda
tela, tem o WhatsApp sempre a um toque e rola ~40% menos. **Desktop não muda:**
toda regra nova vive dentro de media query, e os elementos novos (menu sanfona e
barra fixa) nascem com `display:none` fora do mobile.

## Decisões já tomadas

- Reordenar a home **só no celular** (via `order` de flexbox); desktop intacto.
- Topo: barra fixa compacta + menu sanfona **sem JavaScript** (`<details>/<summary>`).
- Barra fixa de WhatsApp no rodapé da tela, no celular.
- **Não reescrever textos.** A repetição é resolvida escondendo blocos no celular;
  os `.dc.html` mantêm a redação atual para o desktop.

---

## Etapa 1 — Âncoras `data-r` nos artboards

As classes geradas são hashes (`.s-a1b2c3d4`), instáveis entre builds — então os
overrides precisam de âncoras próprias. É o mecanismo previsto na Fase 3 do
`PLANO-PRODUCAO.md` e nunca implementado. `hoistStyles()` (`build.mjs:79`) preserva
qualquer atributo que não seja `style`/`style-hover`, e o canvas ignora atributos
desconhecidos — então `data-r` atravessa o build intacto.

**`Home.dc.html`** — adicionar apenas atributos, sem tocar em texto nem em `style=`:

| Âncora | Onde | Linha aprox. |
|---|---|---|
| `data-r="pagina"` | `<div>` que envolve a página inteira | 19 |
| `data-r="topo"` | `<header>` | 21 |
| `data-r="nav-desktop"` | `<nav>` do header | 26 |
| `data-r="topo-cta"` | link "Agendar" do header | 32 |
| `data-r="hero"` | `<section>` do hero | 38 |
| `data-r="hero-grid"` | grid interno do hero | 41 |
| `data-r="hero-video"` | card do vídeo | 59 |
| `data-r="hero-foto"` | `<img>` do retrato | 66 |
| `data-r="passos"` | seção "Como funciona" | 71 |
| `data-r="passo"` (×3) | os 3 blocos numerados | 76, 81, 86 |
| `data-r="bio"` | seção da Darcilene | 95 |
| `data-r="bio-creds"` | lista das 5 credenciais | 104 |
| `data-r="galeria"` | seção da citação + fotos | 124 |
| `data-r="galeria-grid"` | grid das 2 fotos | 127 |
| `data-r="servicos"` | seção de serviços | 140 |
| `data-r="servicos-grid"` | grid dos cards | 144 |
| `data-r="servico-card"` (×4) | os 4 cards | 145, 153, 161, 169 |
| `data-r="resultados"` | faixa "Resultados" | 181 |
| `data-r="depoimentos"` | seção de depoimentos | 196 |
| `data-r="depoimentos-grid"` | grid dos 3 depoimentos | 200 |
| `data-r="cta"` | seção do CTA verde final | 247 |
| `data-r="rodape"` | `<footer>` | 261 |
| `data-deco` | os 6 `<div>` de círculo decorativo | 39, 40, 65, 96, 250 |

**`Sobre.dc.html`, `Servicos.dc.html`, `Contato.dc.html`** — só topo e rodapé:
`data-r="pagina"`, `topo`, `nav-desktop`, `topo-cta`, `rodape`.

## Etapa 2 — Markup novo: menu sanfona e barra fixa

Adicionado nos **quatro** artboards (o visitante cai direto em `/servicos` pela
busca; o topo tem que ser o mesmo em todo lugar).

**a) Menu sanfona no header**, logo após o `<nav>` existente — HTML nativo, sem JS,
funciona com JavaScript desligado (requisito 7 da verificação do `PLANO-PRODUCAO.md`):

```html
<details data-r="menu">
  <summary aria-label="Menu">…ícone ≡ em SVG, alvo de 44×44…</summary>
  <nav>Início · Sobre · Serviços · Contato</nav>
</details>
```

Os 4 links são duplicados em vez de reaproveitar o `<nav>` de cima: um `<details>`
fechado esconde os filhos por estilo de UA, e forçar a exibição no desktop é frágil
entre navegadores. São 4 links a mais no HTML — trocado por robustez.

**b) Barra fixa de WhatsApp**, último filho de `data-r="pagina"`:

```html
<div data-r="barra">
  <a href="https://wa.me/5583988559983?text=Ol%C3%A1%2C%20Darcilene!%20…">
    Agendar no WhatsApp
  </a>
</div>
```

Mesmo link e mesma mensagem pré-preenchida dos CTAs existentes.

**c) No celular, o "Agendar" do header vira botão redondo só com o ícone**
(`data-r="topo-cta"`, 44×44). Com a barra fixa embaixo permanentemente visível,
duas pílulas verdes idênticas na mesma tela seriam exatamente a repetição que se
quer evitar — o botão continua lá, em forma compacta.

> **Nota sobre o canvas:** o `<helmet>` dos artboards carrega só `styles.css`, não
> `responsive.css`. No editor visual, o menu e a barra vão aparecer sempre — é
> esperado; o `display:none` do desktop vive no `responsive.css`, que só o site
> publicado carrega.

## Etapa 3 — Reescrever `responsive.css`

Arquivo único, carregado depois de `generated.css` (vence por ordem de origem;
`build.mjs:318` já o copia). Cinco blocos:

### 1. Base, sem media query

Mantém a rede de segurança atual (`body{overflow-x:hidden}`, `img,video,svg{max-width:100%}`),
**remove a regra morta da linha 31** e declara o estado desktop dos elementos novos:
`[data-r="menu"], [data-r="barra"] { display: none }`.

### 2. `@media (max-width: 760px)` — topo

- `[data-r="topo"]`: `position:sticky; top:0; z-index:50`, altura ~60px, padding
  lateral 20px, fundo opaco (o atual já é `--color-bg`).
- `[data-r="nav-desktop"] { display:none }` — substitui o bloco de nav rolável de hoje.
- `[data-r="menu"] { display:block }`; painel aberto em `position:absolute` sob a
  barra, largura total, itens com 44px de altura.
- `[data-r="topo-cta"]`: círculo de 44px, rótulo escondido, ícone mantido.
- `[id] { scroll-margin-top: 70px }` — âncoras não ficam sob o header fixo.

### 3. `@media (max-width: 640px)` — ordem da home

`[data-r="pagina"] { display:flex; flex-direction:column }` e `order` em cada seção:

| Ordem | Seção |
|---|---|
| 0 | topo (sticky) |
| 1 | hero |
| 2 | **serviços** |
| 3 | como funciona |
| 4 | Darcilene + credenciais |
| 5 | citação + fotos |
| 6 | depoimentos |
| 7 | CTA final |
| 8 | rodapé |
| — | `[data-r="resultados"] { display:none }` |

As seções não têm `margin` (só `padding`), então virar item de flex não altera o
espaçamento.

A faixa "Resultados" sai do celular **enquanto as fotos Antes/Depois não existirem**:
hoje o build degrada o link dela para `/servicos`, o que a torna um CTA que não leva
a lugar nenhum. A regra leva comentário indicando que deve ser removida quando as 4
fotos chegarem (ver "Bloqueios" no `PLANO-PRODUCAO.md`).

A seção "citação + 2 fotos" **permanece** — é prova visual, não repetição — só
reposicionada e transformada em par deslizante (bloco 4).

### 4. `@media (max-width: 640px)` — densidade e legibilidade

Parte do público é idosa, ou é filho de idoso decidindo pelo pai; texto pequeno com
`opacity:0.75` é o pior caso ao sol.

- **Tipografia:** H1 30px com `text-wrap:balance`; **H2 de seção 20px → 25px**
  (desfaz o excesso do fator 0,62 e devolve a hierarquia sobre os H3 de 19px);
  corpo dos cards 14px → 15px; `opacity` do texto secundário 0,75 → 0,82.
- **Hero:** `[data-r="hero-grid"]` com `gap` 56px → 28px; `[data-r="hero-foto"]` de
  `aspect-ratio:4/5` para `3/2` (economiza ~180px de rolagem; o `object-position`
  atual mantém o rosto enquadrado); `[data-r="hero-video"]` empilhado — vídeo em
  `16/9` em cima, legenda embaixo — no lugar do `body video{width:100%!important}`
  de hoje, que espreme vídeo e legenda lado a lado.
- **Cards de serviço:** `[data-r="servico-card"]` vira grid `48px 1fr`, ícone na
  coluna 1 e título/descrição/link na coluna 2, padding 32px → 20px.
- **Como funciona:** mesmo tratamento em `[data-r="passo"]` — número à esquerda,
  texto à direita.
- **Depoimentos e fotos:** `[data-r="depoimentos-grid"]` e `[data-r="galeria-grid"]`
  viram fila horizontal com `scroll-snap-type:x mandatory`, filhos em `flex:0 0 84%`
  e sangria lateral negativa. Os 3 depoimentos empilhados (~620px) viram ~260px
  deslizáveis, sem esconder nada.
- **Repetição escondida:** `[data-r="bio-creds"] { display:none }` — as 5 credenciais
  do card estão todas no parágrafo logo abaixo (`Home.dc.html:115`); o "12 anos de
  experiência" e o parágrafo continuam visíveis. Nenhuma informação se perde.
- **Decoração:** `[data-deco] { display:none }` — os 6 círculos absolutos não somam
  nada em 375px e são fonte potencial de estouro lateral.
- **Toque:** `min-height:44px` nos "Saiba mais →", na nav do rodapé e nos itens do menu.
- **Rodapé:** blocos empilhados com `gap` menor; logo de 176px → 140px.

### 5. Barra fixa

`position:fixed; bottom:0; inset-inline:0; z-index:60`; botão de 52px de altura;
`padding-bottom: env(safe-area-inset-bottom)` (iPhone); fundo sólido sobre
`--color-bg` com sombra superior; e `[data-r="pagina"] { padding-bottom:76px }`
para a barra não cobrir o rodapé.

## Arquivos tocados

| Arquivo | O quê |
|---|---|
| `responsive.css` | reescrito (38 linhas → ~180) |
| `Home.dc.html` | ~25 `data-r`/`data-deco` + menu sanfona + barra fixa |
| `Sobre.dc.html`, `Servicos.dc.html`, `Contato.dc.html` | ~5 âncoras + menu + barra |

**Não são tocados:** `build.mjs` (o auto-responsivo continua valendo como base; o
`responsive.css` só o corrige por cima), `styles.css`, `seo.json`, e nada em `dist/`,
que é regenerado.

## Verificação

**Build**

1. `node build.mjs --strict` → código 0, nenhum aviso novo e nenhum aviso de
   "resíduo do canvas" (a auto-verificação de `build.mjs:280` cobre o markup novo).
2. `grep -o 'data-r' dist/index.html | wc -l` → as âncoras sobreviveram ao hoisting.
3. `npx serve dist` — resolve as URLs limpas (`/servicos`); um `http.server` simples não resolve.

**Celular (375px e 390px, DevTools ou a skill `claude-in-chrome`)**

4. Sem rolagem horizontal em nenhuma das 4 páginas.
5. Os 4 serviços visíveis na segunda tela da home.
6. Header fixo ao rolar; `≡` abre e fecha os 4 links; barra do WhatsApp sempre
   visível e sem cobrir o rodapé.
7. Depoimentos e fotos deslizam com snap.
8. `document.body.scrollHeight` na home — alvo ≤ 4.500px (hoje > 7.000px).
9. **Com JavaScript desligado:** menu sanfona e barra continuam funcionando.

**Sem regressão**

10. Desktop em 1280px: as 4 páginas **idênticas** ao estado atual; `[data-r="menu"]`
    e `[data-r="barra"]` invisíveis.
11. Tablet em 900px e 760px: transição sem quebra entre os três regimes.
12. Lighthouse mobile na home: Performance e Best Practices ≥ 90, sem regressão de
    CLS (os `width`/`height` injetados por `addImageDimensions()` continuam valendo).

---

## Resultado medido

Comparação feita em Chrome, a 390px de largura, entre o build do commit `8ded53d`
e o build atual, servidos na mesma origem (`scripts/serve-dist.mjs`).

| Medida | Antes | Depois |
|---|---|---|
| Altura da home | 7.325px | **4.945px** (−32%) |
| Serviços começam em | 4.066px | **1.197px** (−70%) |
| Altura do header | 211px (3 linhas) | **64px** (1 linha, fixo) |
| Estouro lateral, 320→1280px, 4 páginas | nenhum | nenhum |
| Desktop 1280px e tablet 900px | — | alturas **idênticas** seção a seção |

Os serviços passaram da quinta seção para a segunda: a 1.197px, ficam visíveis
ao fim da primeira rolagem num aparelho de 844px de altura.

### Ajustes feitos durante a execução

- **`overflow-x: hidden` → `clip`** no wrapper e no `body`. `hidden` faz do
  elemento um contêiner de rolagem e **quebra o `position:sticky`** do header;
  `clip` corta igual sem criar o contêiner. A linha `hidden` fica antes como
  fallback.
- **`[data-r="menu"]:not([open]) > nav { display:none }`** — com o painel em
  `position:absolute`, o navegador ainda reservava a caixa do `<details>`
  fechado; o estilo de UA sozinho não bastava.
- **Botão de WhatsApp do hero escondido no celular** (`[data-r="hero-cta-wa"]`).
  Era literalmente a mesma chamada da barra fixa, visível ao mesmo tempo na
  mesma tela. O hero fica com "Conhecer os serviços", que a barra não cobre.
- **Regras para ≤380px** (iPhone SE): a marca no header encolhe para o topo não
  estourar em 320px.
- Card de serviço ficou em **212px**, não nos ~130px estimados: com título de
  duas linhas, texto de três a 15px e alvo de toque de 44px no "Saiba mais",
  esse é o piso real.

### Verificação executada

- `node build.mjs` → 0 avisos de resíduo do canvas; `grep 'style='` em `dist/` → 0.
- Âncoras `data-r` sobrevivem ao hoisting: 29 na home, 8 em cada página interna.
- Menu sanfona abre (209px), fecha e reabre; os 4 itens têm 48px de altura.
- Header continua no topo após rolar 1.500px; barra fixa não cobre o rodapé
  (fim do rodapé em 766px, topo da barra em 772px).
- Carrosséis com `scroll-snap-type: x mandatory` ativo e roláveis.
- Sem `<script>` no HTML servido além do JSON-LD — a página não depende de
  JavaScript, e o menu é `<details>` nativo.
- Faixa 641–760px (topo mobile, corpo desktop) sem quebra.

### Não verificado

- **Lighthouse mobile** (item 12) não foi rodado — exige Chrome headless com o
  runner, que não está instalado. O risco de CLS não mudou: os `width`/`height`
  injetados por `addImageDimensions()` continuam em todos os `<img>`.
- `node build.mjs --strict` continua **recusando o build**, pelos marcadores que
  já existiam antes desta mudança (`[cidade e região]`, CREFITO, fotos
  Antes/Depois). É o bloqueio da seção "Bloqueios" do `PLANO-PRODUCAO.md`.

### Ficou de fora (fora do escopo acordado)

Na página `/servicos`, o auto-responsivo empilha o ícone de cada card acima do
título, deixando ~60px de folga por card (~240px na página). Tratar isso pediria
âncoras nos cards daquela página, que o plano limitou a topo e rodapé.
