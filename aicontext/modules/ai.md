# Módulo: Provedores de IA (`/integracoes/ia`)

Chamadas a IA do app passam por uma camada única sobre a **Vercel AI SDK** (`ai` v7). Os provedores
são integrações configuradas na tela (sem `.env`) e cada feature que usa IA escolhe provedor, modelo
e opções na própria aba da página "Provedores de IA".

## Provedores

| Provedor | Integração | Pacote | Configuração |
|---|---|---|---|
| OpenCode | `ai_opencode` | `ai-sdk-provider-opencode-sdk` (5.x, OpenCode **2.x**) | URL do `opencode serve` (origem), diretório das sessões (opcional), senha (segredo) |
| Gemini | `ai_gemini` | `@ai-sdk/google` | API key do Google AI Studio (segredo) |
| JEV | `ai_jev` | — (HTTP TypeSafe) | API key da TypeSafe (segredo); URL fixa `https://api.typesafe.ai` |

- Metadados puros (tela e servidor): `src/lib/ai/providers.ts` (`AI_PROVIDERS`, `AiModelDto`...).
- **OpenCode** (`src/lib/ai/opencode.ts`): autenticação Basic `opencode:<senha>` em toda rota.
  Catálogo pelas rotas HTTP do servidor — `GET /api/info` (exige versão 2.x), `GET /api/model`
  (modelos habilitados, id `provedor/modelo`, variantes, gratuitos = custo 0) e `GET /api/agent`
  (agentes primários e visíveis). Com diretório configurado, as consultas usam
  `?location[directory]=` — a pasta precisa existir na máquina do OpenCode (senão o servidor
  responde 404, com mensagem acionável). Em Docker, a URL precisa ser o IP do host, não `127.0.0.1`.
- **Gemini** (`src/lib/ai/gemini.ts`): `GET v1beta/models` (header `x-goog-api-key`), só modelos de
  texto (`generateContent`, sem embedding/imagem/áudio); modelos com `thinking` aceitam os níveis
  `low`/`medium`/`high`.
- **JEV** (`src/lib/ai/jev.ts`): modelo TypeSafe "System One" de **decisão estruturada** (não gera
  texto). O núcleo cobre só a integração: `GET v1/models` (header `Authorization: Bearer <apiKey>`)
  lista os modelos/aliases (`jev-latest`, `jev-preview`); a URL (`https://api.typesafe.ai`) é fixa no
  código. Como não gera texto, o JEV **não** é oferecido às features de texto (flag
  `supportsTextGeneration` em `AI_PROVIDERS`; ver `AI_TEXT_PROVIDER_IDS`); os usos do JEV virão
  depois.
- Catálogo com cache de 2 min por `version` da integração (`src/lib/ai/catalog.ts`); `?refresh=1`
  ignora o cache. Situação do provedor: **configurado** (obrigatórios preenchidos,
  `isIntegrationConfigured`) e **conectado** (configurado + último teste verde ou amarelo).
- Testes de conexão (`src/features/ai/server/testers.ts`): OpenCode = info + modelos + agentes
  (amarelo sem modelos); Gemini = lista de modelos; hub `ai` = testa cada provedor configurado
  (gravando o status de cada um) e resume (amarelo se só parte conecta; erro se nenhum).

## Geração (`src/lib/ai/stream.ts`)

- `streamAi(request)` é o **único ponto** das features: gera em streaming e nunca lança — falhas
  viram um evento `error` final. Eventos: `delta`, `reasoning` (uma vez, ao começar a raciocinar),
  `tool` (`running`/`done`/`error`), `notice`, `done` (tokens, custo em USD do OpenCode, duração) e
  `error`.
- **OpenCode**: cada chamada cria uma sessão nova (`createNewSession`), com agente, variante,
  diretório e título; formulários do agente são cancelados (`formPolicy: "cancel"`); pedido de
  aprovação de ferramenta vira `notice`. Temperatura e máximo de tokens **não** são enviados (o
  OpenCode não aceita). Falha do modelo informada só nos metadados do passo (`finish: "error"`)
  vira `error` com a mensagem do servidor. O provider é descartado (`dispose`) ao fim.
- **Gemini**: temperatura, máximo de tokens e `thinkingConfig.thinkingLevel` (variante).
- Não há saída estruturada garantida pelo OpenCode: features que precisarem de JSON validam com Zod.
- **Exceção — sessões longas**: o desenvolvimento agêntico usa o cliente oficial `@opencode/client`
  (`src/lib/ai/opencode-client.ts` + eventos normalizados em `opencode-events.ts`) porque precisa
  retomar a mesma sessão, trocar agente/modelo entre etapas, responder permissões e perguntas,
  interromper e executar comandos de verificação. Ver `modules/agentic-dev.md`.

