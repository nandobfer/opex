# Módulo: Provedores de IA (`/integracoes/ia`)

Chamadas a IA do app passam por uma camada única sobre a **Vercel AI SDK** (`ai` v7). Os provedores
são integrações configuradas na tela (sem `.env`) e cada feature que usa IA escolhe provedor, modelo
e opções na própria aba da página "Provedores de IA".

## Provedores

| Provedor | Integração | Pacote | Configuração |
|---|---|---|---|
| OpenCode | `ai_opencode` | `ai-sdk-provider-opencode-sdk` (5.x, OpenCode **2.x**) | URL do `opencode serve` (origem), diretório das sessões (opcional), senha (segredo) |
| Gemini | `ai_gemini` | `@ai-sdk/google` | API key do Google AI Studio (segredo) |
| Anthropic | `ai_anthropic` | `@ai-sdk/anthropic` | API key do Claude Console (segredo) |
| OpenAI | `ai_openai` | `@ai-sdk/openai` (API Responses) | API key da plataforma OpenAI (segredo) |
| DeepSeek | `ai_deepseek` | `@ai-sdk/deepseek` | API key da plataforma DeepSeek (segredo) |
| JEV | `ai_jev` | — (HTTP TypeSafe) | API key da TypeSafe (segredo); URL fixa `https://api.typesafe.ai` |

- Metadados puros (tela e servidor): `src/lib/ai/providers.ts` (`AI_PROVIDERS`, `AiModelDto`...).
- **OpenCode** (`src/lib/ai/opencode.ts`): autenticação Basic `opencode:<senha>` em toda rota.
  Catálogo pelas rotas HTTP do servidor — `GET /api/info` (exige versão 2.x), `GET /api/model`
  (modelos habilitados, id `provedor/modelo`, variantes, gratuitos = custo 0) e `GET /api/agent`
  (agentes primários e visíveis). Com diretório configurado, as consultas usam
  `?location[directory]=` — a pasta precisa existir na máquina do OpenCode (senão o servidor
  responde 404, com mensagem acionável). Em Docker, a URL precisa ser o IP do host, não `127.0.0.1`.
  Campos opcionais de **acesso SSH** (host, porta, usuário, executável, impressão digital do host e o
  segredo chave privada, área de texto) — usados só pela aba Controles (`modules/opencode-resources.md`).
  Campo público opcional **"Arquivo de quota (opencode-quota)"** (`quotaExportPath`): export do plugin
  `opencode-quota` lido pelo painel de quota de `/desenvolvimento` (`modules/opencode-quota.md`).
- **Gemini** (`src/lib/ai/gemini.ts`): `GET v1beta/models` (header `x-goog-api-key`), só modelos de
  texto (`generateContent`, sem embedding/imagem/áudio); modelos com `thinking` aceitam os níveis
  `low`/`medium`/`high`.
- **Anthropic** (`src/lib/ai/anthropic.ts`): `GET v1/models` (headers `x-api-key` e
  `anthropic-version: 2023-06-01`, paginado por `after_id`), do mais novo ao mais antigo. Variantes
  `low`/`medium`/`high` (`AI_REASONING_LEVELS`) em todos os modelos, exceto Claude 3.x anteriores ao
  3.7 (sem raciocínio).
- **OpenAI** (`src/lib/ai/openai.ts`): `GET v1/models` (`Bearer`), só modelos de texto (`gpt-*`,
  `o*`, `chatgpt-*`, sem embedding, áudio, imagem, realtime, transcrição, moderação, busca e
  `instruct`), mais novos primeiro. Variantes `low`/`medium`/`high` na série o e no GPT-5 em diante
  (exceto `-chat`).
- **DeepSeek** (`src/lib/ai/deepseek.ts`): `GET /models` (`Bearer`). Variantes `low`/`medium`/`high`
  em todos, exceto o alias `deepseek-chat` (sem raciocínio).
- Configuração dos três só pela tela (API key em campo privado cifrado, sem `env`).
- **JEV** (`src/lib/ai/jev.ts`): modelo TypeSafe "System One" de **decisão estruturada** (não gera
  texto). Além do catálogo (`GET v1/models`, header `Authorization: Bearer <apiKey>`), expõe
  `askJevSystemOne` (`POST v1/systemone`): envia `state` + `questions` tipadas (`choice`, `score`,
  `noul`) e devolve `answers` tipadas. É usado por "Tags de tarefas" (um `noul` por tag) e por
  "Estimar prazos" (um `score` fracionário de **tempo de execução**, interpolado para horas). Como
  não gera texto, o JEV continua
  **fora** das features de texto (flag `supportsTextGeneration`; ver `AI_TEXT_PROVIDER_IDS`).
- **Uso do JEV**: `askJevSystemOne` exige contexto `tracking` (feature + referência opcional) e
  grava uma única linha em `ai_usage_logs` antes do processamento de negócio, inclusive para tags
  avulsas do portal. Registra o modelo efetivo, entrada/saída, total, duração e resultado da
  requisição; falhas de negócio posteriores não apagam o uso nem geram outra linha JEV. Falha de
  transporte sem métricas mantém tokens/custo `null`, nunca zero. Falha de telemetria é logada com
  Pino sem interromper a IA. Auditoria `UsoIA`, seguida do evento `jev-usage-updated` em `private-app`.
