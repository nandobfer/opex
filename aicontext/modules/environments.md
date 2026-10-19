# Módulo: Ambientes (OPE-67)

## Navegação e workspace

`Ambientes` fica em Início, no dono e no portal. Rotas: `/ambientes`,
`/ambientes/[repoId]`, `/ambientes/[repoId]/config` e
`/ambientes/[repoId]/ambiente/[envId]`; o portal espelha em `/cliente/ambientes`.
`envId=novo` abre a criação. A entrada recupera o último repositório ainda acessível
(`localStorage`, chave versionada por cliente/dono) ou seleciona o primeiro disponível.

O workspace reusa o layout da **Central de desenvolvimento**: `WorkspaceShell` (duas colunas na
altura visível do `<main>`, um painel por vez no celular com "voltar") e `WorkspacePane` (card com
título/contador, ações, seletor de repositório pelo `RepoPicker` — avatar do GitHub —, busca por
nome/branch e a lista). À direita, `EnvironmentHeader` (identidade, estado da operação, atalhos
Publicar/Restaurar e metadados) e as abas Compose, Logs, Publicar, Restaurar e CI/CD em `ViewTabs`;
as seções usam `Card` e o rodapé dos formulários é o `FormActions`. `/ambientes` é persistente na
casca (`PERSISTENT_PAGE_HREFS`), então trocar repositório, ambiente ou aba anima só o trecho que
mudou. Listas acima de 50 itens virtualizam (TanStack Virtual), a busca local usa fuse.js e os
formulários usam os mesmos schemas Zod das APIs.

O cliente roda em **contexto não seguro**: o app e a prévia são acessados por HTTP num IP/host da
rede local, onde o navegador não expõe `crypto.randomUUID`, `crypto.subtle` nem
`navigator.clipboard`. Identificadores de requisição (`requestId`) e de espectador (`viewerId`)
vêm de `randomId()` (`src/lib/random-id.ts`, via `getRandomValues`) — nunca de
`crypto.randomUUID()`, que estoura na tela com `Uncaught TypeError`.

## Acesso e configuração

- Dono: acesso completo; ator local, sem introduzir papéis no app interno.
- Cliente: sessão revalidada por `requireClientActor`, cliente ativo e repositório em
  `client.projectIds`, em **cada requisição**. Usuários comuns consultam, publicam e restauram;
  administradores também configuram ambientes e o workflow CD.
- Apenas o dono altera destino/usuário/autenticação SSH, known_hosts e segredos. Isso evita que
  outro usuário redirecione credenciais já salvas para um host próprio.
- Configuração do repositório: Local ou Remoto, host, porta, usuário, autenticação por chave/senha,
  linha known_hosts verificada e workflow de CD. Não há connection string.
- Ambiente: nome, slug imutável, branch, diretório absoluto, Compose relativo ao repositório,
  serviços, porta, CPU/memória, variáveis públicas/privadas, URL e timeout do healthcheck.
- Revisões impedem gravações/confirmações desatualizadas; configuração ocupada não é editável.
  Valores privados vazios mantêm o segredo salvo. Admin do cliente não converte/remove segredos.

## Execução no host: shell do OpenCode + agente

O servidor do Opex pode rodar em container (sem mounts) e o OpenCode roda direto no host: os dois
**não compartilham filesystem**. Por isso **toda interação com o host passa pelo OpenCode**, nunca
por executor SSH/Docker/Git no servidor nem por canal de volta host → Opex:

| Interação | Como |
|---|---|
| Gravar/remover o acesso temporário | **shell** (`client.shell`, sem modelo) |
| Ler Compose efetivo, containers e imagens | **shell** (`inspectHost`) |
| Logs | **shell em streaming** (`streamOpencodeShell`) |
| Conferir o resultado da ação | **shell** (`verifyHostResult`) |
| Publicar / restaurar | **agente** (operação complexa) |
| Versão do banco (migrações) | **agente**, turno curto somente leitura |

O shell fica em `src/lib/ai/opencode-client.ts` (`runOpencodeShell` com `outputLimit`;
`streamOpencodeShell` entrega a saída por `cursor` e, ao abortar, remove o shell — o que encerra o
processo no host). O módulo usa `src/features/environments/server/host.ts`:

