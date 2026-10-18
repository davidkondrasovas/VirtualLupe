# CLAUDE.md

Guia operacional deste repositório para o Claude Code.

## O que é

**VirtualLupe (Cubo Janela)** — página web mínima e didática: um cubo 3D colorido que parece
"parado no ar" atrás da tela do celular; mexer o aparelho muda a vista, como uma janela/lupa.
Objetivo é **entender o conceito**: código curto, legível, com a matemática comentada.

Especificação completa (fases, detalhes técnicos, critérios de aceite, fora de escopo):
**`docs/contexto-projeto.md`** — ler antes de implementar qualquer fase.

## Stack e restrições (não negociáveis sem perguntar)

- HTML + JavaScript puro (ES modules). **Sem framework, sem bundler, sem npm obrigatório.**
- Three.js via CDN (`cdn.jsdelivr.net/npm/three@<versão fixa>`) com import map — nunca `latest`.
- **Nenhuma outra dependência** sem perguntar antes.
- Sensores exigem **secure context** (HTTPS ou `localhost`).

## Fases

1. `index.html` — orientação 3DoF (`deviceorientation`), modos "órbita" (padrão) e "olhar em volta".
2. `ar.html` — WebXR `immersive-ar` (6DoF, Chrome Android + ARCore). **Só depois da fase 1 aceita.**

## Comandos

- Servidor local: `python -m http.server 3004` (faixa reservada 3004–3006; nunca matar processo
  por nome — localizar PID via `netstat -ano`).
- Testes: `node --test` — lógica pura (conversão orientação → quaternion, órbita) fica em módulo
  próprio sem depender do Three.js, para ser testável no Node sem npm.
- Teste no celular: ver `README.md` (port forwarding via `chrome://inspect` ou túnel HTTPS).

## Workflow

- Fundação/setup direto em `main`; cada feature/passo em branch própria (`feature/...`).
- Commits pequenos, um passo de cada vez — o usuário testa no celular entre eles.
- Commit aprovado = add + commit + push (sem confirmação separada para o push).
- **Publicação via GitHub Pages a partir de `main`** (repo público
  `davidkondrasovas/VirtualLupe` → https://davidkondrasovas.github.io/VirtualLupe/): merge em
  `main` = publicar. Merge só após validação e confirmação explícita do usuário. `.nojekyll` na
  raiz: arquivos servidos como estão, sem Jekyll.
- Planos aprovados em plan mode: copiar para `docs/plans/` com nome descritivo e commitar.

## Regras de eficiência de sessão

- Mensagens de commit: escrever em arquivo de scratch e usar `git commit -F <arquivo>`.
- Scripts ad-hoc com acentos no console Windows: forçar saída UTF-8.
- Status do projeto mora na memória do Claude (`fase-status.md`), não aqui. Este arquivo ≤ ~10 KB.
