# Bootstrap de projeto (Agente de Bootstrap)

OPE-215. Cria um repositório novo (ou adota um existente ainda não vinculado) e provisiona o ambiente do zero a partir da
**Nova central**, num assistente de 5 etapas com o **Agente de Bootstrap** (sessão longa do OpenCode no host). Código em
`src/features/project-bootstrap/` (prefixo `project-bootstrap`, para não confundir com o bootstrap do Engramind e o da
Builder Machine).

## Entrada pela Nova central

- No seletor de repositório do `CreateCentralDialog`, digitar um nome que não está na lista mostra
  **Criar repositório «nome» e provisionar o ambiente** (prop `createOption` do `SearchPicker`, também pelo teclado).
- Com o nome novo, o diretório some, o botão vira **Continuar no bootstrap** e leva a
  `/integracoes/ia/bootstraps/novo?repo=owner/nome` (`projectBootstrapNewPath`). Um projeto vinculado segue o fluxo de
  sempre.

## Etapas (stepper)

`WizardStepper` com `statuses`/`progress`/`badges` (cores: primária = executando com o anel girando, warning = aguardando
você, destructive = falhou, success = concluída). A etapa atual abre por padrão; as anteriores abrem **só leitura**.

1. **Informações** (`/integracoes/ia/bootstraps/novo`, `BootstrapInfoForm`):
   - dono (conta do token do GitHub ou uma organização dele, `GET /api/project-bootstraps/owners`) e nome; sem `owner/` no
     nome, vale a conta pessoal do token;
   - conferência ao vivo (`GET /api/project-bootstraps/check-repo`, com espera da digitação): nome inválido, sem
     permissão no dono, **já vinculado** (`projects.repo`) ou com bootstrap em andamento **bloqueiam**; livre = será
     criado; existente e não vinculado = **modo repositório existente** ("Este repositório já existe no GitHub: o bootstrap
     vai usá-lo"), com a branch padrão do GitHub como ref do ambiente e base da central, e a visibilidade oculta;
   - permissão real do token também bloqueia: repositório existente só com leitura (sem `push`/`maintain`/`admin` em
     `permissions`), convite pendente na organização ou organização que não deixa o membro criar repositórios (geral ou na
     visibilidade escolhida, `members_can_create_*`; dono da organização sempre pode);
   - visibilidade (padrão privado), contexto geral (objetivo e stack) e os **badges de tecnologia** ao vivo
     (`detectTechnologies`: sem acento e caixa, palavra inteira, aceita `.`/`#`/`+`, sem repetir, agrupado na ordem dos
     grupos);
   - diretório no host (padrão `<raiz dos repositórios>/<nome>`; editável), conferido no host
     (`GET /api/project-bootstraps/check-directory`): inexistente/vazio segue, clone do mesmo repositório é reaproveitado,
     outro conteúdo ou outro remoto bloqueia;
   - colunas de entrada e de conclusão do vínculo (padrão: as do último vínculo criado; sem vínculo, a primeira coluna do
     quadro e nenhuma de conclusão), pelo `BoardColumnPicker` (o mesmo do diálogo de vínculo do GitHub);
   - bloqueiam o envio, com o caminho para resolver: Agente de Bootstrap desativado ou sem modelo, OpenCode desconectado,
     token do GitHub ausente (`GET /api/project-bootstraps/prefill`). O servidor confere tudo de novo no
     `POST /api/project-bootstraps` e reconhece as tecnologias pelo catálogo.
2. **Provisionamento** (`ProvisionPanel`): conversa ao vivo (NDJSON `GET /api/project-bootstraps/[id]/events`, mesmo
   formato das mesas), `PermissionCard`, `AgentQuestionsCard` e o campo de mensagem (entra no turno vivo ou abre um turno
   novo na mesma conversa). O agente cria o repositório (`gh repo create owner/nome --private|--public`, depois de
   `gh auth status`), escreve AGENTS.md, README, `aicontext/`, o código mínimo (só health check no servidor; só a página
   de entrada no frontend), Dockerfile, `docker-compose.yml`, manifesto, `.env` (ignorado) e `.env.example`, os
   usuários/bancos exclusivos nos serviços compartilhados, anota a porta em `/home/used_ports` (`<porta> -> <nome do repositório>`) e
   faz o push. Termina com o bloco ` ```json bootstrap-result ` (`{ port, healthPath, hasServer, usesMongo, branch }`,
   `parseBootstrapResult`). Sem o bloco, o bootstrap fica **aguardando você**; bloco inválido falha.
   - **Conferência no host** (Opex, pelo shell do OpenCode, `verificationCommand`): repositório git com `origin` apontando
     para **este** repositório (o remoto é lido sem credenciais), push do `HEAD` em `refs/heads/<branch>`, árvore limpa,
     `.env` existente e ignorado, `docker-compose.yml`, a reserva da porta em `/home/used_ports` com o nome do repositório
     (`<porta> -> <nome>`; reserva de outro projeto não conta) e a porta livre (nenhum container de outro diretório a
     publica e nenhum outro processo escuta nela; um container deste diretório pode usá-la). Faltou algo: a etapa falha listando o que faltou; **Tentar novamente** pede ao agente, na mesma
     conversa, que complete. A branch é sempre a decidida na etapa 1.
3. **Amarração** (`LinkPanel`): `createLink` (vínculo em Integrações › GitHub, que cria o Projeto) e `createCentral` +
   `updateCentral` com `bootstrapCentralConfig` (branch base e destino do PR = a branch do push; backup do banco **só**
   com MongoDB; caminho de saúde da central). Idempotente: o que já existe (pelo id gravado em `created.*` ou pelo
   repositório/projeto) não é recriado. O id da central é gravado logo depois de criá-la e a configuração do bootstrap é
   aplicada também na central achada numa nova tentativa, até a marca `centralConfiguredAt` (uma falha do
   `updateCentral` não deixa a central com os padrões).
4. **Ambiente e deploy** (`DeployPanel`, com o `DeployLog`): `createEnvironment` com origem Central
   (`bootstrapEnvironmentInput`: nome e slug do repositório, ref da branch, build e execução no servidor, `ports: [porta]`,
   `healthUrl` = `http://localhost:<porta><healthPath>` ou `/` sem servidor, sem limites, variáveis do `.env` lido no host
   por `readText`) e `startDeploy`; o Opex acompanha o registro do deploy. Deploy com falha: soma uma tentativa e **volta à
   etapa 2** na mesma conversa com o erro e o fim do log (sem limite de voltas; o stepper mostra "Tentativa N"); na volta,
   o ambiente existente é atualizado (o `.env` ou a porta podem ter mudado; o `.env` substitui as variáveis inteiras, então
   um valor esvaziado no arquivo fica vazio, sem manter o da tentativa anterior). Slug ou projeto do compose já usados por outro
   ambiente: o ambiente nasce com o primeiro `<slug>-N` livre (`freeEnvironmentSlug`), com aviso na conversa; as voltas seguintes mantêm o slug e o projeto do compose gravados.
