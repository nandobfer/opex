# Módulo: Deploy (CI/CD, GitHub Actions)

Objetivo: entregar o Opex em produção automaticamente a cada push na `main`, construindo a imagem
Docker **no runner do GitHub** (sem sobrecarregar o servidor), transferindo-a e recriando o serviço
via Compose. O pipeline vive em `.github/workflows/ci-cd.yml`; a etapa remota é orquestrada por
`scripts/deploy-production.ts`.

## Visão geral do pipeline

Workflow `CI/CD` (`.github/workflows/ci-cd.yml`): o CI roda a suíte só em pull request e o CD roda
na `main` sem repeti-la, com dois jobs encadeados.

| Job | Nome exibido | Quando roda | O que faz |
|---|---|---|---|
| `vitest` | `Vitest` | só `pull_request` | instala com pnpm e roda `pnpm test` (suíte Vitest completa em 4 shards) |
| `build` | `Build image` | só `push`/`workflow_dispatch` na `main`, sem esperar o `vitest` | constrói a imagem com Buildx (com QEMU se a plataforma divergir), exporta `opex-image.tar.gz` + checksum e publica como artefato |
| `deploy` | `Deploy production` | só `push`/`workflow_dispatch` na `main`, após `build` | baixa o artefato, valida o checksum local, transfere por SCP e executa `scripts/deploy-production.ts` |

- **CI bloqueante em PR:** o job `vitest` roda em todo pull request. Para impedir o merge com CI
  falhando, o repositório deve ter a proteção de branch na `main` exigindo o status check do job
  `Vitest` (`CI/CD / Vitest`). Essa configuração é feita no GitHub, em
  **Settings → Branches → Branch protection rules** (ou Rulesets), marcando **Require status checks
  to pass before merging** e selecionando o check `Vitest`. O YAML sozinho não bloqueia o merge.
- **CD sem repetir a suíte (OPE-140):** o `build` não depende do `vitest`, porque o merge na `main`
  já entra com o CI verde do PR. Consequência aceita pelo dono: um commit direto na `main`, sem PR,
  vai para produção sem passar pelos testes.
- PRs nunca executam `build`/`deploy` nem recebem credenciais de produção.
- `concurrency`: o CI de PR cancela execuções antigas do mesmo ref; o deploy usa o grupo
  `deploy-production` com `cancel-in-progress: false` (não cancela um deploy em andamento).

## Build da imagem

- A imagem é construída com `docker buildx build --load`, na plataforma `DEPLOY_PLATFORM`
  (`linux/amd64` por padrão). QEMU é configurado para permitir build de arquitetura diferente do
  runner.