- **Custo JEV** (`src/lib/ai/jev-usage.ts`): `inputTokens × 0,042 / 1.000.000` USD (tarifa oficial
  de entrada; saída gratuita). Grava a tarifa aplicada (`inputPricePerMillionUsd`) e origem `api`;
  não arredonda por chamada nem recalcula custos antigos. Sem entrada conhecida, custo `null`;
  sem ambos os contadores, total `null`. Retenção continua em **90 dias**; a migração
  `ensure-ai-usage-indexes` garante índices, incluindo `provider + createdAt`, sem depender de autoIndex.
- Catálogo com cache de 2 min por `version` da integração (`src/lib/ai/catalog.ts`); `?refresh=1`
  ignora o cache. Situação do provedor: **configurado** (obrigatórios preenchidos,
  `isIntegrationConfigured`) e **conectado** (configurado + último teste verde ou amarelo).
- **Conexão confirmada na hora** (`confirmAiProviderConnection`, `src/lib/ai/connection.ts`,
  OPE-91): a disponibilidade das features (`availability`/`availabilityOf*`, `agenticAvailability`)
  e a validação ao salvar (`assertCatalog`, `assertAgentConfigs`) não recusam só pelo status
  gravado. Gravado conectado = segue sem rede; gravado desconectado (ex.: a verificação periódica
  falhou de passagem) = testa o provedor agora (OpenCode: `GET /api/info`; demais: lista de modelos
  sem cache), com limite de 8 s. Respondeu: a ação segue e o teste completo regrava o status em
  segundo plano (um por vez por provedor). Falhou: o motivo traz a falha real (`… não está conectado
  (ECONNREFUSED): …`). Chamadas simultâneas compartilham o teste em andamento (por provedor e
  limite); depois, o sucesso vale 15 s e a falha só 1,5 s (a conexão que voltou vale logo).
- Testes de conexão (`src/features/ai/server/testers.ts`): OpenCode = info + modelos + agentes
  (amarelo sem modelos); Gemini, Anthropic, OpenAI e DeepSeek = lista de modelos (amarelo sem
  modelos de texto); hub `ai` = testa cada provedor configurado
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
- **Anthropic, OpenAI e DeepSeek**: temperatura e máximo de tokens (`supportsSampling`) e a variante
  vira a opção `reasoning` da AI SDK, que a traduz para cada provedor (thinking/effort da Anthropic,
  `reasoningEffort` da OpenAI, thinking da DeepSeek). Variante fora de `AI_REASONING_LEVELS` é
  ignorada. Na Anthropic com raciocínio ligado a temperatura não é enviada (a API recusa); nos
  modelos de raciocínio da OpenAI a AI SDK descarta o que não se aplica. Essas APIs não informam
  custo: `costUsd` fica `null` ("—").
- `streamAi` com o JEV termina em `error` (o JEV não gera texto).
- **JEV**: não passa pelo `streamAi` (não gera texto); quem o usa chama `askJevSystemOne` direto.
- Não há saída estruturada garantida pelo OpenCode: features que precisarem de JSON validam com Zod.
- **Exceção — sessões longas**: o desenvolvimento agêntico usa o cliente oficial `@opencode/client`
  (`src/lib/ai/opencode-client.ts` + eventos normalizados em `opencode-events.ts`) porque precisa
  retomar a mesma sessão, trocar agente/modelo entre etapas, responder permissões e perguntas,
  interromper e executar comandos de verificação. Ver `modules/agentic-dev.md`. O **refinamento de
  tarefas** (`modules/refinement.md`) usa o mesmo cliente e o mesmo **runner genérico de turno**
  (`src/lib/ai/opencode-run.ts`, compartilhado com a mesa).
- **Medição de consumo** (`src/lib/ai/consumption.ts`, coleção `ai_consumption_logs`): uma linha por
  etapa/geração, prospectiva e **separada** dos acumuladores das features (`ai_usage_logs`), das
  mesas (`agentic_workbenches.usage`/`time_logs`) e dos refinamentos (`task_refinements.usage`) —
  nunca soma duas vezes o mesmo gasto. `streamAi` registra no `done` quando recebe
  `consumption: { origin, subject }`; o runner genérico de sessão (`opencode-run.ts`) registra a cada
  `session.step.ended`, com `dedupKey` estável (`session:{origem}:{execução}:{stepId}`) — reconexão
  não duplica. Métricas ausentes ficam `null`. Falha de telemetria não interrompe a geração. Publica
  `ai-consumption-updated` em `private-app`. A medição começou com o painel: o histórico anterior não
  é somado (decisão "precisão daqui em diante").

## Página `/integracoes/ia`

