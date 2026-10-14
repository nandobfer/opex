# Módulo: Ambientes (`/ambientes` + `/cliente/ambientes`)

Área para gerenciar os **containers em execução** no servidor de cada repositório vinculado (o
**Projeto**): lê o `docker-compose`, acompanha os **logs reais** dos containers, **publica versões**
(build/deploy) e **restaura imagens**, com **bloqueio por compatibilidade de schema** e
acompanhamento do **CI/CD** do repositório. Disponível para o **dono** (todos os repositórios) e para
o **portal do cliente** (só os repositórios de `OrcamentoClient.projectIds`). Código em
`src/features/environments/`.

O módulo **não acessa o banco do ambiente** (não há connection string): a compatibilidade usa o
**schema registrado no Opex** a partir das próprias publicações.

## Execução: Local ou Remoto

A configuração do repositório (`environment_repos`, uma por projeto) define como o Opex alcança o
host:

- **Local** (padrão): a máquina do OpenCode, pelo `shell` do próprio OpenCode
  (`runOpencodeShell`). O Opex em Docker não monta o socket do Docker nem os repositórios; por isso a
  execução local depende do OpenCode conectado.
- **Remoto**: SSH (`ssh` do sistema; autenticação por **chave** — arquivo temporário `0600` — ou por
  **senha** via `sshpass`). `StrictHostKeyChecking=accept-new`.

O host é resolvido em `createEnvironmentHost` (`server/runner.ts`); os serviços (git, docker,
compose) recebem um `EnvironmentHost` e são testados com um mock. O Opex **clona e atualiza** o
repositório no host (`gitSync`) e o diretório é campo da configuração. Num checkout existente, o
`gitSync` exige a **árvore limpa** (não descarta alterações locais às cegas; o `.env` não é
versionado e permanece).

## Isolamento e adoção do projeto Compose

Cada ambiente tem um **projeto Compose efetivo**:

- **Publicação nova**: projeto próprio do Opex (`-p <slug-repo>-<slug-ambiente>`), com **override
  gerado fora do checkout** (`<diretório>/.opex/<projeto>.override.yml`) definindo imagem, porta
  publicada (`<porta>:<porta do container>` inferida do compose) e limites (CPU/memória). O `.env`
  do host é a fonte das variáveis — o override **não** injeta variáveis.
- **Projeto adotado** (`Environment.composeProject`): quando já existe um projeto rodando no host
  (mesmo diretório e arquivo do compose), o Opex o **adota** — sem reiniciar, remover ou recriar
  containers — e passa a usá-lo em status, logs, publicar e restaurar. Não se cria um segundo stack.

A descoberta (`server/containers.ts` → `discoverComposeProject`) lê as **labels do Docker**
(`docker ps -a --format`, incluindo `com.docker.compose.project`, `…working_dir`, `…config_files`,
`…service`). Um candidato inequívoco pode ser adotado; com vários, a tela pede a escolha explícita
(`POST …/environments/[envId]/adopt`).

`findComposeIsolationConflicts` avisa quando o compose fura o isolamento (`container_name` fixo,
volumes/redes `external: true`).

## Status real dos containers

Ao **selecionar** um ambiente, o servidor consulta o host (`docker ps` por label de projeto) e
persiste o snapshot (`Environment.status`): `running`, `partial` (alguns rodando, outros parados),
`reachable` e `error`. A consulta respeita um intervalo mínimo (`STATUS_REFRESH_MS`); a tela
atualiza pelo polling da leitura do ambiente e pelo Pusher. **Host indisponível nunca vira "Parado"**
— aparece como "Host indisponível" com o motivo. Container já em execução aparece como "No ar" mesmo
sem nenhuma publicação feita pelo Opex.

## Configuração do repositório (`/ambientes/[repoId]/config`)

Modo (Local/Remoto), host/porta/usuário, autenticação (chave/senha), caminho da chave, diretório dos
repositórios e workflow de CD. Os segredos SSH (senha/chave/passphrase) ficam **cifrados**
(`secretBox`, AES-256-GCM) e são **somente substituíveis**: a API devolve apenas
`configured`/`unreadable`, nunca o valor. **Só o dono** define segredos; o admin do cliente edita
apenas os campos públicos. **Não há connection string** (o Opex não acessa o banco do ambiente).

## Configuração do ambiente (`/ambientes/[repoId]/ambiente/[envId]`)

Nome/slug, **branch** (seletor com busca das **branches reais** do repositório), diretório no host,
arquivo/serviço do compose, **arquivo de variáveis** (`.env`), porta publicada, limites (CPU/memória),
healthcheck (habilitado, caminho e timeout) e a **fonte do schema do banco** (arquivo, comando ou
nenhuma). O `composeProject` **não** é editado aqui: vem da adoção no host.

