# Módulo: Ambientes (`/ambientes` + `/cliente/ambientes`)

Área para gerenciar os **containers em execução** no servidor de cada repositório vinculado (o
**Projeto**): lê o `docker-compose`, acompanha logs, **publica versões** (build/deploy) e **restaura
imagens**, com **bloqueio por compatibilidade de banco** e acompanhamento do **CI/CD** do repositório.
Disponível para o **dono** (todos os repositórios) e para o **portal do cliente** (só os repositórios
de `OrcamentoClient.projectIds`). Código em `src/features/environments/`.

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
repositório no host (`gitSync`) e o diretório é campo da configuração.

## Isolamento por ambiente

Cada ambiente roda com **projeto Compose próprio** (`docker compose -p <slug-repo>-<slug-ambiente>`),
via **override gerado fora do checkout** (`<diretório>/.opex/<projeto>.override.yml`). O override
define imagem, porta publicada (`<porta>:<porta do container>` inferida do compose), limites
(CPU/memória) e variáveis. `findComposeIsolationConflicts` avisa quando o compose fura o isolamento
(`container_name` fixo, volumes/redes `external: true`).

## Configuração do repositório (`/ambientes/[repoId]/config`)

Modo (Local/Remoto), host/porta/usuário, autenticação (chave/senha), caminho da chave, diretório dos
repositórios, workflow de CD e a connection string **padrão** do banco. Os segredos (senha/chave/
passphrase SSH e connection string) ficam **cifrados** (`secretBox`, AES-256-GCM) e são **somente
substituíveis**: a API devolve apenas `configured`/`unreadable`, nunca o valor. **Só o dono** define
segredos; o admin do cliente edita apenas os campos públicos.

## Configuração do ambiente (`/ambientes/[repoId]/ambiente/[envId]`)

Nome/slug, **branch**, diretório no host, arquivo/serviço do compose, porta publicada, limites
(CPU/memória), variáveis de ambiente (com marcação de **secreta**, só pelo dono), healthcheck
(habilitado, caminho e timeout) e a **fonte da versão de banco** (arquivo, comando ou nenhuma).
Admin do cliente edita; variáveis secretas e o override de connection string são exclusivos do dono.

## Workspace (`/ambientes`, `/ambientes/[repoId]`)

Duas colunas (padrão `/desenvolvimento`): à esquerda, o **seletor de repositório** em linha inteira +
**icon button de configurações** (leva ao config do repositório), **Novo ambiente** e a lista; à
direita, o **header** do ambiente (nome, atalhos **Publicar** e **Restaurar**, icon button de config
do ambiente) e as abas **Compose | Logs | Publicar | Restaurar | CI/CD**. No celular (`< lg`), um
painel por vez. O último repositório fica no `localStorage` (`opex:ambientes:repo:{owner|client}:v1`).

## Abas

- **Compose**: lê o arquivo pela **API do GitHub** (Contents API, `ref` = branch), interpreta o YAML
  (`yaml`) e apresenta serviços, imagens, portas, volumes e variáveis; sem token/arquivo → erro com
  "tentar novamente".
- **Logs**: `docker compose logs` por serviço ou todos; histórico gravado em `environment_logs`
  (TTL 48 h) + ao vivo pelo canal do ambiente; a tela busca por polling enquanto a aba está aberta.
- **Publicar**: seletor **Local (Opex)** | **CD (GitHub Actions)**.
  - **Local**: etapas **Clonar/atualizar → Build → Checagem do banco → Subir → Healthcheck**, com
    progresso em tempo real. Entra na **fila global do build** (compartilhada com a prévia agêntica);
    a checagem de banco é **informativa** antes de subir. Healthcheck falho **avisa, sem rollback**.
    Grava o metadado `{ tag, dbVersion, builtAt }` em `environment_images`.
  - **CD**: dispara o **workflow configurado** (`workflow_dispatch`) na branch e acompanha o run; a
    correlação é determinística (mesmo workflow/branch, criado após o disparo).