- `ai` é o hub do catálogo ("Provedores de IA"); `ai_opencode`, `ai_gemini`, `ai_anthropic`,
  `ai_openai`, `ai_deepseek` e `ai_jev` são **filhas** (`parent: "ai"`): ficam fora da lista de
  `/integracoes` e têm rotas próprias (`/integracoes/ia` em `app/(app)/integracoes/ia/page.tsx`;
  `/integracoes/ia/<provedor>` em `ia/[provider]/page.tsx`, provedor desconhecido = 404; `/integracoes/<id>` redireciona). O voltar da página do provedor leva ao hub.
- Abas (`?aba=`, `AiEditorForm`): **Provedores** (lista com status, "Não configurado", Testar e
  link para a página; mais o card Geral do hub), **Entender tarefas**, **Resumos de tarefas**,
  **Orçamentos**, **Estimar prazos**, **Refinar tarefa** e **Desenvolvimento agêntico**
  (`modules/agentic-dev.md`; centrais em `/integracoes/ia/centrais/[id]`).
  A aba **Desenvolvimento agêntico** tem abas internas **Agentes** (agentes padrão e as **colunas
  globais** de fila e movimentação herdadas pelas centrais — OPE-79) e **Centrais de desenvolvimento**
  (subaba endereçável por `abaAgentic`). Há também a aba **Agente Revisor** (id `revisao-pr`), só com a
  configuração (as revisões ficam na página `/agente-revisor`) — ver `modules/pr-review.md` — e a aba **Agente Opex** (`agente-opex`):
  configuração do assistente por chat com ferramentas do app (provedores Gemini, Anthropic, OpenAI e
  DeepSeek) — ver `modules/opex-agent.md` —, a aba **Agente Adversário** (`agente-adversario`,
  ícone `Swords`): revisor da implementação da mesa com contexto limpo — ver
  `modules/adversarial-agent.md` —, a aba **Agente Mentor** (`agente-mentor`, ícone `GraduationCap`):
  transforma lições das mesas em memórias do Agente Adversário — ver `modules/adversarial-agent.md`,
  "Agente Mentor" — e a aba **Resumo de memórias** (`resumo-memorias`, ver abaixo).
- Página do provedor (`AiProviderEditorForm`, `?aba=`): abas **Configuração** (campos, segredos e
  ações de salvar), **Controles** (só OpenCode: serviço, logs e backups — `modules/opencode-resources.md`),
  **Modelos** (card Modelos disponíveis: somente leitura, busca fuse.js, lista
  virtualizada, Atualizar ignora o cache; com alterações não salvas, pede para salvar), **Contas**
  (só OpenCode; seção abaixo), **Skills**, **Agentes**, **Comandos**, **Plugins** e **MCPs** (só
  OpenCode — `modules/opencode-resources.md`) e **Consumo** (OpenCode e JEV; Gemini, Anthropic, OpenAI e DeepSeek não
  têm essa aba). Trocar de aba com alterações pede descarte.
- **Seletor de provedor** das features de texto (`ProviderModelCard`, `OptionTabs` que quebra linha):
  OpenCode, Gemini, Anthropic, OpenAI e DeepSeek (mais o JEV em Tags e Estimar prazos); só os
  conectados podem ser escolhidos. Refinar tarefa, Agente Revisor e Desenvolvimento agêntico são
  exclusivos do OpenCode.
- **Campos de modelo compartilhados** (`src/features/ai/components/ModelFields.tsx`):
  `ModelPickerField` (busca do modelo com `ModelOption` — nome, id e selo "grátis" —, modelo salvo
  mostrado mesmo fora da lista e erro ao listar) e `VariantSelectField` ("Padrão do modelo" ou uma
  variante). Usados por `ProviderModelCard`, `OpexModelCard` (Agente Opex) e `MentorModelFields`
  (Agente Mentor): mudança no seletor de modelo se faz só ali.
- Em `/integracoes/ia/jev`, o card **Consumo do JEV** mostra tokens totais, entrada/saída conhecidos,
  custo acumulado USD (4–9 casas decimais), chamadas e falhas de requisição. Abaixo dos cards há uma
  **tabela por recurso** (feature de IA que consumiu o JEV: "Tags de tarefas", "Estimar prazos"…)
  com chamadas, entrada, saída, total e custo, mais a linha **Total** — as colunas seguem a tabela do
  OpenCode (`UsageBreakdownTable`), com métricas ausentes como `—`. A linha Total usa os mesmos
  totais do servidor, então não diverge dos cards quando um recurso não informa a métrica. Filtro na URL
  (`usageFrom`/`usageTo`) com `PresetDateRangeFilter`: padrão **Último mês** (um mês atrás até hoje),
  atalhos Hoje/Última semana/Último mês e intervalo personalizado. As datas são convertidas do
  fuso do navegador para ISO, incluindo o dia final inteiro. Limpar consulta todos os logs retidos.
  Agregação no servidor, cache TanStack Query e atualização Pusher (inclusive ao reassinar após
  reconexão); ação Atualizar disponível sem tempo real. Métricas desconhecidas são sinalizadas,
  somas parciais não são apresentadas como medição completa. A tela informa a retenção de 90 dias.
