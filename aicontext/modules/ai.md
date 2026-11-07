# Módulo: Inteligência Artificial (`/integracoes/ia`)

Chamadas a IA do app passam por uma camada única sobre a **Vercel AI SDK** (`ai` v7). Os provedores
são integrações configuradas na tela (sem `.env`) e cada feature que usa IA escolhe provedor, modelo
e opções na própria aba da página "Inteligência Artificial".

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
  ignora o cache. `?kind=embedding` lista os modelos de **embedding** (só Gemini — `embedContent` em
  `supportedGenerationMethods`, `listGeminiEmbeddingModels` — e OpenAI — ids com `embedding`,
  `listOpenaiEmbeddingModels`), com cache separado; outro provedor ou tipo → `422`. Usado pela "IA do
  Opex" do Engramind (`useAiModels(provider, true, "embedding")`). As URLs oficiais ficam em
  `src/lib/ai/endpoints.ts` (puro, reexportadas por cada provedor).
- **A chave do Gemini, Anthropic, OpenAI e DeepSeek pode alimentar o Engramind** (Redator e
  embedding, `modules/engramind.md`, "IA do Opex"): gravar ou apagar a chave dessas integrações
  agenda, depois da resposta, o reenvio ao Engramind (`syncEngramindProviderKey`). Falha no Engramind
  nunca desfaz nem bloqueia o salvamento no Opex. Situação do provedor: **configurado** (obrigatórios preenchidos,
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

- `ai` é o hub do catálogo ("Inteligência Artificial"); `ai_opencode`, `ai_gemini`, `ai_anthropic`,
  `ai_openai`, `ai_deepseek` e `ai_jev` são **filhas** (`parent: "ai"`): ficam fora da lista de
  `/integracoes` e têm rotas próprias (`/integracoes/ia` em `app/(app)/integracoes/ia/page.tsx`;
  `/integracoes/ia/<provedor>` em `ia/[provider]/page.tsx`, provedor desconhecido = 404; `/integracoes/<id>` redireciona). O voltar da página do provedor leva ao hub.
- Abas (`?aba=`, `AiEditorForm`): **Provedores** (lista com status, "Não configurado", Testar e
  link para a página; mais o card Geral do hub) e **uma aba por agente**, na ordem do fluxo de
  trabalho e com o nome **sem a palavra "Agente"** — a mesma ordem, os mesmos nomes e os mesmos ícones
  da categoria **Agentes** da sidebar, todos do catálogo `AGENT_CATALOG`
  (`src/features/agent-metrics/catalog.ts`; lista das abas em `src/features/ai/tabs.ts`, OPE-122):

  | Aba | Id (`?aba=`) | Conteúdo |
  |---|---|---|
  | Opex | `agente-opex` | Assistente por chat com ferramentas do app — `modules/opex-agent.md` |
  | Maddox | `agente-maddox` | Agente de chat sobre o OpenCode — `modules/maddox-agent.md` |
  | Orçamentista | `orcamentista` | Seções **Orçamentos** (prévia do portal) e **Estimar prazos** |
  | Catalogador | `catalogador` | Seções **Resumos de tarefas** e **Tags de tarefas** |
  | Refinador | `refinar-tarefa` | Refinar tarefa (texto ou skill) — `modules/refinement.md` |
  | Desenvolvedor | `desenvolvimento-agentico` | Ícone `</>` (`CodeXml`); abas internas **Agentes** (agentes padrão e colunas globais, OPE-79) e **Centrais de desenvolvimento** (`abaAgentic`; centrais em `/integracoes/ia/centrais/[id]`) — `modules/agentic-dev.md` |
  | Arquiteto | `agente-arquiteto` | Diagrama do plano aprovado (ícone `Network`) — `modules/architect-agent.md` |
  | Adversário | `agente-adversario` | Revisor da implementação (ícone `Swords`) — `modules/adversarial-agent.md` |
  | Revisor | `revisao-pr` | Só a configuração; as revisões ficam em `/agente-revisor` — `modules/pr-review.md` |
  | Mentor | `agente-mentor` | Lições das mesas que viram memórias (ícone `GraduationCap`) — `modules/adversarial-agent.md`, "Agente Mentor" |
  | Rotineiros | `rotineiros` | Agentes rotineiros (ícone `Repeat`): lista, editor (`?agente=<id>`/`novo`) e o modelo do subagente de provisionamento — `modules/routine-agents.md` |

  O `ProviderModelCard` compartilhado aceita `names` (caminhos aninhados, ex.: `opex.model` nos
  agentes rotineiros), `hideAgent` e `idPrefix`; sem eles, usa os campos `provider/model/agent/variant`.

  O título das memórias é gerado pelo Redator do Engramind (não há aba própria). Cada página de agente
  (`/agente-<nome>`, `modules/agent-metrics.md`) tem o botão **Configurar**, que leva à aba acima.
- **Abas fundidas** (Orçamentista e Catalogador): uma seção por feature (`MergedFeaturesTab`,
  `src/features/ai/components/shared/`), cada uma com a **própria configuração** (ativar, provedor,
  modelo, instruções e opções) e o mesmo comportamento de antes. A aba tem **um rodapé único**:
  **Salvar** grava em sequência só as seções alteradas (ou ainda sem configuração salva) e, se uma
  falhar, avisa por toast qual não foi salva (e quais foram); **Desfazer** volta todas; trocar de aba
  com qualquer seção alterada pede descarte. Cada seção é um formulário próprio
  (`BudgetPreviewSection`, `EstimateHoursSection`, `TaskSummarySection`, `TaskTagsSection`) ligado ao
  rodapé por `useFeatureSection` (estado + `save()`/`undo()`).
- **Links antigos** (`AI_TAB_ALIASES`, `useIntegrationTab(..., aliases)`): `?aba=orcamentos` e
  `?aba=estimar-prazos` abrem **Orçamentista**; `?aba=resumos-tarefas` e `?aba=tags-tarefas` abrem
  **Catalogador** — a URL vira a canônica com `?secao=<feature>` e a página rola até a seção;
  `?aba=entender-tarefas` (feature removida) e qualquer id desconhecido abrem **Provedores**, sem erro.
- Página do provedor (`AiProviderEditorForm`, `?aba=`): abas **Configuração** (campos, segredos e
  ações de salvar), **Controles** (só OpenCode: serviço, logs e backups — `modules/opencode-resources.md`),
  **Modelos** (card Modelos disponíveis: somente leitura, busca fuse.js, lista
  virtualizada, Atualizar ignora o cache; com alterações não salvas, pede para salvar), **Contas**
  (só OpenCode; seção abaixo), **Skills**, **Agentes**, **Comandos**, **Plugins** e **MCPs** (só
  OpenCode — `modules/opencode-resources.md`) e **Consumo** (todos os provedores: OpenCode por
  origem, JEV por feature e Gemini, Anthropic, OpenAI e DeepSeek por recurso). Trocar de aba com
  alterações pede descarte.
- **Seletor de provedor** das features de texto (`ProviderModelCard`, `OptionTabs` que quebra linha):
  OpenCode, Gemini, Anthropic, OpenAI e DeepSeek (mais o JEV em Tags e Estimar prazos); só os
  conectados podem ser escolhidos. Agente Refinador, Agente Revisor e Agente Desenvolvedor são
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
  OpenCode (`UsageBreakdownTable`), com métricas ausentes como `—` e tokens abreviados (ver
  "Formatação do consumo"). A linha Total usa os mesmos
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
  consumo"). O card é o `ProviderUsageCard`, compartilhado com os provedores diretos
  (`useUsageRange` + `useProviderUsage` + `UsageRefreshButton`).
- Em `/integracoes/ia/gemini`, `/integracoes/ia/anthropic`, `/integracoes/ia/openai` e
  `/integracoes/ia/deepseek`, a aba **Consumo** usa o mesmo `ProviderUsageCard`: uma **tabela por
  recurso** (feature de IA ou agente que consumiu o provedor, ex.: "Agente Opex", "Resumos de
  tarefas", "Orçamentos") com chamadas, entrada, saída e total, mais a linha **Total**. Essas APIs
  não informam custo por requisição (`costUsd` fica `null`), então a coluna **Custo (USD) não
  aparece** e a tela mostra só tokens; a ausência de custo também não entra no aviso de totais
  parciais. Entrada ou saída informadas só em parte dos registros do período aparecem como soma dos
  conhecidos e entram no aviso ("N sem tokens de entrada/saída"), nunca como medição completa.
  Mesmo filtro de período, agregado no servidor em `GET /api/ai/providers/[provider]/usage` (só os
  quatro provedores diretos; OpenCode e JEV têm rotas próprias). O painel informa desde quando há
  medição do provedor.
- **Formatação do consumo**: os tokens das tabelas de consumo são abreviados com sufixo (`k`, `M`,
  `B`, `T`), até 3 casas decimais e sem zeros à direita, em pt-BR — `1000` → `1k`, `1234` →
  `1,234k`, `2_500_000` → `2,5M`; abaixo de mil o número aparece inteiro. O número completo fica no
  `title` da célula. Chamadas continuam completas e os cards de métrica do JEV não abreviaram.
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

## Feature "Entender tarefas" (removida na OPE-122)

A feature saiu por completo: aba, botão e modal na tarefa, APIs (`/api/ai/features/understand-task` e
`/api/tasks/[id]/understand`), a ferramenta `understand_task` do Agente Opex e a configuração gravada.
A migração idempotente `remove-understand-task-feature` apaga a configuração (`ai_feature_settings`),
os registros de uso (`ai_usage_logs`) e o consumo (`ai_consumption_logs`, origem `understand-task`)
dela, então os totais de consumo deixam de contar esse histórico (a auditoria fica). O que era
compartilhado continua com nome neutro: a tarefa em Markdown (`task-context-prompt.ts`,
`buildTaskContextPrompt`, usada pela mesa e pelo Refinador), o redutor dos streams de texto
(`ai-stream-state.ts`, usado pelos Resumos), o card de provedor e modelo
(`components/shared/ProviderModelCard.tsx`) e a atividade/uso do stream
(`components/shared/AiStreamStatus.tsx`).

## Feature "Resumos de tarefas"

- Configuração em `ai_feature_settings` (`feature: "task-summary"`), schema Zod
  `taskSummarySettingsSchema` (mesmo na tela e na API): ativa, provedor, modelo, agente (OpenCode),
  variante/raciocínio, temperatura e máximo de tokens (provedores com amostragem: Gemini, Anthropic, OpenAI e DeepSeek), **tamanho máximo** do resumo
  (40–400 caracteres, padrão 140) e instruções (prompt de sistema, "Restaurar padrão").
- Regras ao salvar (`server/settings.ts`): ativa exige provedor e modelo, e o provedor precisa estar
  **conectado** para ativar (409); modelo, variante e agente são conferidos no catálogo (400); campos
  que não se aplicam ao provedor viram vazios.
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
  fica no cabeçalho da tarefa (desabilitado com o motivo quando indisponível). Estado no redutor de
  `ai-stream-state.ts`.

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

## Feature "Agente Refinador" (refinar tarefa: agente do OpenCode que conduz perguntas)

- Aba **"Agente Refinador"** (id `refinar-tarefa`, mantido para os links). O botão da tarefa continua
  **Refinar tarefa**.
- Configuração em `ai_feature_settings` (`feature: "task-refinement"`), schema Zod
  `taskRefinementSettingsSchema`: ativa, **modelo** e **agente** do OpenCode, variante, **origem das
  instruções** (`instructionsSource`: `text` | `skill`), instruções de texto ("Restaurar padrão"),
  **skill** do OpenCode (`skill`, id) e o que enviar (comentários, histórico). Detalhes da origem
  "Skill do OpenCode" em `modules/refinement.md`, "Configuração". É **exclusiva do OpenCode** (depende
  da sessão longa e do sistema de perguntas), como "Estimar prazos". Ativar exige modelo; modelo,
  variante e agente são conferidos no catálogo do OpenCode.
- A aba mostra um card **Diretório da sessão**: as sessões são criadas no diretório da **central de
  desenvolvimento do projeto da tarefa** (Integrações › Inteligência Artificial › Agente Desenvolvedor),
  nunca no diretório da integração OpenCode; lista as centrais com seus diretórios.
- Regras ao salvar iguais às demais features. Auditoria `FeatureIA` e evento `ai-feature-updated`.
- **Entrada** (`src/features/refinement/prompt.ts`, puro): a tarefa inteira em Markdown
  (`buildTaskContextPrompt`); as instruções configuradas + um **protocolo fixo** são aplicadas como
  **entrada durável da sessão** do OpenCode (`session.instructions.entry.put`, chave `opex-refinement`;
  o prompt do turno reenvia o protocolo se o servidor não aceitar a entrada). O protocolo garante que a
  especificação cubra **critérios de aceite**, **localização da mudança** (rotas/URLs, telas, módulos,
  integrações, arquivos) e **casos de borda**, que o agente reescreva a especificação a cada rodada sob
  o título `## Especificação técnica` e que só encerre o turno com uma pergunta ou com a especificação.
  O agente **pergunta pela ferramenta nativa `question`** (formulários) e **não** escreve as perguntas
  como texto; o refinamento só é marcado como esclarecido quando o turno produz a especificação **e**
  ela é gravada. Ver `modules/refinement.md`.

## Memórias dos agentes (Agente Opex OPE-85 · Agente Adversário OPE-87 · agente desenvolvedor OPE-97 · Engramind OPE-104)

As memórias ficam no **Engramind** (fonte única desde a OPE-104; a coleção antiga `agent_memories`
só é lida pelo backup da migração). Mapeamento lista → canal, rede (canais, agentes, tokens,
assinaturas), contexto com cache, serviço e migração: `modules/engramind.md`, "Memórias dos agentes".

- **Listas** (catálogo puro `src/features/ai/agents.ts`): `app-global` (**Memórias do Opex**, canal
  `opex`, lidas por todos os agentes), `opex-global` (**Memórias globais**, dono e portal), `opex-owner`
  (**Memórias do dono**), `opex-client` (**Memórias do cliente**, no portal, para todos os clientes),
  `opex-client-specific` (**Memórias de um cliente**, `scope: "client"`, só no portal daquele cliente),
  as mesmas quatro do Agente Maddox (`maddox-*`), `adversarial`, `architect` (Agente Arquiteto), `developer-global` e `developer-central`
  (`scope: "central"`). Cada lista tem a aba onde aparece (`tab`); as por central aparecem na página da
  central e as por cliente no card "Memórias de um cliente" (seletor de cliente).
- **Escopo**: lista por central exige `centralId` (400 `CENTRAL_REQUIRED`, 404 `CENTRAL_NOT_FOUND`,
  `CENTRAL_NOT_ALLOWED` nas demais); por cliente exige `clientId` (`CLIENT_REQUIRED`/`CLIENT_NOT_FOUND`/
  `CLIENT_NOT_ALLOWED`). Memória de outro canal = 404. Lista desconhecida = 404 `AI_AGENT_NOT_FOUND`.
- **DTO** (`MemoryDto`): `id` (`m_…`), `texto`, `resumo` (título do Redator; primeira frase enquanto
  `resumoPendente`), `categoria`, `fixada`, `ativa`, `versao`, `autor`, `doDono`, `origin`, datas,
  `centralId?`/`clientId?` e `uso` (OPE-109: `consultas` = `retrieval_count`, `injecoes` =
  `injected_count`, `ultimaConsulta`, `verificadaEm`, `esquecida` = `stale_candidate`). Limites (`text_min`/`text_max`) e categorias vêm do Engramind
  (`memoryInputSchemaFor`, a mesma regra na tela, nas rotas e nas ferramentas).
- **Mover de lista** (`moveAgentMemory`, OPE-132): `POST /v1/memories/{id}/move` do Engramind (exige
  `write` na origem e no destino), com auditoria `MemoriaAgente` (`acoes: ["mover"]`, canais antes/depois)
  e aviso nas duas listas. É o que a reorganização do Agente Mentor usa para levar uma memória de uma
  central às globais (ou o inverso). Destino fora do alcance do token → 403 `MEMORY_MOVE_FORBIDDEN`,
  identificado pelo código do Engramind, sem cair para o token admin.
- **Prompt**: `agentMemoryContext(consumer, turn)` (`server/agent-memory-context.ts`) devolve o bloco
  do Engramind em `format=tagged` (desde a OPE-109: `<memories>`/`<channel slug>`/`<CATEGORIA>` com uma
  linha `#<id>: <texto>` por memória, para o Opex saber quais foram entregues), que entra sem alteração depois do cabeçalho de `memoriesSection`
  (`memories-prompt.ts`); com o Engramind fora do ar, o cache de reserva e o aviso do turno.
- **Tela** (OPE-109: **sempre em rede**; OPE-148: **um card só por agente**): a seção de memórias de cada
  agente (`OpexMemoriesSection` do Agente Opex e do Maddox, `MemoriesSection` do Adversário e do Arquiteto,
  `DeveloperMemoriesSection` do desenvolvedor e da central) mostra a chave do aprendizado autônomo e o
  **universo do agente** (`MemoryUniverseSection` → `AgentUniverseCard`, o `AgentUniverse` da lib, igual à
  aba Memórias dos rotineiros): o agente `opex/<consumidor>` no centro e todas as memórias que ele alcança,
  cada canal com a sua cor — Memórias do Opex, globais, do dono, do portal e as de **cada cliente** (rotuladas
  pelo nome do cliente; não há mais seletor de cliente). Na **central**, só o que vale nela: `opex`, as
  globais do desenvolvedor e o canal da central. O mapa fica em `memoryUniverseOf`
  (`src/features/ai/memory-universe.ts`, puro): agente, canal inicial de **Nova memória** (a global do
  agente; na central, o canal da central) e os canais permitidos. "Nova memória" escolhe o canal entre os do
  universo. As ações do card (ativar, fixar, editar, excluir, criar) são as da lib pelo proxy
  `/api/engramind/**` (catálogo e auditoria do proxy), e o tempo real vem pelo SSE da lib. A rede preenche a
  altura disponível da página (`fill`; ver `aicontext/modules/engramind.md`, "Altura"). Acima dela,
  `MemoriesNotices` com `universe` (`outsideForUniverse`: as combinações de canais do próprio consumidor; na
  central, só as que cabem nos canais dela): migração pendente, Engramind indisponível e memórias fora do
  contexto. `useMemoriesRealtime` continua relendo os metadados.
- **Ferramentas de gestão do Agente Opex** (só o dono): `list/get/create/update/delete_agent_memory`,
  com `categoria`, `fixada`, `ativa`, `version`, `centralId`/`clientId`; `list_agent_memories` sem
  `agent` devolve só contagens das listas sem escopo (nas por central/cliente o id é obrigatório, sem
  rajada); `delete_agent_memory` é `destructive`.

## Aprendizado autônomo ("Memória própria", OPE-104)

- Cada agente (Opex, Maddox, Adversário e desenvolvedor) grava, edita, fixa, inativa e exclui as
  memórias dos **próprios** canais, com o token dele no Engramind (o Engramind registra o agente como
  autor; origem `{ source: <consumidor>, label }`). Ferramentas (`server/self-memory/tools.ts`, metadados
  em `self-memory.ts`): `list_my_memories`, `remember`, `update_my_memory`, `pin_my_memory` (`write`),
  `set_my_memory_active` e `forget_my_memory` (**`destructive`**: pedem Confirmar/Cancelar; o dono troca a
  confirmação e liga/desliga cada uma em Agente Opex › Ferramentas, valendo para todos os agentes).
- Listas graváveis = `writableListsFor` do turno (portal: só a do cliente da sessão, cliente forçado
  pelo servidor). Sem filtro de conteúdo (decisão do dono): o agente pode registrar códigos de tarefa,
  URLs, rotas, nomes, tokens e chaves; a instrução pede só a lista mais específica, para não sujar as globais.
- Memória do dono: editar sim; excluir/inativar não (`OWNER_MEMORY_PROTECTED`) — o dono exclui pela tela
  ou pedindo ao Agente Opex (`delete_agent_memory`, com o card de confirmação).
- Até 5 mutações por turno (`SELF_MEMORY_TURN_LIMIT`); as respostas trazem
  `similares` e `foraDoContexto` para o agente consolidar; cada mutação gera um aviso no turno. Na mesa,
  no fork e na revisão do Adversário, o aviso leva a **referência** da memória (`onChange(message,
  memories)`, `noticeMemoryRef`; nunca o texto) e a Saída da IA abre o detalhe lido do Engramind
  (`agentic-dev.md`, "Avisos de memória com detalhe").
- O **Agente Mentor** também grava como agente (`opex/mentor`, token `read+write`, ator `agente:mentor`),
  mas não é consumidor: não tem lista, contexto, aprendizado autônomo nem chave na tela; o card mostra o
  rótulo da origem ("Mentor · OPE-xx"). Ver `modules/adversarial-agent.md`, "Agente Mentor".
- Acesso: Agente Opex nativo (ferramentas do turno); Maddox, mesas/forks e revisões do Adversário pelo
  MCP `opex_memorias` (`POST /api/agent-memory/mcp`, Bearer = segredo derivado da chave das integrações;
  o agente e o turno saem da sessão do OpenCode, subindo à sessão-mãe; sessão desconhecida é recusada),
  registrado por diretório (`ensureAgentMemoryMcp`: diretório ainda inexistente é pulado e volta em
  `skipped`, erro num diretório não derruba os outros; `ok: false` sem configuração ou quando nenhum
  diretório foi registrado — por erro ou por nenhum existir, como o diretório único do Maddox ou o worktree
  do Adversário removido —, e aí as ferramentas não são anunciadas, a falha vira aviso e o turno segue). No Maddox a
  sessão do OpenCode faz `ask` nas que pedem confirmação; nas mesas e revisões (sem chat) a chamada que
  pede confirmação é recusada e o agente edita em vez de excluir.
- Liga/desliga por agente: `ai_feature_settings` `feature: "agent-self-memory"` (padrão: ligado),
  `SelfMemorySwitch` no topo da seção de memórias de cada agente (`GET/PUT /api/ai/features/agent-self-memory`).
- **Instrução acionável (OPE-117)**: `selfMemoryInstructions(consumer, turn, { toolPrefix, counts, write, read })`
  monta dois blocos separados. Leitura ("Memórias fora do contexto"): "N só pelo título e M fora do bloco"
  da entrega do turno (sem overflow, "0 fora do contexto"; Engramind indisponível, a linha some) e o
  gatilho título relevante → `get_hints` com a mensagem/cena → `get_memory` (reserva: `search_memories`),
  sem despejar tudo nem inventar memória. Gravação ("Checklist de fim de turno"): correção do
  dono/usuário, decisão repetida, comando/caminho novo e preferência confirmada; `remember` é o caminho de
  aprendizado e as ferramentas de gestão do Engramind gravam como o dono (memória protegida); lembrete de
  consolidar; limite de 5 e guia de listas. Só leitura e nada fora do contexto → nenhum bloco. Os
  chamadores (Opex, Maddox, desenvolvedor, Adversário e Arquiteto) buscam o contexto antes, para passar
  `counts`.
- **Leitura da faixa de títulos (OPE-117)**: `get_hints` (`text`, `limit?`), `get_memory` (`memoryId`) e
  `search_memories` (`query`, `limit` até 10; trecho de até 240 caracteres) em
  `server/self-memory/read-tools.ts`, risco `read`, sem confirmação, com o token do agente e restritas a
  `contextChannelsFor` do turno — o canal da memória lida é conferido **no Opex** (o agente opex/maddox
  assina `agentes/<agente>/*` e alcançaria outros clientes). Não entram no cache nem publicam consumo;
  falha/timeout vira erro acionável (`SELF_MEMORY_UNAVAILABLE`, `SELF_MEMORY_NOT_FOUND`). Valem sempre
  que o agente recebe contexto: o MCP `opex_memorias` é registrado mesmo com o aprendizado desligado (aí
  só as de leitura atendem; gravar responde "aprendizado autônomo desligado"), e o Agente Opex nativo as
  recebe no turno (dono e portal). O Arquiteto em provedor direto (sem MCP) não as anuncia. O catálogo do MCP é
  único por diretório (não muda por sessão): com o aprendizado desligado, a instrução diz para não chamar
  as de gravação e, no Maddox, as regras da sessão as negam (`selfMemorySessionPermissions(…, { write: false })`).
- **Duas camadas (OPE-117, decisão do dono: não restringir)**: o desenvolvedor (e o Adversário) gravam o
  que percebem em `developer-global`/`developer-central`; o Agente Mentor é a segunda camada, vê as
  memórias da lista de destino (inclusive as recém-gravadas pelo agente na cadeia) e grava só o que passou
  batido, fundindo em vez de duplicar (`MENTOR_TWO_LAYERS` no redator).
- **Adoção (OPE-117)**: o card do `SelfMemorySwitch` mostra gravações em 7 dias, última gravação, último
  contexto lido e a última entrega (`AgentMemoryActivity`); ver `modules/engramind.md`, "Contratos 0.11.0 e OPE-117".

## APIs

| Rota | Descrição |
|---|---|
| `GET /api/ai/providers/[provider]/models` | Modelos do provedor (`?refresh=1`; `?kind=embedding` só Gemini/OpenAI, senão 422); 502 com a mensagem do provedor |
| `GET /api/ai/providers/jev/usage` | Consumo agregado JEV por `from`/`to` ISO opcionais (sessão interna), com `features` (uma linha por recurso: `feature`, `label`, chamadas, tokens e custo); intervalo inválido → 400; sem limites → logs retidos |
| `GET /api/ai/providers/opencode/usage` | Consumo do OpenCode por origem (`from`/`to` ISO opcionais, sessão interna) no mesmo contrato dos provedores diretos: `rows` por origem (`key`), `total`, `coverageFrom` e as contagens de métricas ausentes; métricas ausentes ficam `null` |
| `GET /api/ai/providers/[provider]/usage` | Consumo de Gemini, Anthropic, OpenAI ou DeepSeek por recurso (`from`/`to` ISO opcionais, sessão interna) com `rows`, `total`, `coverageFrom` e as contagens `missingInputRequests`, `missingOutputRequests`, `missingTokenRequests` e `missingCostRequests`; outro provedor → 404; intervalo inválido → 400 |
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
| `GET /api/ai/skills` (`?refresh=1`) | Skills instaladas no OpenCode (`AiSkillDto`, sem o conteúdo; `empty` = vazia) |
| `GET/PUT /api/ai/features/task-summary` | Configuração de "Resumos de tarefas" + disponibilidade |
| `GET/PUT /api/ai/features/task-tags` | Configuração de "Tags de tarefas" (taxonomia) + disponibilidade |
| `GET/PUT /api/ai/features/budget-preview` | Configuração de "Orçamentos" + disponibilidade |
| `GET/PUT /api/ai/features/estimate-hours` | Configuração de "Estimar prazos" + disponibilidade |
| `GET/PUT /api/ai/features/task-refinement` | Configuração do "Agente Refinador" + disponibilidade + situação da skill |
| `GET/PUT /api/ai/features/agent-self-memory` | Aprendizado autônomo por agente |
| `GET /api/ai/memories/meta` | Limites, categorias, migração pendente, disponibilidade e memórias fora do contexto |
| `GET/POST /api/ai/agents/[agentId]/memories` | Memórias de uma lista; criar `{ texto, categoria?, fixada? }` → `{ memoria, duplicada?, similares? }` |
| `GET/PATCH/DELETE /api/ai/agents/[agentId]/memories/[memoryId]` | Ler; editar `{ texto?, categoria?, versao?, fixada?, ativa? }`; excluir |
| `…/agents/[agentId]/clients/[clientId]/memories[/memoryId]` | O mesmo nas listas por cliente |
| `POST /api/tasks/[id]/summary` | Gera (ou regenera) o resumo de 1 linha (NDJSON) |
| `POST /api/tasks/[id]/tags` | Gera (ou regenera) as tags da tarefa (JSON `{ tags }`) |

## Testes

`__tests__/lib/ai/` (catálogo dos provedores e `streamAi`), `__tests__/features/ai/` (`ai-settings`
com a configuração de referência das features; `ai-tabs` com a ordem das abas, os links antigos e o
rodapé único das abas fundidas; `remove-understand-task` com a migração e a ausência de referências;
resumos: `task-summary` puro,
`task-summary-settings`, `task-summary-job` e `task-summary-route`; `task-detail-sections` e
`task-detail-tabs` cobrem as abas da página da tarefa — a Descrição (sem título próprio) não sendo
substituída pelo resumo, a especificação técnica em aba própria e a troca de abas sem quebrar os
hooks (regressão React #310) — e `task-summary-card` o card do resumo sem o rótulo "Resumo (IA)";
`estimate-hours-settings` cobre a configuração de "Estimar prazos"; tags: `task-tags` puro,
`task-tags-settings`, `task-tags-job`; estimativa por tarefas semelhantes: `orcamentos-estimate` e
`orcamentos-similar`; `task-refinement-settings` cobre a configuração do "Agente Refinador", `task-refinement-tab` a aba e `opencode-skills` a lista de skills;
memórias: `memories`, `agent-memory-mapping`, `memory-list`, `memories-realtime`, `self-memory-tools` e
`self-memory-mcp`). A
feature "Orçamentos" é coberta em `__tests__/features/orcamentos/` (ver `modules/orcamentos.md`); o
refinamento de tarefas em `__tests__/features/refinement/` (ver `modules/refinement.md`). As contas dos providers do OpenCode em `__tests__/features/opencode-accounts/` (junção sem
segredos, formulários dos métodos, detecção de retorno em localhost, serviço, rotas, aba e diálogo).

Uso JEV: `__tests__/lib/ai/jev-usage.test.ts` (normalização/custo/rateio),
`jev-request-usage.test.ts` (persistência/auditoria/evento por requisição e falhas),
`__tests__/features/ai/jev-usage.test.ts` (agregação/períodos e consumo por recurso), `jev-usage-route.test.ts`
(API interna), `jev-usage-card.test.tsx` (painel/filtro/estados/tabela), `usage-breakdown-table.test.tsx`
(tabela compartilhada entre JEV, OpenCode e provedores diretos) e `jev-usage-hook.test.tsx`
(consulta/tempo real/cleanup). Consumo dos provedores diretos: `provider-usage.test.ts` (agregação
por recurso, métricas desconhecidas e formato abreviado), `provider-usage-route.test.ts` (API interna,
404 para OpenCode/JEV/desconhecido e período inválido), `opencode-usage-route.test.ts` (contrato real
da rota do OpenCode: `rows`, não `origins`), `provider-usage-card.test.tsx` (painel sem
coluna de custo, estados e totais parciais de entrada/saída) e `provider-usage-hook.test.tsx` (consulta/tempo real
filtrando o provedor e cleanup); `opencode-usage-card.test.tsx` cobre o painel do OpenCode sobre o
mesmo card. Os testes de tags e estimativas verificam referências e ausência de
logs JEV duplicados, inclusive tags avulsas e falha de negócio posterior à resposta.
