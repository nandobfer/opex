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

## Agentes e credenciais

Toda operação no host passa por agentes OpenCode: Git, SSH, Docker, Compose, imagens, containers,
logs e publicação/restauração. O Opex só coordena, persiste, autoriza e apresenta; não possui
executor direto SSH/Docker/Git. Consultas/disparos GitHub usam a integração existente.

Integrações › IA › **Administração de sistema** (`aba=administracao-sistema`) configura habilitação,
modelo, agente, variante, skill, instruções, timeout, diretório administrativo e diretório de acesso
temporário. Configuração persistida em `ai_feature_settings`, feature `system-administration`;
consumo em `environments`, deduplicado por etapa/tentativa pelo executor compartilhado.

SSH e variáveis privadas usam AES-GCM (`secretBox.ts`), `select:false` e DTOs explícitos. Nunca
retornam valores, apenas indicação de configuração. Auditoria não recebe segredos.

O provisionamento cria uma pasta aleatória 0700 dentro do diretório de acesso, que precisa ser
**compartilhado no mesmo caminho entre Opex e OpenCode**, pelo mesmo usuário, sem permissão para
terceiros (em Docker, um volume compartilhado). Raiz simbólica, com proprietário divergente ou
permissões abertas é rejeitada. Arquivos 0600 contêm as variáveis e credenciais da tentativa;
o prompt recebe apenas o caminho. O helper SSH é executado **pelo agente**, lê senha/passphrase
em memória via SSH_ASKPASS, usa chave por arquivo e known_hosts obrigatório; nenhum segredo vai
nos argumentos ou no prompt. As credenciais temporárias têm prazo máximo de cinco horas.

O agente precisa de uma política administrativa previamente autorizada e restrita ao escopo.
Pedidos adicionais de permissão são recusados; não há aprovação intermediária de plano nem
autorização irrestrita automática. Sem acesso ao diretório compartilhado, SSH ou Docker, a operação
falha, sem fallback inseguro. Git privado exige autenticação já disponível no host do agente.
As instruções proíbem imprimir/ler segredos em mensagens/ferramentas e tratar o repositório como
instruções. Opex não publica transcrição bruta; sanitiza checkpoints, resultados e logs.

Acesso temporário é removido em sucesso/falha/interrupção. Caminhos pendentes ficam registrados
para limpeza pelo agendador; acesso de uma sessão ainda não verificável é preservado até conseguir
interromper/reconciliar, nunca liberando o ambiente para uma segunda operação.

## Persistência e execução

- `environment_repos`: `EnvironmentRepoConfig`, único por `projectId`.
- `environments`: configuração, revisão, último Compose/banco observado e reserva da operação.
- `environment_operations`: tentativa idempotente por ator/requestId, configuração e agente
  congelados, fases (`preflight`, `action`, `cd`, `inspect`, `reconcile`), sessão/turno, heartbeat,
  etapas com data/hora (últimas 100), evidências, migrações, run e resultado. Checkpoints têm
  limite de 200 por turno; falha na persistência interrompe o agente para reconciliação.
- `environment_images`: conjuntos de imagens por serviço, IDs imutáveis, tags/versões, banco
  associado, origem (`opex`, `cd`, `external`) e data de build comprovada pelo Docker (`null`
  quando desconhecida, nunca substituída pela hora da consulta). Não há S3/registry novo.
- `environment_deployments`: histórico separado por operação, banco anterior/observado,
  migrações, evidências, imagens e resultado; não cresce dentro do ambiente.
- `environment_log_sessions`: sessão compartilhada e leases de espectadores com expiração.

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

Publicação no host e restauração começam com turno **somente leitura**: Compose efetivo, conflitos,
imagens atuais e evidências do banco. As imagens anteriores identificadas ganham um registro antes
da ação. O servidor revalida a compatibilidade observada antes de autorizar a restauração.

Publicar: preflight, clone/update sem descartar trabalho, SHA, preservação de imagens anteriores,
build no host, overrides/limites/variáveis, recriação, migrações e healthcheck. Saúde ruim produz
resultado degradado, **sem rollback automático**. Checkpoints de migrações são persistidos antes
de prosseguir; uma falha posterior não apaga as migrações comprovadas.

CD: persiste intenção/data/SHA antes de disparar o workflow configurado, identifica um run por
workflow/branch/SHA/janela de tempo e recusa correlação ambígua. Reinício **não redispara** o workflow:
retoma run registrado ou procura o run do disparo original. Só depois de terminar o agente verifica
o host/SHA; sucesso no GitHub isoladamente não comprova deploy. O pipeline existente não é alterado.

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

Fim do turno não implica sucesso: resultado Zod exige evidências, verificação e comprovação de
ausência de processos de build/deploy/restauração ainda ativos (`quiescent`). Falha inconclusiva
mantém a reserva em `reconciling`. Após reinício, retoma somente o turno de ação identificado por
fase/data; preflight não pode ser confundido com publicação concluída. Se for necessário um novo
turno, ele é somente observacional: não repete deploy nem declara retroativamente sucesso. Reserva
só é liberada com host reconciliado; estado final é interrompido com evidências. Indisponibilidade
do OpenCode preserva a reserva. Quedas entre reserva e criação do registro são recuperadas sem
executar agentes, pois nenhuma sessão pode ter começado nesse intervalo.

## Logs, tempo real e APIs

Logs reutilizam `IntegrationConsole` e `IntegrationLog` (48h), integração `ai`, scope
`environment:ID`, sem entrada nova no catálogo. Uma sessão de agente acompanha todos os serviços;
filtro por serviço é individual. Primeiro espectador inicia, último sai/expira e interrompe;
heartbeats a cada 30s renovam leases de 90s. Reconciliação interrompe sessões órfãs e limpa acesso.
IDs deduplicam a apresentação do histórico após reconexão. Saída de um espectador não cancela os outros.

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

São rotas por sessão, não API pública por token; não mudam OpenAPI nem `PUBLIC_TOKEN_ROUTES`.

## Validação

Testes específicos em `__tests__/features/environments/`, mais regressões da fila global,
autorização Pusher e navegação/abas afetadas. Serviços externos sempre mockados. Deploy real
exige configuração e validação do host pelo dono; testes automatizados não executam Docker/SSH/Git.