- Argumentos de build públicos (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BASE_PATH`,
  `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`, `NEXT_PUBLIC_PUSHER_URL`) vêm de
  **repository variables**. Como entram no bundle do cliente, mudá-los exige **novo build** — não
  basta alterar o `.env` do servidor.
- A tag é o SHA completo do commit (`opex:<sha>`), o que torna cada imagem imutável e permite
  rollback por tag.
- A imagem é salva com `docker save | gzip -9` e acompanhada do arquivo `opex-image.tar.gz.sha256`.
- O `next build` roda com **Turbopack**, o padrão do Next 16. A versão do `next` é fixada
  exatamente no `package.json` (hoje `16.4.5`): o `16.1.4` derrubava o build com o panic interno
  do Turbopack `Dependency tracking is disabled so invalidation is not allowed`
  ([vercel/next.js#85496](https://github.com/vercel/next.js/issues/85496)) na geração das rotas —
  os testes passavam e só o job `Build image` falhava, de forma determinística. Se o panic voltar
  numa versão fixada, o caminho de contenção é `next build --webpack` (o defeito é exclusivo do
  Turbopack; a flag existe no Next 16) e, para achar o gatilho, `next build --debug-build-paths`
  com um recorte de rotas.
- Versões recém-publicadas do `next` entram em `minimumReleaseAgeExclude` no
  `pnpm-workspace.yaml`: a política de idade mínima de release do pnpm bloquearia a atualização.

## Deploy no servidor

O job `deploy` prepara a chave SSH e o `known_hosts` (de **GitHub Secrets**), valida o checksum
local e roda `npx tsx scripts/deploy-production.ts`. Ele **não usa pnpm**: o `setup-node` roda com
`package-manager-cache: false` para não detectar o `packageManager` do `package.json` e exigir o
binário do pnpm (que não é instalado nesse job). O script (`scripts/deploy-production.ts`) faz,
em ordem, e falha na primeira inconsistência:

1. **Pré-requisitos locais:** confere que a chave, o `known_hosts`, o arquivo da imagem e os
   arquivos de Compose existem antes de tocar no servidor.
2. **Pré-verificações remotas:** via SSH, confere `docker`, `docker compose`, a presença do `.env`
   no diretório de produção e as redes externas exigidas (ver "Redes externas").
3. **Arquitetura:** compara `docker info` do servidor com a arquitetura derivada de
   `DEPLOY_PLATFORM` (`x86_64`/`aarch64`).
4. **Diretório de release:** `mkdir -p` do diretório remoto.
5. **Transferência:** SCP da imagem e dos arquivos `docker-compose.yml` +
   `docker-compose.deploy.yml` para o diretório remoto.
6. **Checksum:** `sha256sum -c` da imagem no servidor.
7. **`docker load`** da imagem e conferência de que ela existe (`docker image inspect`).
8. **Atualização:** `docker compose up -d --no-build --pull never app`, com `OPEX_IMAGE=<repo>:<tag>`
   e o override `docker-compose.deploy.yml` (que fixa a imagem e `pull_policy: never`). Portas,
   redes, limites e o `.env` do `docker-compose.yml` são preservados.
9. **Confirmação:** o container recriado usa exatamente a imagem do commit
   (`docker inspect .Config.Image`).
10. **Healthcheck:** `curl` periódico (remoto) na URL configurada, com tentativas limitadas.
11. **Limpeza:** remove apenas o arquivo da imagem daquela execução (best-effort).

Em falha, o script informa a **imagem anterior** em execução (para rollback) e encerra com código
não zero. `docker restart` não é usado porque **não troca a imagem** de um container existente — o
container precisa ser recriado.

## Redes externas

O `docker-compose.yml` declara redes `external: true` que o pipeline **não** cria: elas precisam
existir no servidor. O script de deploy confere cada uma antes de tocar em qualquer coisa
(`DEPLOY_REQUIRED_NETWORKS`, com o padrão abaixo) e falha com mensagem clara quando falta.

| Rede | Para quê |
|---|---|
| `mongodb-network` | Banco (`mongodb`) |
| `soketi-network` | Pusher/Soketi |
| `minio-network` | Armazenamento de anexos do Agente Opex |
| `mcp` | MCPs em container — hoje o **Playwright MCP**, em `http://playwright:8931/mcp`, para os agentes do motor `opex` (que rodam no container) |

Criar uma vez no servidor: `docker network create mcp`. Só o serviço `app` entra na rede `mcp`
(nem `app-dev` nem o portal precisam dela); o `docker-compose.deploy.yml` não mexe em redes, então o
container publicado herda a lista do `docker-compose.yml`. O compose do Playwright MCP não vive neste
repositório: ele roda como projeto Compose próprio (`/home/burgos/mcp/playwright`) e só entra na rede
`mcp` como `external`.

## Configuração (GitHub)

**Secrets** (Settings → Secrets and variables → Actions → *Environments* `production`):

| Secret | Conteúdo |
|---|---|
| `DEPLOY_SSH_KEY` | chave privada SSH do usuário de deploy |
| `DEPLOY_KNOWN_HOSTS` | linha de `known_hosts` do servidor (host key conferida) |
| `DEPLOY_HOST` | host/IP do servidor |
| `DEPLOY_SSH_USER` | usuário SSH (dono do Docker rootless) |

**Variables** (recomendado no environment `production`):

| Variable | Padrão | Descrição |
|---|---|---|
| `DEPLOY_SSH_PORT` | `22` | porta SSH |
| `DEPLOY_REMOTE_DIR` | — | diretório de produção (ex.: `/srv/opex`) |
| `DEPLOY_PROJECT_NAME` | — | nome do projeto Compose atual (ex.: `opex-3100`) |
| `DEPLOY_SERVICE` | `app` | serviço Compose a recriar |
| `DEPLOY_IMAGE_REPOSITORY` | `opex` | repositório da imagem |
| `DEPLOY_PLATFORM` | `linux/amd64` | plataforma da imagem |
| `DEPLOY_HEALTHCHECK_URL` | — | URL conferida após o deploy (ex.: `http://127.0.0.1:3100/login`) |
| `NEXT_PUBLIC_*` | — | argumentos públicos de build |

## Operação manual e rollback

- O deploy pode ser disparado manualmente em **Actions → CI/CD → Run workflow** na `main`.
- Para rollback, no servidor: carregar uma imagem anterior (`docker images opex:<sha-antigo>`) e
  recriar o serviço apontando `OPEX_IMAGE` para ela com o mesmo `docker compose up -d --no-build
  --pull never app`. Rollback da imagem **não** desfaz migrações de banco.
- O pipeline **não provisiona** MongoDB, Soketi, redes externas nem o `.env`; isso é preparado uma
  vez no servidor. Requer Docker rootless acessível pelo usuário SSH.

## Limitações e decisões

- Sem zero downtime: o serviço único é recriado (breve indisponibilidade).
- Sem registry de imagens: a transferência é feita por SCP e o artefato tem retenção curta
  (3 dias) no GitHub.
- A imagem é construída no runner (aborda o requisito de não sobrecarregar o servidor); o servidor
  apenas importa e reinicia.
- Não há integração configurada na tela `/integracoes` para o deploy: é infraestrutura de CI/CD,
  não um serviço do app. Credenciais ficam em GitHub Secrets, nunca no repositório.

## Estratégia de merge (OPE-96)

- **Decisão: manter o merge commit.** PRs entram na `main` com `gh pr merge --merge`, inclusive o
  merge automático das centrais (`mergePrPrompt` em `src/features/agentic/prompts.ts`, que proíbe
  squash e rebase). A configuração de merge do repositório no GitHub não foi alterada.
- **Bump de versão por commit removido** do `AGENTS.md` e dos guias: era a principal fonte de
  conflitos (todo PR alterava a mesma linha do `package.json`). A versão do `package.json` (exibida
  na barra lateral e em Ambientes) não muda mais a cada commit.
- **Avaliação do squash:**
  - Prós: `main` linear com um commit por tarefa (título com o código OPE-xx), revert de uma
    entrega inteira simples, histórico mais legível.
  - Contras: não reduz os conflitos por si só (o conflito do bump existiria igual); perde os commits
    granulares na `main` (`git blame`/`bisect` menos precisos); branches empilhadas sobre outra
    ainda aberta ganham conflitos falsos após o squash da base; `git branch --merged` deixa de
    reconhecer branches entregues; exigiria mudar o merge automático do Opex, hoje fixo em merge
    commit para todas as centrais (prompt, descrição em `GitSection.tsx` e testes).
  - Recomendação: remover o bump ataca a causa dos conflitos; o merge commit continua compatível com
    a integração da `main` por merge nas branches das tarefas. Reavaliar o squash só se os conflitos
    persistirem.