- **Restaurar**: lista as imagens do host. Versão de banco **igual** e origem Opex → liberada;
  **diferente** → **bloqueada** (com aviso e o botão **Restaurar banco — Em desenvolvimento**);
  **desconhecida** ou imagem do **CD** → **confirmação** explícita. Restaurar = recriar o container
  com `up -d --no-build --pull never` e a referência imutável da imagem.
- **CI/CD**: runs de **todos** os workflows do repositório (workflow, branch, status, tempo, link),
  com filtro por workflow e branch.

## Banco e compatibilidade

- **Versão atual do banco**: o Opex conecta pela **connection string do ambiente** (override cifrado)
  ou pela **padrão do repositório** e lê a coleção **`_opex_schema`** (documento `_id: "schema"`,
  campo `version`), numa conexão separada (`server/database.ts`). `null` = desconhecida.
- **Compatibilidade** (`checkRestoreCompatibility`, puro): igual → compatível; diferente → bloqueada;
  desconhecida ou CD → confirmação. Publicar migra (a versão do banco sobe no start) e a checagem é
  informativa.
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
| `environment_repos` | `EnvironmentRepoConfig` | Modo, host/SSH, workflow de CD, segredos cifrados |
| `environments` | `Environment` | Branch, compose, porta, recursos, variáveis, healthcheck, fonte de versão |
| `environment_images` | `EnvironmentImage` | Id imutável, tag, versão de banco, data, origem, SHA |
| `environment_operations` | `EnvironmentOperation` | Tipo, etapas, estado, tentativa, lease |
| `environment_logs` | `EnvironmentLog` | Logs (TTL 48 h) |

## APIs

Dono em `/api/environments/**`; portal em `/api/cliente/ambientes/**` (todas por `requireClientActor`).
Os **handlers são os mesmos** (`server/route-handlers.ts`), parametrizados pelo ator:

| Rota | Descrição |
|---|---|
| `GET …/projects` | Repositórios acessíveis |
| `GET/PUT …/projects/[projectId]` · `/config` | Configuração de execução (segredos só pelo dono) |
| `GET/POST …/projects/[projectId]/environments` | Lista / cria ambiente |
| `GET …/projects/[projectId]/ci-cd` | Runs e workflows |
| `GET/PATCH/DELETE …/environments/[envId]` | Ambiente |
| `GET …/environments/[envId]/compose` | Compose (via GitHub) |
| `GET …/environments/[envId]/images` | Imagens para restauração |
| `GET …/environments/[envId]/operations[/opId]` | Operações |
| `POST …/environments/[envId]/publish` · `/restore` | Publicar / restaurar |
| `GET …/environments/[envId]/logs` | Logs (cursor `after`, `scope`, `service`) |

## Tempo real

Canal privado **`private-environment-{id}`** (regra em `src/lib/pusher/channel-auth.ts`): o dono sempre;
o usuário de cliente **só** se o ambiente pertencer a um repositório vinculado ao cliente — essa parte
exige banco e é decidida por `isEnvironmentChannelAuthorized` (`server/realtime.ts`), chamada pela rota
`/api/pusher/auth`. Eventos: `environments-updated` (lista), `environment-operation-updated` (etapas) e
`environment-log` (linhas ao vivo).

## Papéis e segurança

- Dono vê todos os repositórios; o cliente, só `OrcamentoClient.projectIds`.
- Criar/editar/excluir ambiente: dono **e** admin do cliente; publicar/restaurar/logs: todos com acesso.
- **Segredos** (SSH, connection string, variáveis secretas e comandos de versão): **exclusivos do
  dono**, cifrados e nunca devolvidos.
- Auditoria (`recordAudit`): config do repositório (`AmbienteRepositorio`), ambiente (`Ambiente`) e
  operações (`AmbienteOperacao`), sem segredos.

## Fora de escopo

Restaurar **banco**; imagens em S3/registry (ficam no Docker do host); alterar o pipeline de produção
existente (`.github/workflows/ci-cd.yml`) — o CD aqui é apenas **disparado e acompanhado**.