5. **Concluído** (`DonePanel`): links do repositório, da central e do ambiente e a porta.

**Cancelar** (com confirmação) para o agente, dispensa as perguntas e marca **Cancelado**; nada do que foi criado é
apagado e o resumo lista o que ficou (`createdSummary`). Com sessão gravada, a sessão do OpenCode é sempre interrompida no
host, mesmo depois de um reinício (quando o processo não tem mais o turno em memória).

**Um bootstrap aberto por repositório**, de forma atômica: o registro leva `activeRepo` enquanto está aberto (executando,
aguardando ou com falha), com índice único parcial (`active_repo_unique`, criado pela migração
`ensure-project-bootstrap-indexes`); concluir ou cancelar limpa a trava. Dois envios ao mesmo tempo: o segundo recebe 409
`BOOTSTRAP_ALREADY_RUNNING`.

## Motor e retomada

- `server/runner.ts`: cada trabalho em segundo plano é uma **ativação** (`activationId`); só ela grava no bootstrap
  (filtro por `activationId`), com batimento a cada 15 s (`heartbeatAt`). Cancelar troca a ativação.
- Liveness pelo banco (`isBootstrapStale`: obsoleto depois de 90 s, contando do mais recente entre o batimento e
  `stateAt`), nunca pelo mapa em memória. A retomada (`resumeIfStale`) assume pela ativação antiga e vem da leitura da
  página (`GET /api/project-bootstraps/[id]`) e do tick do agendador (`resumeStaleProjectBootstraps`, que não roda na
  prévia): na etapa 2 religa a mesma sessão (`probeReconnect` + attach, sem reenviar o prompt); sessão perdida vira falha
  acionável; nas demais etapas, refaz a fase (idempotente; um deploy já em andamento é acompanhado).