- Em `/integracoes/ia/opencode`, a aba **Consumo** mostra o card **Consumo do OpenCode**: uma
  **tabela por origem** (cada feature de IA, refinamento e mesa de desenvolvimento) com chamadas,
  tokens de entrada/saída/total e custo em USD, mais a linha **Total**. Mesmo filtro de período do
  JEV (`usageFrom`/`usageTo`, padrão Último mês). Métricas ausentes aparecem como `—` (nunca zero).
  O painel informa desde quando há medição e que o uso anterior não é somado (ver "Medição de
  consumo").
- **Reconstrução histórica JEV**: lote `jev-historical-2026-10-11-235088`, corte
  `2026-10-11T02:46:58.230Z`: 149 logs sem métricas (141 tags + 8 estimativas) receberam rateio
  uniforme de **235.088 tokens totais** e **US$ 0,0067** informados pelo dono a partir da plataforma.
  Resíduos em tokens inteiros/nano-USD distribuídos por ordem de `createdAt` e `_id`. Entrada/saída
  e tarifa continuam desconhecidos; custo histórico não é recalculado pela tarifa atual. Origem
  `historical-allocation`, `reconciliationBatch` e `reconciledAt` identificam o lote. Datas, feature,
  modelo e referências originais são preservados. A tela avisa que esse histórico e seus recortes
  temporais são **aproximados** e podem absorver chamadas antigas não logadas. Backup dos documentos
  originais em `ai_usage_log_reconciliations`, auditoria `UsoIA/IMPORTAR`; atualização condicionada
  a métricas/lote ausentes permite retomada sem sobrescrever métricas reais nem repetir o rateio.

## Contas dos providers do OpenCode (aba Contas, OPE-90)

Equivale ao TUI (Providers → provider → adicionar/selecionar conta), pelo `@opencode/client` 2.x
(`integration.*` e `credential.*`). Código em `src/features/opencode-accounts/`.

- **Lista** (`OpencodeAccountsCard`): uma linha por integração do OpenCode (`integration.list` no
  diretório configurado + `credential.list` + `provider.list`, juntados por `mergeAuthProviders`):
  conectados primeiro e depois por nome; a conta em uso aparece no resumo da linha. "Só conectados"
  vem ligado; a busca (fuse.js) procura em **todos** os providers (é assim que se conecta um novo).
  Acima de 50 linhas, lista virtualizada. Recarrega ao focar a janela, por **Atualizar** e pelo evento
  `opencode-accounts-updated` (`private-app`, payload `{ integrationId }`); mudanças feitas direto no
  TUI não geram evento. Com alterações não salvas na Configuração, pede para salvar antes.
- **Linha expandida**: contas com **Em uso**, **Usar esta conta** (otimista, reversão com toast),
  **Renomear** (em linha; Enter salva, Esc cancela) e **Remover** (confirmação; remover a conta em uso
  avisa que o provider fica sem conta). Conexões por variável de ambiente aparecem só como informação;
  `needs_auth` do OpenCode aparece como alerta. Métodos de tipo desconhecido (ex.: `external` do
  Bedrock/Vertex) são ignorados.
- **Adicionar conta** (`AddAccountDialog`): método (pulado quando há só um) → nome opcional, campos
  que o OpenCode pede para o método (`form`: condições `when`, ocultos com o padrão, validação pelo
  mesmo schema na tela e no servidor) e, para chave, o campo mascarado → login:
  - **chave**: `integration.connect.key`;
  - **OAuth modo `code`**: abre a página, o usuário cola o código (`oauth.complete`);
  - **OAuth modo `auto`** (código de dispositivo, ex.: GitHub Copilot): mostra as instruções e consulta
    o status a cada 1,5 s. Se a URL retorna em `localhost` (navegador da máquina do OpenCode), o
    servidor cancela a tentativa e responde 409 `OPENCODE_OAUTH_LOCAL_CALLBACK` ("use o TUI");
  - **comando** (`integration.command.*`): roda na máquina do OpenCode, com status e Cancelar.
  Fechar o diálogo cancela o login pendente. Ao concluir, a conta nova vira a **selecionada** quando o
  OpenCode não a ativou sozinho.
- **Segredos**: o valor das credenciais (`key`, `refresh`, `access`) nunca sai do servidor (DTO
  próprio); a chave digitada só vai no corpo do `POST` e não volta na resposta, em log ou auditoria.
- **Efeitos de cada mudança**: auditoria `ContaOpenCode` (CRIAR, ATUALIZAR para selecionar/renomear,
  EXCLUIR) com provider, nome da conta e método; cache de modelos limpo (`clearAiCatalogCache`); evento
  Pusher. Erros do OpenCode viram mensagens em pt-BR (`toDomainError`: senha recusada 502, provider,
  método ou login inexistente 404, sem conexão 502).
- Trocar a conta vale para as próximas chamadas do OpenCode (sessões já em andamento podem seguir com a
  anterior).

## Feature "Entender tarefas"

- Configuração em `ai_feature_settings` (`feature: "understand-task"`), schema Zod
  `understandTaskSettingsSchema` (mesmo na tela e na API): ativa, provedor, modelo, agente
  (OpenCode), variante/raciocínio, temperatura e máximo de tokens (provedores com amostragem: Gemini, Anthropic, OpenAI e DeepSeek), formato (**Seções
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
  variante/raciocínio, temperatura e máximo de tokens (provedores com amostragem: Gemini, Anthropic, OpenAI e DeepSeek), **tamanho máximo** do resumo
  (40–400 caracteres, padrão 140) e instruções (prompt de sistema, "Restaurar padrão").
- Regras ao salvar iguais às de "Entender tarefas" (ativa exige provedor+modelo conectado; modelo,
  variante e agente conferidos no catálogo; campos que não se aplicam ao provedor viram vazios).
  **Ao ativar** (`enabled` de falso→verdadeiro), dispara em segundo plano a varredura das tarefas
  não concluídas sem resumo (`runTaskSummaryBackfill` via `runAfterResponse`). Auditoria `FeatureIA`
  e evento `ai-feature-updated` em `private-app`.
- **Resumo** = 1 linha **adicional**, que **não substitui** a descrição: aparece no card do kanban
  (linha sob o título), na coluna **Título** da tabela e, na página da tarefa, em um **card próprio
  em linha inteira abaixo do título** (`TaskSummaryCard`, fonte discreta). A aba **Descrição** segue
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

## Serviços (título, resumo e tags)

O módulo **Serviços** (`modules/services.md`) reusa as configurações existentes em vez de ter uma
feature própria: o **título/resumo** saem da feature **"Orçamentos"** (provedores de texto + o mesmo
`streamAi`) e as **tags** da feature **"Tags de tarefas"** (`generateTagsForInput`, texto ou JEV).
Roda em segundo plano (`runAfterResponse`) e registra o consumo em `ai_consumption_logs` (origem
`service-ai`, `subject: service:{id}`) e uma linha em `ai_usage_logs`. Falha vira `aiStatus: "error"`
com "Gerar novamente" (`POST /api/services/[id]/ai`).

## Feature "Tags de tarefas"

- Configuração em `ai_feature_settings` (`feature: "task-tags"`), schema Zod `taskTagsSettingsSchema`:
  ativa, provedor (texto ou **JEV**), modelo, agente/variante/amostragem, instruções, **máximo de
  tags por tarefa** (`maxTags`), limiar do JEV (`jevThreshold`) e a **taxonomia fechada** (`taxonomy`:
  lista `{ id, label }`, gerenciada na aba "Tags de tarefas"). Ativar exige provedor, modelo e ao
  menos uma tag; ids repetidos são recusados. Regras ao salvar iguais às demais features (provedor
  conectado; modelo/variante/agente conferidos no catálogo).
- Geração (`src/features/ai/server/task-tags.ts`): provedores de texto respondem o JSON
  `{ "tags": [...] }` (validado contra a taxonomia por `parseTaskTags`); o **JEV** recebe uma pergunta
  `noul` por tag (`buildJevTagQuestions`) e seleciona as que passam do limiar (`selectJevTags`). Ao
  ativar, dispara em segundo plano o backfill (`runTaskTagsBackfill`); a rotina `ai-task-tags` (Cron,
  3 min) cobre as demais tarefas não concluídas. Cada geração grava em `ai_usage_logs`
  (`feature: "task-tags"`).
- As tags ficam no campo `tags` do `DevTask` (ids da taxonomia — ver `modules/tasks.md`) e, no portal,
  embasam a busca de tarefas semelhantes da estimativa. `POST /api/tasks/[id]/tags` gera/regenera as
  tags de uma tarefa (JSON `{ tags }`).

- Rotina `ai-task-tags-concluded` ("Gerar tags de tarefas concluídas (IA)"): interna,
  **desligada por padrão**, intervalo de **60 minutos**. "Executar agora" funciona mesmo desligada.
  Processa somente tarefas nas colunas de conclusão configuradas, nunca arquivadas. O escopo fica
  salvo na rotina: `pending` (padrão, "Só pendentes") processa apenas tarefas sem hash ou com
  título/descrição alterados; `all` ("Todas") regenera inclusive tags atualizadas, útil após mudar
  a taxonomia. Alterar o escopo exige salvar antes de executar. Sem colunas de conclusão ou sem
  tarefas elegíveis, retorna um aviso sem chamar a IA. Respeita a disponibilidade da feature,
  processa sequencialmente e contabiliza falhas sem interromper as demais tarefas. A geração
  preserva `updatedAt`, publica `tasks-updated` e registra o uso de IA como na rotina original.

## Feature "Orçamentos" (prévia do portal do cliente)

- Configuração em `ai_feature_settings` (`feature: "budget-preview"`), schema Zod
  `budgetPreviewSettingsSchema` (mesmo na tela e na API): ativa, provedor, modelo, agente (OpenCode),
  variante/raciocínio, temperatura e máximo de tokens (provedores com amostragem: Gemini, Anthropic, OpenAI e DeepSeek) e instruções (prompt de sistema).
  Regras ao salvar iguais às demais features (ativa exige provedor+modelo conectados; modelo,
  variante e agente conferidos no catálogo; campos que não se aplicam viram vazios).
- Gera **somente a prévia** da tarefa (1ª fase, `parseDraftPreview`): a IA interpreta a **descrição
  enviada pelo cliente** e devolve **JSON validado com Zod** — título, tipo, prioridade,
  especificação técnica (Markdown) e resumo de 1 linha — mais a avaliação **transitória** de
  **clareza** (`clarity`: `acceptanceCriteria` e `location`, estados `clear`/`vague`/`missing`), que
  alimenta o card da revisão e **não** é persistida. A IA escreve as seções **"## Critérios de
  aceite"** e **"## Localização"** na especificação técnica; na **correção**, o prompt inclui a
  **prévia atual** e pede ajuste mínimo. Como não há saída estruturada garantida, o JSON é extraído
  do texto e validado; inválido → evento `error`. Ver `modules/orcamentos.md`.

## Feature "Estimar prazos" (tarefas semelhantes; provedor configurável)

- Configuração em `ai_feature_settings` (`feature: "estimate-hours"`), schema Zod
  `estimateHoursSettingsSchema`: ativa, provedor (texto ou **JEV**), modelo, agente/variante
  (OpenCode), temperatura e máximo de tokens (só provedores que amostram), **quantas tarefas
  semelhantes** considerar (`similarLimit`) e instruções. Regras ao salvar iguais às demais features.
- Usada na 2ª fase do portal (ver `modules/orcamentos.md`) e no botão **Estimar com IA** da **tarefa
  existente** (`POST /api/tasks/[id]/estimate/generate`, que estima a partir dos dados da própria
  tarefa; ver `modules/tasks.md`). `H` é o **tempo de execução observado**
  (não esforço humano), ancorado nas **horas reais apontadas** das tarefas semelhantes: `server/similar.ts`
  só considera tarefas **com apontamento** (`TimeLog`) e o prompt injeta a **mediana** como âncora
  (`estimateAnchor`); tarefas sem horas e a estimativa anterior da IA ficam de fora. É uma **única
  chamada** (sem agente/tools): provedores de texto devolvem `{ estimatedHours }` (validado por
  `parseEstimateHours`) e o **JEV** responde um `score` de 10 níveis de tempo (posição fracionária de
  0 a 9) que é **interpolado** para horas entre as âncoras (`mapJevEstimateScore`); `saveDraftEstimate`
  grava as horas **e o modelo** que as gerou; o núcleo é compartilhado (`server/estimate-hours.ts`)
  entre o rascunho e a tarefa existente. O cálculo exibido ao cliente (`H × fator × custo/hora`) é do
  servidor.

## Feature "Refinar tarefa" (agente do OpenCode que conduz perguntas)

- Configuração em `ai_feature_settings` (`feature: "task-refinement"`), schema Zod
  `taskRefinementSettingsSchema`: ativa, **modelo** e **agente** do OpenCode, variante, instruções
  ("Restaurar padrão") e o que enviar (comentários, histórico). É **exclusiva do OpenCode** (depende
  da sessão longa e do sistema de perguntas), como "Estimar prazos". Ativar exige modelo; modelo,
  variante e agente são conferidos no catálogo do OpenCode.
- A aba mostra um card **Diretório da sessão**: as sessões são criadas no diretório da **central de
  desenvolvimento do projeto da tarefa** (Integrações › Provedores de IA › Desenvolvimento agêntico),
  nunca no diretório da integração OpenCode; lista as centrais com seus diretórios.
- Regras ao salvar iguais às demais features. Auditoria `FeatureIA` e evento `ai-feature-updated`.
- **Entrada** (`src/features/refinement/prompt.ts`, puro): a tarefa inteira em Markdown
  (`buildUnderstandTaskPrompt`); as instruções configuradas + um **protocolo fixo** são aplicadas como
  **entrada durável da sessão** do OpenCode (`session.instructions.entry.put`, chave `opex-refinement`;
  o prompt do turno reenvia o protocolo se o servidor não aceitar a entrada). O protocolo garante que a
  especificação cubra **critérios de aceite**, **localização da mudança** (rotas/URLs, telas, módulos,
  integrações, arquivos) e **casos de borda**, que o agente reescreva a especificação a cada rodada sob
  o título `## Especificação técnica` e que só encerre o turno com uma pergunta ou com a especificação.
  O agente **pergunta pela ferramenta nativa `question`** (formulários) e **não** escreve as perguntas
  como texto; o refinamento só é marcado como esclarecido quando o turno produz a especificação **e**
  ela é gravada. Ver `modules/refinement.md`.

## Memórias dos agentes (Agente Opex OPE-85, copiado do Ciliar · Agente Adversário OPE-87)

- **Listas** (catálogo puro `src/features/ai/agents.ts`): `opex-global` (**Memórias globais**, valem
  no dono e no portal), `opex-owner` (**Memórias do dono**, só nos turnos do dono), `opex-client`
  (**Memórias do cliente**, só nos turnos do portal, para todos os clientes) e `adversarial`
  (**Memórias do Agente Adversário**, entram nas instruções de toda revisão da mesa). Cada lista tem a
  aba onde aparece (`tab`: `agente-opex` ou `agente-adversario`; `aiAgentsOfTab`). Uma lista nova
  entra no catálogo e ganha a API, o card e as ferramentas do Agente Opex.
- **Dados**: coleção `agent_memories` (`AgentMemory`: `agentId`, `texto`, `resumo`, `origin`
  opcional, `createdBy`, `updatedBy`, datas; índice `{ agentId, createdAt }`). **Sem limite de
  quantidade** por lista (o antigo limite de 50 e o 409 `MEMORY_LIMIT` saíram na OPE-92, como na
  MT-27 do my-tasks); texto de 3 a 2.000 caracteres (`memoryInputSchema`, mesmo schema na tela e na API); lista
  desconhecida dá 404 `AI_AGENT_NOT_FOUND`.
- **Serviço** (`server/agent-memory-service.ts`): listar (mais recentes primeiro), ler, criar, editar
  e excluir. Criar/editar passam por `formatMemory` (uso "Resumo de memórias") e aceitam
  `{ origin, auditContext }` opcionais (`AgentMemoryWriteOptions`): a origem (`{ source, label }`, ex.:
  `Mentor · OPE-12`, gravada pelo Agente Mentor) fica no documento e no DTO (`origin`), nunca no
  texto, e o contexto vai para o `depois` da auditoria; auditoria
  `MemoriaAgente` (criar/atualizar/excluir, com o texto e a origem), log Pino e evento
  `ai-memories-updated` `{ agentId }` em `private-integration-ai`. Autor = dono (usuário local).
- **Prompt**: `agentMemoryTexts(listas)` + `memoriesSection` (módulo puro
  `src/features/ai/memories-prompt.ts`, compartilhado; ver `modules/opex-agent.md` e
  `modules/adversarial-agent.md`). O prompt do Agente Opex nunca recebe a lista `adversarial`.
- **Tela**: aba Agente Opex › Memórias mostra só as listas da aba (`aiAgentsOfTab("agente-opex")`:
  três cards); aba Agente Adversário › Memórias mostra o card `adversarial` (sem modelo de resumo
  próprio: usa o Resumo de memórias global). Cards `AgentMemoriesCard` com `MemoryList` — linha com o
  resumo de uma linha que expande o texto completo, autor e "há X tempo", o **selo da origem**
  (`GraduationCap` + rótulo) quando houver e o **total de memórias** ao lado de **Nova memória**
  (sempre habilitado); **Nova memória**/editar com
  `MemoryEditor` (contador, Ctrl+Enter salva, Esc cancela); criar/editar/excluir **otimistas**
  (linha com o resumo em skeleton enquanto a IA formata; falha reverte com toast); excluir pede
  confirmação (`ConfirmDialog`, `src/components/ui/confirm-dialog.tsx`); aviso quando a memória foi
  salva sem formatação. Tempo real por `useMemoriesRealtime`.
- **Ferramentas do agente**: grupo "Memórias do agente" (`list/get/create/update/delete_agent_memory`),
  com o enum de todas as listas do catálogo — inclusive a do Agente Adversário.

## Feature "Resumo de memórias"

- Aba `resumo-memorias` (`MemorySummaryTab`, moldura `FeatureFormShell` copiada do Ciliar): liga/
  desliga com a disponibilidade, provedor e modelo pelo cartão do Agente Opex (`OpexModelCard`:
  Gemini, Anthropic, OpenAI ou DeepSeek), instruções e **tamanho máximo do resumo** (40–200, padrão
  80). Salva em `ai_feature_settings` (`feature: "memory-summary"`), auditada como as demais.
- `formatMemory` (`server/memory-summary.ts`) nunca lança: com a feature disponível, pede ao modelo
  `{"texto","resumo"}` (texto revisado + resumo de uma linha; `parseFormattedMemory` tolera cercas e
  texto em volta); desligada, indisponível, com erro ou resposta inválida, salva o texto como escrito
  (normalizado) com o **resumo de reserva** (primeira frase, cortada em limite de palavra) e devolve
  `formatadaPorIa: false`. Consumo na origem `memory-summary`; timeout de 30 s.

## APIs

| Rota | Descrição |
|---|---|
| `GET /api/ai/providers/[provider]/models` | Modelos do provedor (`?refresh=1`); 502 com a mensagem do provedor |
| `GET /api/ai/providers/jev/usage` | Consumo agregado JEV por `from`/`to` ISO opcionais (sessão interna), com `features` (uma linha por recurso: `feature`, `label`, chamadas, tokens e custo); intervalo inválido → 400; sem limites → logs retidos |
| `GET /api/ai/providers/opencode/usage` | Consumo do OpenCode por origem (`from`/`to` ISO opcionais, sessão interna); métricas ausentes ficam `null` |
| `GET /api/ai/providers/opencode/accounts` | Providers do OpenCode com as contas (sem segredos) |
| `POST /api/ai/providers/opencode/accounts/[integrationId]/key` | Adiciona conta por chave `{ key, label?, answer? }` |
| `POST /api/ai/providers/opencode/accounts/[integrationId]/oauth` | Inicia login OAuth `{ methodId, label?, answer? }` |
| `GET/POST/DELETE .../accounts/[integrationId]/oauth/[attemptId]` | Status / conclui com `{ code }` / cancela |
| `POST /api/ai/providers/opencode/accounts/[integrationId]/command` | Inicia login por comando `{ methodId, label? }` |
| `GET/DELETE .../accounts/[integrationId]/command/[attemptId]` | Status / cancela |
| `PATCH/DELETE .../accounts/credentials/[credentialId]` | Renomeia `{ label }` / remove a conta |
| `POST .../accounts/credentials/[credentialId]/activate` | Seleciona a conta em uso |
| `/api/ai/providers/opencode/service/**`, `/scopes`, `/resources/**`, `/backups/**` | Serviço e recursos do OpenCode (`modules/opencode-resources.md`, "APIs") |
| `GET /api/ai/agents` | Agentes primários do OpenCode |
| `GET/PUT /api/ai/features/understand-task` | Configuração de "Entender tarefas" + disponibilidade |
| `GET/PUT /api/ai/features/task-summary` | Configuração de "Resumos de tarefas" + disponibilidade |
| `GET/PUT /api/ai/features/task-tags` | Configuração de "Tags de tarefas" (taxonomia) + disponibilidade |
| `GET/PUT /api/ai/features/budget-preview` | Configuração de "Orçamentos" + disponibilidade |
| `GET/PUT /api/ai/features/estimate-hours` | Configuração de "Estimar prazos" + disponibilidade |
| `GET/PUT /api/ai/features/task-refinement` | Configuração de "Refinar tarefa" + disponibilidade |
| `GET/PUT /api/ai/features/memory-summary` | Configuração do "Resumo de memórias" + disponibilidade |
| `GET/POST /api/ai/agents/[agentId]/memories` | Memórias de uma lista (`opex-global`, `opex-owner`, `opex-client`, `adversarial`); criar `{ texto }` → `{ memoria, formatadaPorIa }` |
| `GET/PATCH/DELETE /api/ai/agents/[agentId]/memories/[memoryId]` | Ler; editar `{ texto }` (reformata); excluir |
| `POST /api/tasks/[id]/understand` | Gera a explicação (NDJSON) |
| `POST /api/tasks/[id]/summary` | Gera (ou regenera) o resumo de 1 linha (NDJSON) |
| `POST /api/tasks/[id]/tags` | Gera (ou regenera) as tags da tarefa (JSON `{ tags }`) |

## Testes

`__tests__/lib/ai/` (catálogo dos provedores e `streamAi`), `__tests__/features/ai/` (entrada e
estado do modal, entrada de rascunhos, `prepareUnderstandTask`, configuração, rota NDJSON,
`UnderstandTaskDialog` e `UnderstandTaskButton`; resumos: `task-summary` puro,
`task-summary-settings`, `task-summary-job` e `task-summary-route`; `task-detail-sections` e
`task-detail-tabs` cobrem as abas da página da tarefa — a Descrição (sem título próprio) não sendo
substituída pelo resumo, a especificação técnica em aba própria e a troca de abas sem quebrar os
hooks (regressão React #310) — e `task-summary-card` o card do resumo sem o rótulo "Resumo (IA)";
`estimate-hours-settings` cobre a configuração de "Estimar prazos"; tags: `task-tags` puro,
`task-tags-settings`, `task-tags-job`; estimativa por tarefas semelhantes: `orcamentos-estimate` e
`orcamentos-similar`; `task-refinement-settings` cobre a configuração de "Refinar tarefa"). A
feature "Orçamentos" é coberta em `__tests__/features/orcamentos/` (ver `modules/orcamentos.md`); o
refinamento de tarefas em `__tests__/features/refinement/` (ver `modules/refinement.md`). As contas dos providers do OpenCode em `__tests__/features/opencode-accounts/` (junção sem
segredos, formulários dos métodos, detecção de retorno em localhost, serviço, rotas, aba e diálogo).

Uso JEV: `__tests__/lib/ai/jev-usage.test.ts` (normalização/custo/rateio),
`jev-request-usage.test.ts` (persistência/auditoria/evento por requisição e falhas),
`__tests__/features/ai/jev-usage.test.ts` (agregação/períodos e consumo por recurso), `jev-usage-route.test.ts`
(API interna), `jev-usage-card.test.tsx` (painel/filtro/estados/tabela), `usage-breakdown-table.test.tsx`
(tabela compartilhada entre JEV e OpenCode) e `jev-usage-hook.test.tsx`
(consulta/tempo real/cleanup). Os testes de tags e estimativas verificam referências e ausência de
logs JEV duplicados, inclusive tags avulsas e falha de negócio posterior à resposta.
