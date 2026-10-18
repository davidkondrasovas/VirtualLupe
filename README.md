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

### Modelos 3D

No AR, o botão com o nome do modelo alterna entre os modelos listados em dois arquivos (os locais
primeiro; o cubo é sempre a última opção):

- `models/models.json` — modelos publicados, hoje só a raposa animada (`fox.glb`) dos modelos de
  exemplo do glTF (licenças livres, ver [`models/CREDITS.md`](models/CREDITS.md)).
- `models/local.json` — **modelos seus, só local**: este arquivo e a pasta `models/local/` estão
  no `.gitignore` e não vão para o GitHub Pages (use para modelos com direitos autorais).

Formato dos dois:

```json
[
  { "name": "Mario", "url": "models/local/mario.glb" }
]
```

No Sketchfab, *Download 3D Model* → **GLB** e salvar em `models/local/`. Também serve **glTF**
(extrair o zip numa pasta e apontar `url` para o `scene.gltf` dela). Modelos com compressão Draco
não carregam.

Cada modelo é redimensionado para ~60 cm e, ao ser posicionado, fica de frente para quem tocou;
os botões − e + ajustam o tamanho.

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