## Página `/integracoes/ia`

- `ai` é o hub do catálogo ("Provedores de IA"); `ai_opencode`, `ai_gemini` e `ai_jev` são
  **filhas** (`parent: "ai"`): ficam fora da lista de `/integracoes` e têm rotas próprias
  (`/integracoes/ia` em `app/(app)/integracoes/ia/page.tsx`; `/integracoes/ia/opencode`,
  `/integracoes/ia/gemini` e `/integracoes/ia/jev` em `ia/[provider]/page.tsx`, provedor
  desconhecido = 404; `/integracoes/<id>` redireciona). O voltar da página do provedor leva ao hub.
- Abas (`?aba=`, `AiEditorForm`): **Provedores** (lista com status, "Não configurado", Testar e
  link para a página; mais o card Geral do hub), **Entender tarefas**, **Resumos de tarefas** e
  **Desenvolvimento agêntico** (`modules/agentic-dev.md`; centrais em `/integracoes/ia/centrais/[id]`).
  A aba **Desenvolvimento agêntico** tem abas internas **Agentes** e **Centrais de desenvolvimento**
  (estado local, não vão à URL).
- Página do provedor: editor genérico + card **Modelos disponíveis** (somente leitura, busca
  fuse.js, lista virtualizada, Atualizar ignora o cache; com alterações não salvas, pede para salvar).

## Feature "Entender tarefas"

- Configuração em `ai_feature_settings` (`feature: "understand-task"`), schema Zod
  `understandTaskSettingsSchema` (mesmo na tela e na API): ativa, provedor, modelo, agente
  (OpenCode), variante/raciocínio, temperatura e máximo de tokens (só Gemini), formato (**Seções
  fixas**: Resumo, O que precisa ser feito, Pontos de atenção e riscos, Dúvidas para o solicitante;
  ou **Texto livre**), instruções (prompt de sistema, "Restaurar padrão") e o que enviar
  (comentários, histórico, apontamentos).
- Regras ao salvar (`server/settings.ts`): ativa exige provedor e modelo; o provedor escolhido
  precisa estar **conectado** para ativar (409); modelo, variante e agente são conferidos no
  catálogo do provedor (400). Campos que não se aplicam ao provedor são gravados vazios. Auditoria
  `FeatureIA` e evento `ai-feature-updated` em `private-app` (o botão da tarefa recarrega).
- Na tela, só provedores conectados podem ser escolhidos; trocar o provedor limpa modelo, variante e
  agente. Com OpenCode aparece o aviso de que o texto da tarefa vem de terceiros (prefira agente só
  de leitura; o agente é configurável).
- **Entrada** (`src/features/ai/understand-task.ts`, puro): a tarefa é buscada no servidor
  (`getTask`) e vira Markdown — código, tipo, prioridade, projeto, data de criação, issue do GitHub,
  horas apontadas, descrição, especificação técnica e, conforme a configuração, comentários,
  histórico e apontamentos. Textos longos são cortados.
- **Execução**: `POST /api/tasks/[id]/understand` — feature indisponível (409) ou tarefa
  inexistente (404) respondem JSON; senão NDJSON (`start`, eventos do `streamAi`, `done`/`error`).
  Fechar a conexão cancela a geração. O texto gerado **não é salvo**; cada geração grava uma linha
  em `ai_usage_logs` (tokens, custo, duração, erro; TTL 90 dias) e logs no debug do hub `ai`.
- **Modal** (`UnderstandTaskDialog`): inicia ao abrir; Markdown progressivo com cursor animado,
  "Pensando…", ferramentas do agente, avisos, erro (preservando o texto parcial); **Parar**,
  **Gerar novamente**, **Copiar**; rodapé com tokens, custo e duração. Estado em
  `understand-stream.ts` (redutor puro) + `useUnderstandTaskStream`.

## Feature "Resumos de tarefas"

- Configuração em `ai_feature_settings` (`feature: "task-summary"`), schema Zod
  `taskSummarySettingsSchema` (mesmo na tela e na API): ativa, provedor, modelo, agente (OpenCode),
  variante/raciocínio, temperatura e máximo de tokens (só Gemini), **tamanho máximo** do resumo
  (40–400 caracteres, padrão 140) e instruções (prompt de sistema, "Restaurar padrão").
