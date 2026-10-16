# Módulo: Revisão de PR (`/integracoes/ia?aba=revisao-pr`)

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

A aba apresenta configurações, repositórios acompanhados e 50 revisões recentes, custo/duração,
diálogo com saída ao vivo e relatório, Revisar PR pela URL, Revisar de novo e Parar com confirmação.
Hooks usam TanStack Query e Pusher, incluindo invalidação após reconexão.

## APIs autenticadas

- `GET/PUT /api/ai/features/pr-review`: configuração e disponibilidade.
- `GET/POST /api/pr-reviews`: histórico/login/repos e solicitação `{ url }`.
- `GET /api/pr-reviews/[id]`: relatório/detalhe.
- `POST /api/pr-reviews/[id]/actions/[rerun|stop]`: ações.
- `GET /api/pr-reviews/[id]/events`: NDJSON.

## Testes

Vitest em `__tests__/features/pr-review/` e casos integrados em
`__tests__/features/agentic/pr-watch.test.ts`. OpenCode e GitHub sempre mockados.