- Sessão como no Agente Refinador: instruções duráveis (`session.instructions.entry.put`, chave `opex-bootstrap`;
  sem suporte, vão no prompt), `runWithFallback` + `runAgentTurn`, `pendingForms`/`pendingPermissions` persistidos.
- As instruções duráveis levam o contexto do dono e as tecnologias reconhecidas, então valem em toda tentativa e numa
  sessão nova. **Tentar novamente** sem sessão (o primeiro turno nem chegou ao agente, ex.: skill ausente) reenvia o prompt
  inicial; com sessão, pede que complete o que faltou ou continue de onde parou.

## Skills do host

- A configuração guarda `skills` (padrão `bootstrap-agents-md`, `bootstrap-aicontext`, `bootstrap-docker`, instaladas em
  `~/.agents/skills`). Em todo turno que não é reconexão, o Opex lista as skills no diretório da sessão
  (`listOpencodeSkillsAt` com `want`) e **falha fechado**: listagem com erro ou skill escolhida ausente
  ("A skill X não está instalada no OpenCode do host…") bloqueiam a etapa 2 antes da sessão.
- As permissões da sessão negam todas as skills e liberam só as escolhidas (`skillPermissionRules`, compartilhada com os
  rotineiros em `src/features/opencode-resources/skill-permissions.ts`); cada skill é ativada uma vez por sessão
  (`activeSkills`). Reconectar não ativa nada.

## Aba "Agente de Bootstrap" (`/integracoes/ia?aba=agente-bootstrap`)

Fora do `AGENT_CATALOG` (sem item na sidebar nem página `/agente-*`), depois de Rotineiros. Seções (`?secao=`,
`projectBootstrapSectionPath`):

- **Configuração**: ligado/desligado, agente/modelo/variante/fallbacks do OpenCode (`AgentCard`), tempo máximo do turno
  (10–360 min) e instruções adicionais. Salva em `ai_feature_settings` (`project-bootstrap`) conferindo no catálogo.
- **Skills** (`BootstrapSkillsCard`): só escolhe quais skills do host o agente usa, com aviso das não instaladas e o link
  para Integrações › IA › OpenCode › Skills (onde o conteúdo é editado).
- **Catálogo de tecnologias** (`TechCatalogSection`): grupos com cor do seletor de cores (`ColorPaletteField`, aplicada
  por `style`, `techChipProps`) e tecnologias com variantes. Grupo com tecnologias não pode ser removido. Carga inicial
  pela migração `project-bootstrap-catalog` (grupos Linguagem, Banco de dados, Frontend, Backend, Infraestrutura,
  Serviços), gravada uma única vez com a marca `project-bootstrap-catalog` em `ai_feature_settings`: o que o dono
  remover não volta.
- **Histórico**: todos os bootstraps, cada um com o link da página.

Em Agente Desenvolvedor › Centrais, o card **Bootstraps em andamento** (`ActiveBootstrapsCard`) aparece acima das centrais
só com bootstrap executando, aguardando ou com falha.

## Dados, auditoria e tempo real

- Coleções `project_bootstraps`, `project_bootstrap_tech_groups` e `project_bootstrap_technologies`; conversa em
  `agentic_events` (chave = id do bootstrap).
- Auditoria (`BootstrapProjeto`, `TecnologiaBootstrap`, `GrupoTecnologiaBootstrap`) em início, conferência, conclusão,
  deploy com falha, nova tentativa, mensagem (só o tamanho, `mensagemCaracteres`: o texto pode trazer uma credencial),
  cancelamento e no catálogo. O `.env` nunca vai para log, evento ou auditoria.
- Pusher em `private-app`: `project-bootstrap-updated` (`{ id }`) e `project-bootstrap-catalog-updated`
  (`{ kind: "group" | "technology" | "seed" }`).

## Ferramentas do Agente Opex (grupo `project-bootstrap`)

Catálogo (`list_bootstrap_tech_catalog`, criar/editar grupo e tecnologia; remover é `destructive`), skills do agente
(`get_bootstrap_agent_skills`, `set_bootstrap_agent_skills`) e consulta (`list_project_bootstraps`,
`get_project_bootstrap`). **Não** há ferramenta para iniciar, retomar ou cancelar um bootstrap. O conteúdo das skills fica
com as ferramentas de recursos do OpenCode.
