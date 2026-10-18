# Cubo Janela — contexto do projeto

Documento de handoff: o *o quê* e o *por quê* estão fechados aqui; o *como*
(código) fica para a implementação. Sugestão: salvar na raiz do repo como
`CLAUDE.md` (ou referenciar a partir dele).

## Ideia

Aplicação web mínima, o mais simples possível, feita para **entender o
conceito**: um cubo 3D colorido que aparece na tela do celular e parece
"parado no ar". Quando o celular se mexe, a vista do cubo muda de acordo,
como se o aparelho fosse uma janela/lupa para um objeto virtual que existe
atrás dele.

Objetivo é didático: código curto, legível, comentado nos pontos de
matemática (orientação → câmera). Nada de framework, nada de build.

## Fases

### Fase 1 — Orientação do aparelho (3DoF) — fazer primeiro

Usa os sensores de orientação do celular (giroscópio/acelerômetro/
magnetômetro já fundidos pelo sistema) via `DeviceOrientationEvent`.

**Limitação conceitual que precisa ficar clara no código e no README:**
sensores de orientação medem **rotação**, não **posição**. O celular sabe
que virou, mas não que andou. Por isso a fase 1 tem dois modos, com um
seletor na tela para alternar e comparar:

1. **Modo "olhar em volta"**: câmera fixa na origem, gira com o celular.
   O cubo fica fixo numa direção do espaço (tipo foto 360°). É o
   comportamento fisicamente correto para 3DoF.
2. **Modo "órbita"** (padrão): a orientação do celular é mapeada para uma
   órbita da câmera em volta do cubo, a uma distância fixa `R`, sempre
   olhando para ele. Se o usuário anda em círculo apontando o celular
   para um ponto à frente, a ilusão de "contornar" o objeto funciona. É um
   truque, mas é o que mais se aproxima da ideia de janela.

### Fase 2 — WebXR AR (6DoF) — depois que a fase 1 estiver entendida

Versão "de verdade": câmera do celular ao fundo, cubo ancorado no mundo
real, rastreando rotação **e** posição. Usa WebXR `immersive-ar`, que no
Android é suportado pelo ARCore.

- Funciona só em **Chrome Android** com "Google Play Services for AR"
  instalado. **Não funciona no iOS Safari** (sem WebXR AR).
- Fluxo sugerido: botão "Entrar em AR" → retícula via `hit-test` mostra
  onde o cubo vai ficar no chão/mesa → toque posiciona o cubo → usuário
  anda em volta dele de verdade.
- Detectar suporte com `navigator.xr?.isSessionSupported('immersive-ar')`;
  se não suportado, mostrar mensagem e link para a fase 1.

## Stack

- **HTML + JavaScript puro (ES modules)**, sem bundler, sem npm obrigatório.
- **Three.js via CDN** com import map (ex: `cdn.jsdelivr.net/npm/three@<versão fixa>`).
  Fixar a versão — não usar `latest`.
- Fase 2: `ARButton` dos addons do Three.js (`three/addons/webxr/ARButton.js`)
  ou sessão WebXR manual, o que ficar mais didático.
- **Sem outras dependências.** Perguntar antes de adicionar qualquer coisa.

## Estrutura proposta

```
cubo-janela/
  CLAUDE.md        ← este documento
  README.md        ← como rodar/testar no celular
  index.html       ← fase 1 (HTML + JS inline ou um main.js ao lado)
  ar.html          ← fase 2
```

Arquivos separados por fase, em vez de uma página com tudo, para cada um
continuar curto e legível isoladamente.

## Detalhes técnicos da fase 1 (pontos onde é fácil errar)

**Conversão orientação → quaternion da câmera.** O
`DeviceOrientationControls` do Three.js foi removido da lib; reimplementar
a lógica (são poucas linhas):

- `alpha` (eixo Z, 0–360), `beta` (eixo X, −180–180), `gamma` (eixo Y,
  −90–90), em graus → converter para radianos.
- Euler com ordem `'YXZ'`: `(beta, alpha, -gamma)`.
- Multiplicar por uma rotação de −90° em X, para a câmera olhar "para fora
  da traseira" do aparelho em vez de para o topo dele.
