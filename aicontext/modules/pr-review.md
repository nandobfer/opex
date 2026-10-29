# Módulo: Agente Revisor (`/agente-revisor` + `/integracoes/ia?aba=revisao-pr`)

As revisões ficam na página **Agente Revisor** (barra lateral) e a configuração na aba **Agente
Revisor** de Integrações › Provedores de IA (id da aba `revisao-pr` mantido para não quebrar links).
Nomes internos (`pr-review`, `PrReview`, `pr_reviews`, auditoria `RevisaoPR`) não mudaram.

Agente OpenCode executa a skill configurada (padrão `code-review`) nos PRs dos repositórios locais
vinculados aos **Projetos** com central ativa. Implementação em `src/features/pr-review/`, coleção
`pr_reviews`; runner `opencode-run.ts`, histórico e stream compartilhados com `agentic_events`.

## Configuração

`ai_feature_settings`, feature `pr-review`; schema `prReviewSettingsSchema` compartilhado com o
formulário. Desativada por padrão. Ativar exige modelo OpenCode válido; agente/variante validados.
Critério Todos / Exceto os meus / Revisor solicitado, rascunhos e PRs das mesas configuráveis.
Login do token GitHub via `/user` (cache 10 min); sem login, critérios pessoais não incluem PRs.
Skill, instruções, timeout (5–240 min), simultâneas (1–5), replanejamento e limite opcional por PR.
Credenciais permanecem nas integrações existentes, sem nova variável de ambiente.

## Fluxo

- Cron `agentic-pr-watch`: varrer candidatos → acompanhar PRs das mesas → iniciar revisões.
- Índice único `repo + number + headSha`; push move revisão ainda na fila para o commit atual,
  sem acumular tentativas. Estados: queued/running/done/failed/interrupted. Reinício interrompe
  execução órfã; usuário pode revisar novamente. Fila própria, sem ocupar vagas das mesas.
- Sessão nova no OpenCode; prompt exige worktree temporário destacado no SHA, skill, revisão sem
  modificar arquivos, commits, push ou merge. Não roda testes/build/lint/typecheck nem instala
  dependências; usa leitura e checks do CI como evidência.
- Publica revisão no GitHub com marcador `<!-- opex:pr-review sha=… -->`. Em PR próprio publica
  comentário (GitHub não permite aprovar/pedir mudanças no próprio PR). Com bloqueios num PR de
  mesa, menciona `@opex`; resposta JSON contém verdict/blocking/summary e relatório em Markdown.
- Permissões são aprovadas automaticamente uma vez, com aviso, e perguntas canceladas; por isso
  configure agente e skill de revisão adequados. Prompt pede retorno ao diretório original e
  remoção do worktree. Sessão é excluída e pendências retomadas em `agentic-queue-pump`.
- Consumo `pr-review`, auditoria `RevisaoPR`, eventos `pr-review-updated` em `private-app`.

## Mesas e tela

Feedback automático só replaneja conforme a configuração e `pr.autoReviewReplans`; feedback humano
continua independente. Merge automático espera revisão do head atual na fila/em execução e não
prossegue quando a revisão pede mudanças. Falha/interrupção ou ausência de publicação confirmada
no GitHub também mantêm o bloqueio até revisão bem-sucedida. Revisões não mudam descrições de tarefas.

### Aba "Agente Revisor" (`/integracoes/ia?aba=revisao-pr`, `PrReviewTab`)

Só configuração. Cards: ativação (com o link **Ver revisões** para a página), provedor/modelo
(OpenCode fixo), **Quais PRs revisar automaticamente** (critério, rascunhos, PRs das mesas; o login do
GitHub vem de `GET /api/pr-reviews?limit=1`), **Mesas de trabalho** (replanejar + limite opcional) e
**Execução** (skill, simultâneas, tempo máximo, instruções).

### Página "Agente Revisor" (`/agente-revisor`, `PrReviewsPage`)

Item **Agente Revisor** da barra lateral (seção Início, logo após Central de desenvolvimento).

- Cabeçalho com **Configurar** (vai para a aba) e **Revisar PR** (pela URL; desabilitado com o motivo
  quando a feature está indisponível), e os repositórios acompanhados (com o projeto).
- Filtros no `ListFilters` padrão, na URL (`useUrlFilters`, `filters.ts`), aplicados **pela API**
  (`server/list-query.ts`): **Busca** (`q`: repositório, título, autor; `12`/`#12` também casa o
  número do PR), **Situação**, **Veredito**, **Repositório**, **Origem** (automática/manual; revisões
  sem origem contam como automáticas) e **Período** (criação da revisão, dia inteiro no fuso do
  navegador; `from`/`to` fora de `yyyy-MM-dd` válido são ignorados). Padrão: sem recorte (todo o histórico).
- Lista mais recentes primeiro, 20 por página com rolagem infinita (ou "Carregar mais"): situação,
  veredito, commit, origem, custo, duração, erro; **Ver** (diálogo com a **saída do agente ao vivo** e
  o **relatório** em Markdown), **Revisar de novo** (commit atual do PR) e **Parar** (confirmação).
- Estados: carregando, vazio (sem revisões ou "Nenhuma revisão com estes filtros" + Limpar filtros)
  e erro com tentar novamente.

Hooks usam TanStack Query e Pusher (`pr-review-updated { id }` em `private-app` recarrega a lista e o
detalhe), incluindo invalidação após reconexão. A ferramenta `list_pr_reviews` do Agente Opex traz as
50 mais recentes.

## APIs autenticadas

- `GET/PUT /api/ai/features/pr-review`: configuração e disponibilidade.
- `GET /api/pr-reviews`: revisões paginadas (`page`, `limit` 1–50, padrão 20; filtros `q`, `states`,
  `verdicts`, `repos`, `triggers` em CSV, `from`/`to` ISO — `prReviewListQuerySchema`; inválido → 400),
  `total`/`totalPages`, login do GitHub e repositórios.
- `POST /api/pr-reviews`: solicitação `{ url }`.
- `GET /api/pr-reviews/[id]`: relatório/detalhe.
- `POST /api/pr-reviews/[id]/actions/[rerun|stop]`: ações.
- `GET /api/pr-reviews/[id]/events`: NDJSON.

## Testes

Vitest em `__tests__/features/pr-review/` (`filters` e `list-query`: filtros da URL, query da API e
filtro do Mongo; `prs-page`: página, ações e estados; `logic`, `queue`, `settings`, `service`, `gate`) e casos integrados em
`__tests__/features/agentic/pr-watch.test.ts`. OpenCode e GitHub sempre mockados.
