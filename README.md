# Site — Darcilene Xavier Fisioterapia

Site institucional de fisioterapia domiciliar (ortopédica, Pilates clínico,
ventosaterapia e cuidado à terceira idade). Conversão principal: agendamento
via WhatsApp.

## Como este projeto funciona

A fonte de edição é um **canvas do Claude Design**: os quatro arquivos `.dc.html`
são artboards editados visualmente, e não páginas publicáveis — o conteúdo deles
vive dentro de `<x-dc>` e depende do runtime `support.js`, que carrega React de
uma CDN externa em tempo de execução.

Para produção, um build transforma esses artboards em HTML estático puro (sem
JavaScript, sem CDN externa, responsivo e indexável), com saída em `dist/`.

```
.dc.html (canvas)  ──build.mjs──►  dist/*.html  ──Caddy──►  Cloudflare Tunnel  ──►  internet
```

## Estrutura

| Caminho | O que é |
|---|---|
| `Home/Sobre/Servicos/Contato.dc.html` | Artboards do canvas — **a fonte**, editada visualmente |
| `styles.css`, `_ds/` | Design system "Modernist": tokens de cor, tipografia, espaçamento |
| `support.js`, `image-slot.js`, `.thumbnail` | Runtime e metadados do canvas (não vão para produção) |
| `*.jpg`, `*.png`, `*.mp4` | Imagens e vídeo usados nas páginas |
| `uploads/` | Originais em alta resolução, fonte para reexportação |
| `PLANO-PRODUCAO.md` | Plano completo de publicação, em 9 fases |
| `dist/` | Saída do build (gerada, fora do versionamento) |

## Build e publicação

```bash
node build.mjs            # gera dist/
node build.mjs --strict   # falha se houver [marcador] pendente — usar antes de publicar
```

O build não tem dependências: só Node 18+. Ele desmonta o envelope do canvas,
transforma cada `style=` numa classe em `generated.css`, converte `style-hover=`
em `:hover` de verdade, e deriva as media queries dos próprios estilos — se o
canvas mudar, o responsivo acompanha. Também se recusa a publicar as fotos
Antes/Depois se os arquivos não existirem: a seção sai inteira.

Hospedagem atual: **Vercel**, via `vercel.json` (`buildCommand: node build.mjs`,
`outputDirectory: dist`). O `dist/` não é versionado — a Vercel o reconstrói.

Depois, a intenção é migrar para **Cloudflare Tunnel** servindo o mesmo `dist/`
por um Caddy local; ver `PLANO-PRODUCAO.md`, fases 5 a 8.

## Pendências de conteúdo

- [ ] Cidade de atendimento — hoje `[cidade e região]` nas quatro páginas
- [ ] Número do CREFITO — hoje `[inserir número de registro]` em `Sobre`
- [ ] Quatro fotos Antes/Depois para a galeria de `Servicos`