- `writeAccess`: um comando grava `<accessDirectory>/operation-<id>` (0700) com `variables.json`
  (variáveis públicas + secretas, quando o escopo tem variáveis) e, no remoto, `access.json`,
  `identity`, `known_hosts`, `ssh.cjs` e `askpass` (0600/0700), mais o marcador `ready`. O conteúdo
  vai em base64 **pelo stdin** (`printf` é builtin, não aparece no `ps`), nunca no prompt nem no
  modelo, e o registro do shell é removido logo em seguida. `removeAccess` (`rm -rf`) só aceita
  `<accessDirectory>/(operation|logs|probe)-<id>`.
- `inspectHost`: script `sh` puro (roda também no host remoto, sem node/jq). Descobre os arquivos
  Compose pelos labels dos containers (`com.docker.compose.project.config_files`, inclui overrides),
  roda `docker compose config --format json`, lista containers/imagens por label do projeto e conta
  processos de compose/build ainda ativos (`quiescent`). Do Compose ficam só serviço, imagem,
  portas, volumes e os **nomes** das variáveis. Todo comando roda em `sh -c` (o shell do usuário pode
  ser zsh, que não separa `$args`); no remoto, pelo helper `node <acesso>/ssh.cjs`.
- Falhas viram `failureCode`: `HOST_UNREACHABLE`, `ACCESS_WRITE_FAILED`, `HOST_COMMAND_FAILED`,
  `COMPOSE_NOT_FOUND`, `PREFLIGHT_UNVERIFIED`, `RESULT_UNVERIFIED`, `AGENT_UNVERIFIED`. O histórico
  mostra a mensagem da operação e a orientação pt-BR do código (`environmentFailureHint`).

Integrações › IA › **Administração de sistema** (`aba=administracao-sistema`) configura habilitação,
modelo, agente, variante, skill, instruções, timeout, diretório administrativo (localção dos shells
e sessões no OpenCode) e diretório de acesso (no host do OpenCode). Persistida em
`ai_feature_settings`, feature `system-administration`; chaves de versões anteriores
(`agentBaseUrl`, `accessTokenTtlMinutes`) são descartadas ao carregar e não desligam o módulo.
Consumo em `environments`.

**Testar acesso ao host** (`POST /api/environments/access-probe`, só o dono) roda só pelo shell:
grava, lê e remove um acesso de teste e confere `docker version` e `docker compose version`,
exibindo cada verificação com o detalhe.

SSH e variáveis privadas usam AES-GCM (`secretBox.ts`), `select:false` e DTOs explícitos. Nunca
retornam valores, apenas indicação de configuração. Auditoria não recebe segredos. O helper SSH
lê senha/passphrase via SSH_ASKPASS, usa chave por arquivo e known_hosts obrigatório, e recusa
executar após 5 horas. Saídas do host e do agente passam por `redact` antes de persistir.

O agente precisa de uma política administrativa previamente autorizada e restrita ao escopo.
Pedidos adicionais de permissão são recusados; não há aprovação intermediária de plano. Git privado
exige autenticação já disponível no host. O prompt diz que o acesso **já foi gravado** pelo Opex
(o agente não o recria nem apaga) e trata o repositório como dados, não instruções.

O acesso é removido em sucesso/falha/interrupção. Se a remoção falhar, `accessPath` fica
registrado e o agendador remove pelo shell depois. Com o OpenCode indisponível durante uma sessão
não verificável, o acesso é preservado e o ambiente continua reservado.

## Persistência e execução

- `environment_repos`: `EnvironmentRepoConfig`, único por `projectId`.
- `environments`: configuração, revisão, último Compose/banco observado e reserva da operação.
- `environment_operations`: tentativa idempotente por ator/requestId, configuração e agente
  congelados, fases (`preflight`, `action`, `cd`, `inspect`, `reconcile`), sessão/turno, heartbeat,
  etapas com data/hora (últimas 100), evidências, migrações, run, resultado, `accessPath` (caminho
  no host do agente) e `failureCode` (falha conhecida, traduzida na UI). Checkpoints têm limite de
  200 por turno; falha na persistência interrompe o agente para reconciliação.
