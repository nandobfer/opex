# Módulo: Deploy (CI/CD, GitHub Actions)

Objetivo: entregar o Opex em produção automaticamente a cada push na `main`, construindo a imagem
Docker **no runner do GitHub** (sem sobrecarregar o servidor), transferindo-a e recriando o serviço
via Compose. O pipeline vive em `.github/workflows/ci-cd.yml`; a etapa remota é orquestrada por
`scripts/deploy-production.ts`.

## Visão geral do pipeline

Workflow `CI/CD` (`.github/workflows/ci-cd.yml`), com três jobs encadeados:

| Job | Nome exibido | Quando roda | O que faz |
|---|---|---|---|
| `vitest` | `Vitest` | todo `push` na `main`, todo `pull_request` e `workflow_dispatch` | instala com pnpm e roda `pnpm test` (suíte Vitest completa) |
| `build` | `Build image` | só `push`/`workflow_dispatch` na `main`, após `vitest` passar | constrói a imagem com Buildx (com QEMU se a plataforma divergir), exporta `opex-image.tar.gz` + checksum e publica como artefato |
| `deploy` | `Deploy production` | só `push`/`workflow_dispatch` na `main`, após `build` | baixa o artefato, valida o checksum local, transfere por SCP e executa `scripts/deploy-production.ts` |

- **CI bloqueante em PR:** o job `vitest` roda em todo pull request. Para impedir o merge com CI
  falhando, o repositório deve ter a proteção de branch na `main` exigindo o status check do job
  `Vitest` (`CI/CD / Vitest`). Essa configuração é feita no GitHub, em
  **Settings → Branches → Branch protection rules** (ou Rulesets), marcando **Require status checks
  to pass before merging** e selecionando o check `Vitest`. O YAML sozinho não bloqueia o merge.
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

## Deploy no servidor

O job `deploy` prepara a chave SSH e o `known_hosts` (de **GitHub Secrets**), valida o checksum
local e roda `npx tsx scripts/deploy-production.ts`. Ele **não usa pnpm**: o `setup-node` roda com
`package-manager-cache: false` para não detectar o `packageManager` do `package.json` e exigir o
binário do pnpm (que não é instalado nesse job). O script (`scripts/deploy-production.ts`) faz,
em ordem, e falha na primeira inconsistência:

1. **Pré-requisitos locais:** confere que a chave, o `known_hosts`, o arquivo da imagem e os
   arquivos de Compose existem antes de tocar no servidor.
2. **Pré-verificações remotas:** via SSH, confere `docker`, `docker compose`, a presença do `.env`
   no diretório de produção e as redes externas exigidas (`mongodb-network`, `soketi-network`).
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

## Solução de problemas (deploy)

- **`Unable to locate executable file: pnpm`** no passo *Configurar Node* do job `deploy`: acontece
  quando o job não usa pnpm. Corrigido com `package-manager-cache: false` no `setup-node`.
- **`No ED25519 host key is known for <host> ... Host key verification failed`**: o segredo
  `DEPLOY_KNOWN_HOSTS` não contém a host key de `DEPLOY_HOST`.
  - O `DEPLOY_HOST` do SSH deve ser o **host/IP real** do servidor. Um domínio atrás de proxy/CDN
    (ex.: Cloudflare) resolve para o proxy e **não serve SSH** — `ssh-keyscan` nele não retorna o
    host key do servidor.
  - Gere o `known_hosts` com o **mesmo valor** de `DEPLOY_HOST`:
    `ssh-keyscan -p <porta> -t ed25519,ecdsa,rsa <DEPLOY_HOST>`. Se você rodar `ssh-keyscan localhost`
    (ou com outro nome), as linhas ficam com esse nome e não combinam com o host de `DEPLOY_HOST`.
  - Confirme antes de rodar o CI (troque o usuário/host/chave):
    ```bash
    ssh -i ~/.ssh/opex_deploy -o UserKnownHostsFile=./known_hosts \
        -o StrictHostKeyChecking=yes -o BatchMode=yes burgos@<DEPLOY_HOST> true
    ```
    `Host key verification failed` = `known_hosts` errado; `Permission denied (publickey)` = o host
    key está ok e o problema seja a chave (próximo item).
- **`Permission denied (publickey)`**: a chave pública do `DEPLOY_SSH_KEY` não está em
  `~/.ssh/authorized_keys` do usuário, ou as permissões estão frouxas. O `sshd` (StrictModes)
  recusa a chave se `~/.ssh` (ou o home) for gravável por grupo/outros: use `chmod 700 ~/.ssh`.

## Limitações e decisões

- Sem zero downtime: o serviço único é recriado (breve indisponibilidade).
- Sem registry de imagens: a transferência é feita por SCP e o artefato tem retenção curta
  (3 dias) no GitHub.
- A imagem é construída no runner (aborda o requisito de não sobrecarregar o servidor); o servidor
  apenas importa e reinicia.
- Não há integração configurada na tela `/integracoes` para o deploy: é infraestrutura de CI/CD,
  não um serviço do app. Credenciais ficam em GitHub Secrets, nunca no repositório.
