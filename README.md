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

Ainda não implementados — ver `PLANO-PRODUCAO.md`. Quando existirem:

```bash
node build.mjs      # gera dist/
caddy run           # serve dist/ em http://127.0.0.1:8080
```

O Cloudflare Tunnel expõe o Caddy local na internet. As credenciais do túnel
ficam em `%USERPROFILE%\.cloudflared\` e **não pertencem a este repositório**.

## Pendências de conteúdo

- [ ] Cidade de atendimento — hoje `[cidade e região]` nas quatro páginas
- [ ] Número do CREFITO — hoje `[inserir número de registro]` em `Sobre`
- [ ] Quatro fotos Antes/Depois para a galeria de `Servicos`
