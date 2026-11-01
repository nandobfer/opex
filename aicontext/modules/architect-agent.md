# Módulo: Agente Arquiteto (`src/features/architect-agent/`)

Agente **paralelo** ao desenvolvimento agêntico (OPE-105): quando o plano de uma mesa é aprovado
(**Implementar**), um agente do OpenCode **somente leitura** lê o plano aprovado, a tarefa e o código e
desenha a **arquitetura do plano** como um grafo semântico. O diagrama aparece na aba
**"Arquitetura (N)"** da mesa, em tempo real.

O arquiteto **nunca bloqueia nem altera a mesa**: não é etapa (fora da trilha e de `WORKBENCH_STAGES`),
não ocupa vaga da central, não publica na Saída da IA e não muda `stage`/`runState`. Falha, tempo
esgotado ou resposta inválida ficam só na versão do diagrama (aba com "Tentar novamente").

## Fluxo

```
Implementar ─► (resposta) ─► mesa em implementing (ou aguardando vaga), como sempre
            └► runAfterResponse ─► onPlanApproved ─► versão "gerando" ─► sessão nova (só leitura) ─► grafo saneado ─► "pronto"
                                                                                                └─► falha/tempo/JSON inválido ─► "falhou" (Tentar novamente)
```

- `implement()` (`agentic/server/workflow.ts`) grava `approvedPlanVersion` na mesa **na hora** (também
  com a mesa aguardando vaga) e agenda `onPlanApproved` depois da resposta, por import dinâmico
  (`server/workflow-hook.ts`). A resposta do Implementar nunca espera o arquiteto, e uma exceção dele
  não chega à mesa.
- `onPlanApproved` (`server/diagrams.ts`) nunca lança; cada pulo vai ao log informativo: arquiteto
  desativado ou central fora do escopo, disparo **manual**, modelo indisponível, sem plano aprovado ou
  o plano já tem diagrama (aprovação repetida). Erro de configuração vira aviso no log.
- **Plano corrigido e aprovado de novo** (plano v2): a geração em curso do plano anterior é abortada e
  marcada **Descartada** (`superseded`), e a v2 começa. Resultado que chega atrasado de um plano antigo
  (pedido automático) também é descartado. As descartadas ficam fora da aba e de N, mas aparecem no
  Histórico.
- **Pedido manual** ("Gerar arquitetura") e **ajuste** ("Pedir ajustes") exigem o arquiteto ativo para a
  central e disponível (409 `ARCHITECT_DISABLED`/`ARCHITECT_UNAVAILABLE`), um plano aprovado (409
  `ARCHITECT_NO_PLAN`) e nenhuma geração em curso na mesa (409 `ARCHITECT_BUSY`). O botão manual também
  serve para mesas antigas, que já passaram da aprovação.
- **Sem corrida**: a conferência "há geração em curso?" e a gravação da versão como gerando rodam sob uma
  trava por mesa (`withWorkbenchLock`, processo único): dois cliques ou duas abas criam UMA versão (o
  outro recebe 409). O "Tentar novamente" ainda grava a transição de forma atômica (só uma versão que
  continua `failed`/`interrupted` volta a `running`; senão 409 `ARCHITECT_BUSY`).