- Compensar a orientação da tela (retrato/paisagem): rotação em Z por
  `-screen.orientation.angle` (fallback `window.orientation`).
- Usar **quaternions**, não Euler direto na câmera, para evitar gimbal lock
  quando o celular passa perto da vertical.

**Modo órbita:** com o quaternion `q` calculado acima,
`camera.quaternion = q` e
`camera.position = centroCubo + (0, 0, R) rotacionado por q`. A câmera fica
sempre olhando para o cubo.

**Recentrar:** botão que captura o yaw (alpha) atual como referência, para o
cubo aparecer na frente do usuário independentemente de para onde ele
estava apontando ao abrir a página.

**Suavização:** aplicar um `slerp` leve entre o quaternion anterior e o
novo, para tirar o tremor dos sensores. O fator deve ser ajustável, ou pelo
menos uma constante clara no topo do código.

**Eventos:** usar `deviceorientation` (relativo, baseado em giroscópio, mais
suave; deriva devagar no yaw, o que é aceitável aqui). Não usar
`deviceorientationabsolute` na v1 — a bússola é ruidosa dentro de casa.

**Permissões:**
- **HTTPS obrigatório** (secure context), senão os sensores não disparam.
  `localhost` também conta como seguro.
- **iOS**: `DeviceOrientationEvent.requestPermission()` só funciona dentro de
  um handler de toque → botão "Ativar sensores" na tela inicial.
- **Android/Chrome**: funciona direto, mas manter o mesmo botão de "Iniciar"
  para o fluxo ser igual nas duas plataformas.

**Fallback desktop:** sem sensores (PC), permitir girar com o mouse
(arrastar), para dar para desenvolver e testar no computador. Detectar a
ausência de eventos de orientação após o "Iniciar" e mostrar um aviso
discreto.

**Cena:** cubo com uma cor diferente por face (para enxergar claramente qual
lado está à vista), fundo neutro, e opcionalmente uma grade no "chão" para
reforçar a sensação de espaço. Sem texturas, sem modelos externos.

**Debug na tela:** overlay pequeno, liga/desliga, mostrando `alpha`/`beta`/
`gamma` ao vivo e o modo atual. Ajuda muito a entender o conceito — faz
parte do objetivo didático, não é só debug.

## Como testar no celular

- **Publicação:** GitHub Pages (HTTPS grátis, só fazer push).
- **Teste local rápido:**
  - opção A: servidor estático local (`python -m http.server`) +
    `chrome://inspect` → port forwarding no Android via USB (o celular
    acessa como `localhost`, que conta como contexto seguro);
  - opção B: túnel HTTPS (Cloudflare Tunnel / ngrok) apontando para o
    servidor local.
- Documentar as duas opções no README.

## Critérios de aceite

**Fase 1**
- Abrir a URL no celular Android (Chrome) → tocar "Iniciar" → cubo
  aparece na frente.
- Virar o celular: o cubo reage na hora (sem atraso perceptível), suave,
  sem saltos ao passar pela vertical.
- Alternar entre "olhar em volta" e "órbita" mostra claramente a
  diferença entre os dois.
- "Recentrar" traz o cubo de volta para a frente.
- Funciona em retrato e paisagem.
- No PC, dá para girar com o mouse.
- iPhone: o botão pede a permissão e depois funciona (testar se houver um
  iPhone disponível; não bloqueia o aceite).

**Fase 2**
- No Chrome Android com ARCore: entrar em AR, ver a câmera, posicionar o
  cubo com um toque e andar em volta dele — o cubo fica fixo no mundo real.
- Em aparelho sem suporte: mensagem clara + link para a fase 1.

## Fora de escopo (por enquanto)

- Modelos 3D externos, texturas, iluminação elaborada.
- Frameworks (React, A-Frame etc.) e build tools.
- Rastreamento de posição na fase 1 (estimar translação a partir do
  acelerômetro por integração dupla deriva em segundos — não tentar).
- Suporte a iOS na fase 2.

## Como trabalhar

- Começar pela fase 1, modo órbita; depois adicionar o modo "olhar em volta"
  e o seletor.
- Commits pequenos, um passo de cada vez, testando no celular entre eles.
- Comentar a matemática da conversão orientação → câmera — é o coração do
  aprendizado.
- Fase 2 só depois da fase 1 aceita.
