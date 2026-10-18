# VirtualLupe — Cubo Janela

Um cubo 3D que parece flutuar atrás da tela do celular: ao mover o aparelho, a vista muda como se
ele fosse uma janela para um objeto virtual. Projeto didático, HTML + JS puro + Three.js via CDN.

> **Limitação conceitual (fase 1):** sensores de orientação medem **rotação**, não **posição**.
> O celular sabe que virou, mas não que andou. A fase 2 (WebXR AR) resolve isso com rastreamento 6DoF.

Especificação completa: [`docs/contexto-projeto.md`](docs/contexto-projeto.md).

## Páginas

| Página | Fase | Status |
|---|---|---|
| `index.html` | 1 — orientação do aparelho (3DoF): modos "órbita" e "olhar em volta" | pronto |
| `ar.html` | 2 — WebXR AR (6DoF, Chrome Android + ARCore) | pronto |

## Rodar localmente

```sh
python dev-server.py
```

Abrir `http://localhost:3004`. No PC, sem sensores, dá para girar com o mouse.

O `dev-server.py` é o `python -m http.server` com cache desligado: sem isso o Chrome do celular
continua rodando a versão antiga dos `.js` depois de uma alteração.

A fase 2 (`ar.html`) só funciona no celular (Chrome Android com "Google Play Services for AR"):
tocar em "Entrar em AR", apontar para o chão ou uma mesa até aparecer o anel e tocar para pôr o
cubo.

## Testar no celular

Os sensores só funcionam em **contexto seguro** (HTTPS ou `localhost`).

- **Opção A — USB + port forwarding (Android):** ativar depuração USB no celular, abrir
  `chrome://inspect` no Chrome do PC → *Port forwarding* → `3004` → `localhost:3004`. No celular,
  abrir `http://localhost:3004` (conta como contexto seguro).
- **Opção B — túnel HTTPS:** `cloudflared tunnel --url http://localhost:3004` (ou ngrok) e abrir a
  URL `https://...` gerada no celular.
- **Publicado:** GitHub Pages (HTTPS automático).

## Testes

```sh
node --test
```