- **Registro antes da gravação**: a geração é registrada (e o diagrama vivo aberto) ANTES de a versão
  ser gravada como "gerando"; a listagem disparada pelo evento nunca a toma por órfã ("o app
  reiniciou") e o stream já a encontra viva. Se a gravação, a auditoria ou o evento falharem, o
  registro é desfeito.
- Versão aprovada de mesas antigas (sem `approvedPlanVersion`): `approvedPlanVersionOf`
  (`plan-version.ts`): fora do planejamento, o último plano; em `planning` com worktree, o último
  plano; em `plan_review` com worktree e mais de um plano, o anterior; senão nenhuma.
- **Exclusão da mesa** (`finalizeDeletion`): `cleanupWorkbenchDiagrams` aborta as gerações (viram
  interrompidas: "A mesa foi excluída durante a geração") e exclui as sessões pendentes. As versões
  ficam no histórico.
- **Reinício do app**: versão "gerando" sem geração viva neste processo (`server/registry.ts`) vira
  **interrompida** ao listar ("o app reiniciou durante a geração"), com Tentar novamente.

## Execução (`server/generate.ts`)

- Cada versão abre uma **sessão nova** do OpenCode (`metadata: { app: "opex", kind:
  "architect-diagram" }`) com as permissões só de leitura do Agente Adversário
  (`adversarial-agent/permission-policy.ts`); pedidos de permissão são decididos na hora pelo mesmo
  critério e perguntas são canceladas. A sessão é excluída no fim; se falhar, fica em
  `pendingSessionDeletion` e é tentada de novo na próxima geração da mesa.
- **Diretório**: o worktree da mesa quando já existe no host (conferido pelo shell do OpenCode com
  `git -C <worktree> rev-parse`); senão a base do repositório (`sessionDirectory` da central), com o
  prompt avisando que o plano descreve mudanças sobre ela.
- Cada chamada de preparo (cliente do OpenCode, sessões pendentes, central/worktree, tarefa, memórias,
  criação da sessão e instruções) tem prazo de 60 s (`ARCHITECT_SETUP_STEP_TIMEOUT_MS`): um serviço que
  aceita a conexão e não responde vira **falha** com o motivo ("… não respondeu em 60 s") e libera a
  mesa; a sessão criada depois do prazo é excluída. O turno do agente usa o tempo máximo da configuração.
- A sessão é excluída **antes** de gravar o desfecho, e o registro de execução só é liberado pela própria
  execução: "Tentar novamente" enquanto a anterior ainda encerra responde 409 `ARCHITECT_BUSY`.
- O id do turno é `architect:<diagramId>` (nunca o da mesa): o arquiteto roda junto com a
  implementação e não pode colidir com o turno vivo dela (chat ao vivo, reconexão).
- Instruções duráveis (`buildArchitectInstructions`, chave `opex-architect`): regras de leitura, escopo
  "somente o que o plano toca", o formato JSON com exemplo, as instruções adicionais, as **memórias**
  (`architectMemoryContext`: Memórias do Opex + lista `architect`) e o aprendizado autônomo (MCP
  "Memória própria", consumidor `arquiteto`).
- Pedido (`buildDiagramPrompt`): tarefa (código, título, descrição e especificação técnica), o plano
  aprovado da versão, o diretório e a diretiva do nível de profundidade; no ajuste, o grafo anterior e o
  pedido do usuário.
- Resposta sem diagrama legível (nenhum bloco ` ```architect ` com nós válidos, nem o JSON antigo):
  **uma** nova mensagem na mesma sessão pedindo o diagrama COMPLETO de novo (`buildRepairPrompt`, fase
  "refazendo o diagrama…"); o rascunho recomeça do ponto de partida (operação `reset`). Falhou de novo →
  `failed` com o motivo.
- Agente, modelo, variante e modelos de fallback da configuração (`runWithFallback`); tempo máximo
  configurável (3–60 min, padrão 15). Consumo em `ai_consumption_logs` com origem `architect-agent`
  ("Agente Arquiteto" no painel). O custo **não** soma no uso nem no apontamento da mesa (não é etapa).
- Progresso (fase, leituras, nós e ligações) vai pelo stream ao vivo; a mudança de fase também fica na
  versão e vai pelo Pusher (para quem não está com o stream aberto).

## Diagrama ao vivo (`stream-parser.ts`, `server/live-hub.ts`, `server/stream.ts`)

O diagrama é construído na tela enquanto o agente trabalha.

- **Formato**: o agente escreve OPERAÇÕES, uma linha JSON por operação, em blocos ` ```architect `
  (vários ao longo do turno, aos poucos: o objetivo, as camadas e os módulos logo depois de ler o
  plano; depois os nós e as arestas conforme confirma os caminhos): `meta`, `group`, `node`, `edge`,
  `note`, `remove` (corrigir algo emitido) e `done`. Sem nenhum bloco, vale o formato antigo (um JSON
  no fim, `parse.ts`).
- **Montador** (`createGraphAssembler`, puro, o mesmo `applyOps` no servidor e na tela): só aplica
  **linhas completas** (o pedaço que termina no meio de uma linha espera); cada linha é validada e
  normalizada ao chegar com as funções do saneamento — inválida é descartada com aviso, sem derrubar a
  geração; aresta cuja ponta ainda não chegou fica **pendente** e entra quando o nó chegar (as que
  sobram no fim saem com aviso); `node` repetido **mescla** os campos (o mais recente vence); grupo que
  chega depois é aplicado aos nós que o pediram. Teto com folga durante a geração (nível × 1,25,
  `ARCHITECT_LIVE_CAP_FACTOR`); no fim, o `sanitizeGraph` valida o resultado UMA vez e aplica o teto
  exato com a prioridade de sempre.
- **Ajuste**: o rascunho começa do grafo anterior (operação `reset`) e o agente emite só as diferenças.
- **Hub** (memória do processo): rascunho atual, `seq` das operações e assinantes. O rascunho também é
  gravado em `draft` com intervalo (no máximo a cada 1,5 s, `ARCHITECT_DRAFT_SAVE_MS`, com uma gravação
  no fim do intervalo); pronta ou descartada, o `draft` sai; falhou ou interrompida, ele fica como
  contexto (esmaecido atrás da mensagem de erro).
- **Stream** `GET /api/architect/diagrams/[id]/stream` (NDJSON, só o dono): `snapshot` (rascunho,
  progresso e o `seq` em que está) e depois `ops` numeradas, `progress`, `ping` a cada 15 s e `end` com o
  estado final. Assina antes do retrato (nenhuma operação cai entre os dois). Sem geração viva neste
  processo, o retrato vem do grafo/rascunho gravado e fecha com `end`. No fim, o grafo final vai como
  `reset` antes do `end`.
- **Cliente** (`useLiveDiagram`): abre o stream da versão gerando; aplica o retrato e as operações
  (`seq` repetido ou antigo é ignorado); caiu, reconecta (novo retrato, nada se perde) e a faixa mostra
  "Reconectando…"; no `end`, relê as versões da mesa.
  Um `end` com a versão ainda `running` (o stream abriu antes de a geração estar viva) não é fim: o
  cliente reconecta.

## Grafo (`graph.ts`, `sanitize.ts`, `parse.ts`)

Schema Zod único (`architectGraphSchema`), o mesmo no servidor e na tela:

- `title`, `summary`;
- `groups[]`: `id`, `label`, `layer` (`ui`, `routes`, `features`, `lib`, `data`, `external`, `other`), `detail`;
- `nodes[]`: `id`, `label`, `groupId`, `kind` (objetivo, módulo, rota, feature, lib, dado, externo,
  decisão, risco), `detail`, `files[]` (caminhos reais) e `status` (`new`, `changed`, `existing`);
- `edges[]`: `source`, `target`, `label` opcional e `kind` (`contains`, `uses`, `flow`, `event`, `data`);
- `notes[]`: decisões, riscos e dúvidas do plano.

Saneamento (`sanitizeGraph`): normaliza textos e ids, deduplica (vale o primeiro), troca grupo
inexistente por nenhum, valores fora da enumeração caem no padrão (`module`, `existing`, `uses`,
`other`), descarta arestas com ponta inexistente, laços e duplicadas, garante o nó do **objetivo**
(criado a partir do título), corta acima do teto do nível — prioridade: objetivo, depois o que o plano
cria, altera e o contexto existente; nas arestas, as relações antes do "contém" — e remove grupos
vazios. Textos do modelo (`ARCHITECT_TEXT_LIMITS`): o prompt pede um tamanho (ex.: descrição do nó até
4.000, nota até 500, resumo até 600) e o schema tem um **teto de proteção** separado e folgado (8.000,
1.000, 2.000…); só o que passa do teto é cortado, e todo corte — título, resumo, rótulos, descrições,
notas — vira aviso da versão ("nota: 2 corte(s) no teto de proteção de 1.000 caracteres"). O texto bruto guardado em `report` são os últimos 50.000
caracteres da resposta (`ARCHITECT_REPORT_MAX_CHARS`). Os cortes ficam em `trimmed` e `warnings` ("N nó(s) cortado(s) pelo teto do nível").

## Profundidade

| Nível | Rótulo | Conteúdo | Teto de nós | Teto de arestas |
|---|---|---|---|---|
| 1 | Visão geral | camadas e módulos principais | 8 | 12 |
| 2 | Resumido | módulos + integrações | 18 | 30 |
| 3 | Equilibrado (padrão) | + rotas, modelos e decisões | 35 | 60 |
| 4 | Detalhado | + componentes/arquivos e eventos | 70 | 120 |
| 5 | Minucioso | + campos, validações e riscos por nó | 120 | 200 |

O nível vira diretiva do prompt e teto validado no servidor. O padrão é da configuração; na aba da
mesa, o slider (`DepthControl`, sobre o `LeveledSlider` compartilhado com a criticidade do Adversário)
vale só para aquele pedido.

## Aba "Arquitetura (N)" da mesa (`components/workbench/`)

- Aparece depois de "Adversário (N)" quando a mesa tem versões ou quando o arquiteto se aplica e há
  plano aprovado (`useArchitectTab`). N = versões da mesa (sem as descartadas).
- Estados: **gerando antes do primeiro nó** (o canvas no formato final com o objetivo "fantasma"
  pulsando e a faixa de progresso), **ao vivo** (o diagrama crescendo), **pronto**,
  **falhou/interrompido** (erro, "A mesa segue normalmente", **Tentar novamente** e **Regerar com
  profundidade maior**) e **vazio** (slider + **Gerar arquitetura**, ou o motivo quando o arquiteto não
  se aplica).
- Seletor de versão com mais de uma: "Plano v2 · arquitetura v1" ("(atual)" na mais recente).
- Barra: visão (**Arquitetura** · **Mapa mental**, `OptionTabs`), **Filtros** (tipos de nó e "Só o que o
  plano cria/altera"; o objetivo fica sempre), **Exportar** (Copiar Mermaid, Copiar Markdown, Baixar
  imagem) e os dados da versão (plano, nível, data, custo, duração e cortes). Acima do canvas, título,
  resumo e as notas recolhíveis (com "Mostrar riscos e decisões").
- **Ao vivo**: o mesmo painel do diagrama pronto (`ArchitectDiagramPane`), então a chegada do grafo
  final NÃO remonta o canvas. O layout é recalculado a cada lote (espera de 250 ms) e os nós **deslizam**
  para as posições novas (`useAnimatedLayout`, Framer Motion, 300 ms); nó novo nasce no nó de onde veio
  (a origem da aresta que chega nele) e cresce; nó que sai encolhe e some; aresta nova se desenha com um
  **pulso de luz** que a percorre uma vez (`PathTraveler`, compartilhado com a rede do Engramind). A
  câmera **acompanha** o crescimento até o usuário mover a visão (botão **Acompanhar** religa). Durante a
  geração: sem arrastar, sem exportar, sem Restaurar layout e sem Pedir ajustes; hover, clique, painel,
  filtros, grupos e troca de visão funcionam. Com movimento reduzido: sem deslize, sem pulso e sem
  animação da câmera.
- Canvas com **React Flow** (`@xyflow/react`) no **fundo padrão do app** (tema compartilhado
  `src/components/flow/flow-theme.ts`: `bg-background` com o brilho violeta, pontos discretos e as
  variáveis `--xy-*` por tokens no `style` do elemento — inclusive minimapa e controles —, que vencem o
  cinza da folha do `colorMode="dark"`; grupos em `bg-primary/[0.03]` com borda tracejada da primária):
  - **Arquitetura**: `@dagrejs/dagre` composto, da esquerda para a direita, grupos como caixas
    (`layoutArchitecture`);
  - **Mapa mental**: árvore radial do `d3-hierarchy` a partir do objetivo (BFS sem direção; nós soltos
    viram filhos da raiz; arestas fora da árvore ficam mais apagadas) (`layoutMindMap`); o raio de
    cada anel cresce com a quantidade de nós dele (`ringRadii`: os vizinhos mais próximos ficam a pelo
    menos a largura de um cartão), então os cartões nunca se sobrepõem — nem em estrela de 120 nós;
  - nós com ícone por tipo e selo **Novo**/**Alterado**; hover destaca o nó, os vizinhos e as arestas
    dele e esmaece o resto; clique abre o **painel lateral** (descrição, arquivos com copiar, vizinhos
    clicáveis e "Recolher o grupo"), numa camada fora do viewport transformado; grupos recolhem pelo
    cabeçalho e expandem pelo nó recolhido (arestas agregadas "×N"); zoom, pan, minimapa, **Ajustar
    visão** e **Restaurar layout**;
  - **posições arrastadas ficam só no navegador** (`usePersistentState`,
    `opex:architect-positions:v1:<mesa>:<versão>:<visão>`), nunca no banco.
- Animações com Framer Motion: entrada dos nós por camada/anel, arestas se desenhando (`pathLength`),
  painel lateral e troca de visão/estado, todas respeitando movimento reduzido.
- **Pedir ajustes** (rodapé, mesmo padrão do feedback do plano, `FeedbackComposer` com o slider ao lado):
  cada envio gera uma versão nova com o grafo exibido como contexto. Só com o arquiteto aplicável.
- Mutações com resposta otimista (versão "gerando" na hora) e reversão com toast.

## Exportação (`mermaid.ts`)

- `toMermaid`: `flowchart LR`, um `subgraph` por grupo, ids seguros (`n1…`, `g1…`), forma do nó pelo
  tipo, setas pelo tipo da aresta e classes `new`/`changed`; rótulos entre aspas com `#quot;`, `#35;`,
  `#lt;`/`#gt;` e sem quebras de linha (o GitHub renderiza em issue/PR).
- `toMarkdown`: título, resumo, a cerca ` ```mermaid `, notas e a tabela de nós com arquivos.
- PNG do diagrama inteiro com `html-to-image` (`getNodesBounds` + `getViewportForBounds`), fundo do token.
  A seta de cada aresta é um `<marker>` dentro do SVG da própria aresta (dentro do viewport que o PNG
  clona), então a imagem leva as setas.
- Cópia por `copyText` (`src/lib/clipboard.ts`), com alternativa fora de contexto seguro.

## Configuração (`/integracoes/ia?aba=agente-arquiteto`)

Aba **Agente Arquiteto** (ícone `Network`), documento `{ feature: "architect-agent" }` em
`ai_feature_settings` (`architectSettingsSchema`, o mesmo na tela e na API; `withDefaults` completa
campos novos). Seções `OptionTabs` **Geral · Diagrama · Agente · Memórias · Histórico**, um Salvar (erro
de validação leva à seção do campo).

- **Geral**: ativação + disponibilidade, **Disparo** (Automático ao aprovar o plano — padrão — ou Manual)
  e **Centrais** (`ScopeCard` compartilhado com o Adversário e o Mentor).
- **Diagrama**: profundidade padrão, tipos de nó exibidos, mostrar arquivos, mostrar riscos/decisões e
  visão padrão.
- **Agente**: `AgentCard` compartilhado (agente, modelo, variante, fallbacks, tempo máximo e
  instruções adicionais).
- **Memórias**: aprendizado autônomo (`arquiteto`), a lista `architect` (canal `agentes/arquiteto` do
  Engramind, agente `opex/arquiteto`) e as Memórias do Opex.
- **Histórico**: as 50 versões mais recentes (tarefa, versão, nível, origem, situação, custo e duração).

## APIs

| Método e rota | Uso |
|---|---|
| `GET/PUT /api/ai/features/architect-agent` | Configuração |
| `GET /api/architect/workbenches/[id]/diagrams` | Versões da mesa (reconcilia órfãs) |
| `POST /api/architect/workbenches/[id]/diagrams` | Gerar (`{ depth? }`) ou ajustar (`{ feedback, depth?, baseDiagramId? }`) |
| `GET /api/architect/diagrams` | Histórico (sem o grafo) |
| `GET /api/architect/diagrams/[id]` | Uma versão |
| `GET /api/architect/diagrams/[id]/stream` | Diagrama ao vivo (NDJSON: `snapshot`, `ops`, `progress`, `ping`, `end`) |
| `POST /api/architect/diagrams/[id]/retry` | Tentar novamente (a mesma versão) |

Nenhuma é pública por token (fora da especificação OpenAPI).

## Dados, tempo real e auditoria

- Coleção `architect_diagrams` (`ArchitectDiagram`): mesa, tarefa, `version` (sequencial da mesa),
  `planVersion`/`planSeq`, `depth`, `origin` (`auto`, `manual`, `adjust`), `feedback`/`baseDiagramId`,
  `state` (`running`, `done`, `failed`, `interrupted`, `superseded`), `progress`, `graph`, `draft`, `trimmed`,
  `warnings`, `repaired`, `report`, `error`, `directory`, sessão e `usage`. Índices garantidos no
  primeiro uso.
- Tempo real: `architect-diagram-updated` (`{ workbenchId, diagramId }`) em `private-app`, só pelo
  servidor e depois de persistir e auditar (início, troca de fase e desfecho); `useArchitectRealtime`
  relê a mesa afetada e o histórico. O desenho ao vivo vai pelo stream NDJSON, não pelo Pusher.
- Auditoria `ArquiteturaPlano`: criação de cada versão, o desfecho e o "Tentar novamente".