- `environment_images`: conjuntos de imagens por serviço, IDs imutáveis, tags/versões, banco
  associado, origem (`opex`, `cd`, `external`) e data de build comprovada pelo Docker (`null`
  quando desconhecida, nunca substituída pela hora da consulta). Não há S3/registry novo.
- `environment_deployments`: histórico separado por operação, banco anterior/observado,
  migrações, evidências, imagens e resultado; não cresce dentro do ambiente.
- `environment_log_sessions`: sessão compartilhada e leases de espectadores com expiração.

O acesso temporário **não é gravado no disco do servidor**: só no host, pelo shell. Na retomada
de uma sessão de ação, o Opex confere o marcador `ready` e reaproveita o diretório; senão, regrava.

O projeto Compose é `<slug-repo>-<slug-ambiente>` (repo completo normalizado). Overrides são
exclusivos; Compose versionado não muda. O agente recusa conflitos de diretório/remote, alterações
locais, portas, nomes fixos e volumes compartilhados não autorizados. Porta exige serviço/porta
interna identificados sem ambiguidade; nunca se adivinha uma porta.

Publicar e Restaurar exigem confirmação explícita e reserva atômica por ambiente. O servidor inicia
o trabalho em segundo plano, independentemente da tela. Builds Local/host entram na mesma fila
FIFO global das prévias; CD não ocupa esse build local. Remoto é serializado por ambiente, não por
host. O despachante global usa lease Mongo; operações locais persistidas em execução/reconciliação
bloqueiam novas prévias. A rotina existente `agentic-queue-pump` carrega os participantes, reconcilia
operações/sessões e cobre reinícios; não existem Redis, workers ou filas paralelas.

## Publicar, restaurar e reconciliar

**Inspecionar**: o shell lê o host (Compose efetivo, containers, imagens) e um turno curto do
agente, somente leitura, identifica a versão do banco recebendo os fatos já lidos. Se o agente não
comprovar a versão, a inspeção ainda conclui (“Versão do banco não identificada”) e a versão
registrada **não é apagada**. Ambiente sem containers conclui; com containers fora de pé, fica
“Concluído com alerta de saúde”.

Publicação no host e restauração começam com **preflight pelo shell**: imagens atuais ganham um
registro (`<op>:before`) antes da ação e processos de compose/build ainda ativos bloqueiam
(`PREFLIGHT_UNVERIFIED`). Na primeira publicação (sem diretório/Compose ainda) o preflight segue
vazio. Na restauração, o turno de versão do banco revalida a compatibilidade antes de autorizar.

Publicar (agente): clone/update sem descartar trabalho, SHA, preservação de imagens anteriores,
build no host, overrides/limites/variáveis, recriação, migrações e healthcheck. Saúde ruim produz
resultado degradado, **sem rollback automático**. Checkpoints de migrações são persistidos antes
de prosseguir; uma falha posterior não apaga as migrações comprovadas.

**Conferência final pelo shell** (independente do texto do agente): publicação exige os serviços
selecionados (ou todos) com container `running`; restauração exige **cada** serviço com o ID de
imagem escolhido de pé. Agente sem comprovação → `AGENT_UNVERIFIED`; agente ok mas host sem os
containers → `RESULT_UNVERIFIED`. O registro de imagens da operação usa o que o shell leu.

CD: persiste intenção/data/SHA antes de disparar o workflow configurado, identifica um run por
workflow/branch/SHA/janela de tempo e recusa correlação ambígua. Reinício **não redispara** o workflow:
retoma run registrado ou procura o run do disparo original. Terminado o run, não há turno de ação:
o shell confere os containers e exige ao menos uma imagem construída depois do disparo; o agente só
identifica a versão do banco. O pipeline existente não é alterado.

Restaurar: seleciona conjunto de imagens por serviço, exige existência de todas, usa IDs imutáveis,
recria sem build/pull (`--no-build --pull never`) e nunca apaga volumes/restaura banco.