Abaixo do formulário fica o editor das **variáveis do `.env` real do host** (`EnvironmentEnvVarsCard`):
carrega nomes e valores **não sensíveis**; o valor de uma variável sensível **nunca** é devolvido
(mesmo ao dono) — só pode ser **substituído**. Salvar aplica alterações **por chave**, preservando
comentários e valores não alterados, com **checagem de revisão** (evita sobrescrever edição externa)
e escrita **atômica** (`tmp` + `mv`, `chmod 600`). Alterar variáveis **não** reinicia containers:
é preciso publicar/recriar. Chave sensível: só o dono; admin do cliente edita as demais.

## Workspace (`/ambientes`, `/ambientes/[repoId]`)

Mesmo desenho da Central de desenvolvimento (`/desenvolvimento`): **duas colunas** com a altura da
área visível (`useScrollViewportHeight`). À esquerda (`Card`, `lg:w-[340px]`): título com a contagem,
**seletor de repositório com busca** (`SearchPicker` + `GithubRepoLabel` — o mesmo padrão da coluna
Tarefas), icon button de configurações, **Novo ambiente** e a lista (com a etiqueta de estado). À
direita: **header** do ambiente (estado, schema registrado, atalhos **Publicar**/**Restaurar**,
icon button de config) e as abas **Compose | Logs | Publicar | Restaurar | CI/CD**. No celular
(`< lg`), um painel por vez. O ambiente selecionado fica na URL (`?env=<id>`); o último repositório
no `localStorage` (`opex:ambientes:repo:{owner|client}:v1`).

## Abas

- **Compose**: lê o arquivo pela **API do GitHub** (Contents API, `ref` = branch), interpreta o YAML
  (`yaml`) e apresenta serviços, imagens, portas, volumes e variáveis; sem token/arquivo → erro com
  "tentar novamente".
- **Logs**: logs **reais** dos containers do projeto efetivo, por serviço ou todos. O servidor mantém
  um **coletor** por ambiente (`server/log-collector.ts`) que roda `docker logs --timestamps` de cada
  container, grava em `environment_logs` (TTL 48 h) e publica no canal do ambiente; ele se encerra
  sem leitores (`LOG_SESSION_TTL_MS`). Funciona também para projeto **adotado** (sem o compose).
  A tela busca por polling (histórico + novas linhas), com **Atualizar**, rolagem automática e
  estados distintos ("aguardando" só quando a coleta está conectada e sem saída).
- **Publicar**: seletor **Local (Opex)** | **CD (GitHub Actions)**. A **branch vem da configuração do
  ambiente** (não é pedida de novo) e é gravada no snapshot da operação.
  - **Local**: etapas **Clonar/atualizar → Build → Subir containers → Compatibilidade do banco →
    Healthcheck**, com progresso em tempo real. Entra na **fila global do build** (compartilhada com
    a prévia agêntica). Ao concluir a subida, grava o metadado da imagem em `environment_images` e
    **registra o schema aplicado** (`appliedDbVersion`). Healthcheck falho **avisa, sem rollback**.
  - **CD**: dispara o **workflow configurado** (`workflow_dispatch`) na branch e acompanha o run; a
    correlação é determinística (mesmo workflow/branch, criado após o disparo). Ao terminar, confere
    se os containers realmente subiram antes de confiar no schema; sem evidência, o schema aplicado
    fica **desconhecido**.
- **Restaurar**: lista as imagens do host. Schema registrado **igual** e origem Opex → liberada;
  **diferente** → **bloqueada** (com aviso e o botão **Restaurar banco — Em desenvolvimento**);
  **desconhecido** ou imagem do **CD** → **confirmação** explícita. Restaurar = recriar o container
  com `up -d --no-build --pull never` e a referência imutável da imagem; **não reduz** o schema
  registrado.
- **CI/CD**: runs de **todos** os workflows do repositório, com filtro por workflow e por **branch
  (seletor com busca**, incluindo "Todas as branches").

## Schema e compatibilidade (registrado no Opex)

- **Fonte do schema**: campo do ambiente (`dbVersionSource`) — **arquivo** ou **comando** lido no
  build, ou nenhum. É o schema **esperado pela imagem**.
- **Registro**: ao concluir a subida de uma publicação local, o Opex grava
  `Environment.appliedDbVersion` (+ `appliedDbVersionAt`, `appliedDbVersionOperationId`) — o
  histórico das próprias publicações bem-sucedidas. Build concluído **não** promove o schema; só a
  subida efetiva.
- **Compatibilidade** (`checkRestoreCompatibility`, puro): compara o **schema registrado** com o da
  imagem — igual + Opex → compatível; diferente → bloqueada; desconhecido ou CD → confirmação.
- **Limite conhecido**: migração externa ao Opex não é detectável (não há leitura do banco); a tela
  deixa claro que a garantia é o histórico registrado.
- **Restaurar banco** está **fora de escopo** (ação "Em desenvolvimento").

## Operações duráveis e fila

Publicar/restaurar são **operações persistidas** (`environment_operations`) **antes** da execução, com
etapas, estado, tentativa e **lease**; rodam no servidor e sobrevivem a fechar a tela. Uma operação
**ativa por ambiente** por vez. A fila **local** compartilha o "um build por vez" da prévia agêntica
(`server/queue.ts` + `pumpEnvironmentQueue`); hosts **remotos** são serializados por ambiente. A rotina
interna **`environments-operations`** (1 min) reconcilia operações órfãs (lease vencido → `failed`)
e reavalia a fila.

## Modelos

| Coleção | Modelo | Papel |
|---|---|---|
| `environment_repos` | `EnvironmentRepoConfig` | Modo, host/SSH, workflow de CD, segredos SSH cifrados |
| `environments` | `Environment` | Branch, compose, `.env`, porta, recursos, healthcheck, fonte e schema aplicado, status, projeto adotado |
| `environment_images` | `EnvironmentImage` | Id imutável, tag, schema esperado, data, origem, SHA |
| `environment_operations` | `EnvironmentOperation` | Tipo, etapas, estado, tentativa, lease |
| `environment_logs` | `EnvironmentLog` | Logs (TTL 48 h) |

## APIs

Dono em `/api/environments/**`; portal em `/api/cliente/ambientes/**` (todas por `requireClientActor`).
Os **handlers são os mesmos** (`server/route-handlers.ts`), parametrizados pelo ator:

| Rota | Descrição |
|---|---|
| `GET …/projects` | Repositórios acessíveis |
| `GET/PUT …/projects/[projectId]` · `/config` | Configuração de execução (segredos SSH só pelo dono) |
| `GET …/projects/[projectId]/branches` | Branches reais (seletor com busca) |
| `GET/POST …/projects/[projectId]/environments` | Lista / cria ambiente |
| `GET …/projects/[projectId]/ci-cd` | Runs e workflows |
| `GET/PATCH/DELETE …/environments/[envId]` | Ambiente (a leitura atualiza o status real do host) |
| `GET …/environments/[envId]/compose` | Compose (via GitHub) |
| `GET …/environments/[envId]/images` | Imagens para restauração |
| `GET/PUT …/environments/[envId]/env-file` | `.env` real do host (leitura sem segredos; gravação por chave) |
| `GET …/environments/[envId]/discover` · `POST …/adopt` | Descobrir / adotar o projeto Compose existente |
| `GET …/environments/[envId]/operations[/opId]` | Operações |
| `POST …/environments/[envId]/publish` · `/restore` | Publicar / restaurar |
| `GET …/environments/[envId]/logs` | Logs (cursor `after`, `scope`, `service`; liga o coletor) |

## Tempo real

Canal privado **`private-environment-{id}`** (regra em `src/lib/pusher/channel-auth.ts`): o dono sempre;
o usuário de cliente **só** se o ambiente pertencer a um repositório vinculado ao cliente — essa parte
exige banco e é decidida por `isEnvironmentChannelAuthorized` (`server/realtime.ts`), chamada pela rota
`/api/pusher/auth`. Eventos: `environments-updated` (lista e status), `environment-operation-updated`
(etapas) e `environment-log` (linhas ao vivo).

## Papéis e segurança

- Dono vê todos os repositórios; o cliente, só `OrcamentoClient.projectIds`.
- Criar/editar/excluir/adotar ambiente: dono **e** admin do cliente; publicar/restaurar/logs: todos com acesso.
- **Segredos** (SSH, valores sensíveis do `.env` e comandos arbitrários de schema): **exclusivos do
  dono**, cifrados (os do repositório) e nunca devolvidos; valores sensíveis do `.env` nunca saem do
  servidor (nem para o dono) e o conteúdo do arquivo não é registrado em log.
- Auditoria (`recordAudit`): config do repositório (`AmbienteRepositorio`), ambiente (`Ambiente` —
  inclui a edição do `.env`, só nomes e tipo de alteração) e operações (`AmbienteOperacao`), sem segredos.

## Fora de escopo

Restaurar **banco**; imagens em S3/registry (ficam no Docker do host); alterar o pipeline de produção
existente (`.github/workflows/ci-cd.yml`) — o CD aqui é apenas **disparado e acompanhado**; detectar
migração de banco feita fora do Opex.