- Regras ao salvar iguais às de "Entender tarefas" (ativa exige provedor+modelo conectado; modelo,
  variante e agente conferidos no catálogo; campos que não se aplicam ao provedor viram vazios).
  **Ao ativar** (`enabled` de falso→verdadeiro), dispara em segundo plano a varredura das tarefas
  não concluídas sem resumo (`runTaskSummaryBackfill` via `runAfterResponse`). Auditoria `FeatureIA`
  e evento `ai-feature-updated` em `private-app`.
- **Resumo** = 1 linha **adicional**, que **não substitui** a descrição: aparece no card do kanban
  (linha sob o título), na coluna **Título** da tabela e, na página da tarefa, em um **card próprio
  acima do card de conteúdo** (`TaskSummaryCard`, fonte discreta). A aba **Descrição** segue
  mostrando a descrição completa em Markdown.
- **Entrada** (`src/features/ai/task-summary.ts`, puro): a tarefa vira Markdown (código, tipo,
  prioridade, projeto, título e descrição cortada). `toSummaryLine` normaliza a saída do modelo
  (primeira linha com conteúdo, sem Markdown, espaços colapsados) e corta no tamanho máximo em
  **limite de palavra** quando houver espaço (evita terminar no meio, ex.: "integraç…").
- **Desatualização**: o `DevTask` guarda `summarySourceHash` (hash de título+descrição no momento
  da geração) e `summary`; `needsSummary` marca como pendente quando falta resumo ou o hash
  divergiu. Editar título/descrição no app regenera em segundo plano (`PATCH /api/tasks/[id]`); a
  rotina cobre as edições vindas da sincronização do GitHub.
- **Rotina**: `ai-task-summary` (Cron interno, a cada 2 min) gera, **sequencialmente**, os resumos
  pendentes das tarefas não arquivadas que não estão em nenhuma **coluna de conclusão** (vínculo do
  projeto; ver `modules/github.md`). Só age com a feature disponível; sem pendências, é no-op. A
  criação pela tela dispara a geração na hora; a criação pelo GitHub é coberta pela rotina.
- **Execução**: `POST /api/tasks/[id]/summary` — feature indisponível (409) ou tarefa inexistente
  (404) respondem JSON; senão NDJSON (`start`, eventos do `streamAi`, `done`/`error`). O resumo é
  **gravado no `done`** com `timestamps: false` (não mexe no `updatedAt` da tarefa, para não a
  marcar como editada nem fazer a sincronização do GitHub empurrá-la para a issue) e publica
  `tasks-updated`; cada geração grava linha em `ai_usage_logs` (`feature: "task-summary"`). Fechar
  a conexão cancela a geração.
- **Modal** (`TaskSummaryDialog`): inicia ao abrir; texto progressivo com cursor animado,
  atividade do agente e uso; **Parar**, **Gerar novamente**, **Copiar**. O botão **Gerar resumo**
  fica no cabeçalho da tarefa (desabilitado com o motivo quando indisponível). Reusa o redutor de
  `understand-stream.ts`.

## APIs

| Rota | Descrição |
|---|---|
| `GET /api/ai/providers/[provider]/models` | Modelos do provedor (`?refresh=1`); 502 com a mensagem do provedor |
| `GET /api/ai/agents` | Agentes primários do OpenCode |
| `GET/PUT /api/ai/features/understand-task` | Configuração de "Entender tarefas" + disponibilidade |
| `GET/PUT /api/ai/features/task-summary` | Configuração de "Resumos de tarefas" + disponibilidade |
| `POST /api/tasks/[id]/understand` | Gera a explicação (NDJSON) |
| `POST /api/tasks/[id]/summary` | Gera (ou regenera) o resumo de 1 linha (NDJSON) |

## Testes

`__tests__/lib/ai/` (catálogo dos provedores e `streamAi`), `__tests__/features/ai/` (entrada e
estado do modal, entrada de rascunhos, `prepareUnderstandTask`, configuração, rota NDJSON,
`UnderstandTaskDialog` e `UnderstandTaskButton`; resumos: `task-summary` puro,
`task-summary-settings`, `task-summary-job` e `task-summary-route`; `task-detail-sections` e
`task-detail-tabs` cobrem as abas da página da tarefa — a Descrição (sem título próprio) não sendo
substituída pelo resumo, a especificação técnica em aba própria e a troca de abas sem quebrar os
hooks (regressão React #310) — e `task-summary-card` o card do resumo sem o rótulo "Resumo (IA)").