| Banco registrado/observado versus imagem | Ação |
|---|---|
| Conhecidos e iguais | Confirmar e permitir |
| Conhecidos e diferentes | Bloquear |
| Algum desconhecido | Exigir confirmação explícita do risco |

Versão do banco vem de evidências verificáveis de migrações do projeto, **sem conexão ao banco**
e sem `_opex_schema`; ausência de comprovação permanece `null`. Não confundir versão do app e banco.
Estado exibido é o último registro do Opex e pode divergir por alterações externas.
**Restaurar banco — Em desenvolvimento**, sem execução.

Fim do turno não implica sucesso: além do resultado Zod do agente, o shell comprova containers e
imagens e a ausência de processos de compose/build ativos (`quiescent`). Com o host quieto, a falha
libera a reserva; com processos ainda rodando, a reserva fica em `reconciling`. Após reinício,
retoma somente o turno de ação (fase `action` e sessão ativa/terminada) e confere pelo shell; sem
sessão a retomar, a reconciliação **só observa o host pelo shell** (sem agente): quieto →
interrompido com evidências; ativo → continua reservado. Indisponibilidade do OpenCode preserva a
reserva e o acesso. Quedas entre reserva e criação do registro são recuperadas sem executar nada.

## Logs, tempo real e APIs

Logs reutilizam `IntegrationConsole` e `IntegrationLog` (48h), integração `ai`, scope
`environment:ID`, sem entrada nova no catálogo. **Sem modelo**: um shell do OpenCode roda
`docker compose -p <projeto> logs -f --no-color --timestamps --since=30s` no diretório do ambiente
(no remoto, pelo helper SSH gravado em `<accessDirectory>/logs-<envId>`, sem variáveis). A saída chega
por cursor e vira **uma entrada por linha**, censurada, com `data.service` tirado do prefixo do
Compose (`serviço-1  | …`) — o filtro por serviço usa esse prefixo. O id do shell fica em
`EnvironmentLogSession.sessionId`. Primeiro espectador inicia; o último sair/expirar remove o shell
(encerra o processo no host). Leases de 90s renovados por heartbeat; a reconciliação remove shells
órfãos e o acesso remoto deixado no host. Saída de um espectador não cancela os outros.

Evento `environments-updated` publica **somente IDs**, em `private-app`, canais dos clientes
vinculados e, quando aplicável, `private-environment-ID` (autorização pelo vínculo no servidor).
Logs/resultados são recuperados por APIs revalidadas, nunca pelo canal geral da integração IA.
Reconexão invalida TanStack Query; polling de contingência mantém operações/logs acompanhados.

APIs autenticadas em `/api/environments` e `/api/cliente/ambientes`:

- `GET /`: repositórios acessíveis; `GET /:repoId`: ambientes.
- `GET/PUT /:repoId/config`; `PUT /:repoId/secrets` (dono, substituição).
- `POST /:repoId/environments`; `GET/PUT /:repoId/environments/:envId`.
- `POST /:repoId/environments/:envId/operations`: confirmação, revisão, requestId, método e imagem.
- `GET .../:envId/logs`; `POST .../:envId/viewer` (heartbeat/saída).
- `GET /:repoId/ci-cd`: workflows e runs recentes, filtros por workflow/branch e links do GitHub.
  Filtros, paginação dos runs e aba/serviço selecionados ficam na URL; workflows são paginados
  internamente para preencher o seletor. Runs aparecem em páginas de 50.
- `GET/PUT /api/ai/features/system-administration`: configuração global, exclusiva do dono.
- `POST /api/environments/access-probe`: “Testar acesso ao host” (dono), só pelo shell.

São rotas por sessão, não API pública por token; não mudam OpenAPI nem `PUBLIC_TOKEN_ROUTES`.
Nenhuma rota do módulo é pública (o host nunca chama o Opex).

## Validação

Testes específicos em `__tests__/features/environments/`, mais regressões da fila global,
autorização Pusher e navegação/abas afetadas. Serviços externos sempre mockados. Deploy real
exige configuração e validação do host pelo dono; testes automatizados não executam Docker/SSH/Git.
