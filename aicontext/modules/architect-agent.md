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
- O id do turno é `architect:<diagramId>` (nunca o da mesa): o arquiteto roda junto com a
  implementação e não pode colidir com o turno vivo dela (chat ao vivo, reconexão).
- Instruções duráveis (`buildArchitectInstructions`, chave `opex-architect`): regras de leitura, escopo
  "somente o que o plano toca", o formato JSON com exemplo, as instruções adicionais, as **memórias**
  (`architectMemoryContext`: Memórias do Opex + lista `architect`) e o aprendizado autônomo (MCP
  "Memória própria", consumidor `arquiteto`).
- Pedido (`buildDiagramPrompt`): tarefa (código, título, descrição e especificação técnica), o plano
  aprovado da versão, o diretório e a diretiva do nível de profundidade; no ajuste, o grafo anterior e o
  pedido do usuário.
- Resposta sem JSON válido: **uma** nova mensagem na mesma sessão (`buildRepairPrompt`, fase "A resposta
  veio inválida…"); falhou de novo → `failed` com o motivo.
- Agente, modelo, variante e modelos de fallback da configuração (`runWithFallback`); tempo máximo
  configurável (3–60 min, padrão 15). Consumo em `ai_consumption_logs` com origem `architect-agent`
  ("Agente Arquiteto" no painel). O custo **não** soma no uso nem no apontamento da mesa (não é etapa).
- Progresso (fase e quantidade de leituras) fica na própria versão e vai pelo Pusher com intervalo
  mínimo de 3 s; a aba nunca desenha grafo parcial.

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
vazios. Os cortes ficam em `trimmed` e `warnings` ("N nó(s) cortado(s) pelo teto do nível").

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
- Estados: **gerando** (skeleton no formato do canvas, com a fase e as leituras), **pronto**,
  **falhou/interrompido** (erro, "A mesa segue normalmente", **Tentar novamente** e **Regerar com
  profundidade maior**) e **vazio** (slider + **Gerar arquitetura**, ou o motivo quando o arquiteto não
  se aplica).
- Seletor de versão com mais de uma: "Plano v2 · arquitetura v1" ("(atual)" na mais recente).
- Barra: visão (**Arquitetura** · **Mapa mental**, `OptionTabs`), **Filtros** (tipos de nó e "Só o que o
  plano cria/altera"; o objetivo fica sempre), **Exportar** (Copiar Mermaid, Copiar Markdown, Baixar
  imagem) e os dados da versão (plano, nível, data, custo, duração e cortes). Acima do canvas, título,
  resumo e as notas recolhíveis (com "Mostrar riscos e decisões").
- Canvas com **React Flow** (`@xyflow/react`), cores só por tokens (classe `architect-flow` no
  `globals.css`):
  - **Arquitetura**: `@dagrejs/dagre` composto, da esquerda para a direita, grupos como caixas
    (`layoutArchitecture`);
  - **Mapa mental**: árvore radial do `d3-hierarchy` a partir do objetivo (BFS sem direção; nós soltos
    viram filhos da raiz; arestas fora da árvore ficam mais apagadas) (`layoutMindMap`);
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
| `POST /api/architect/diagrams/[id]/retry` | Tentar novamente (a mesma versão) |

Nenhuma é pública por token (fora da especificação OpenAPI).

## Dados, tempo real e auditoria

- Coleção `architect_diagrams` (`ArchitectDiagram`): mesa, tarefa, `version` (sequencial da mesa),
  `planVersion`/`planSeq`, `depth`, `origin` (`auto`, `manual`, `adjust`), `feedback`/`baseDiagramId`,
  `state` (`running`, `done`, `failed`, `interrupted`, `superseded`), `progress`, `graph`, `trimmed`,
  `warnings`, `repaired`, `report`, `error`, `directory`, sessão e `usage`. Índices garantidos no
  primeiro uso.
- Tempo real: `architect-diagram-updated` (`{ workbenchId, diagramId }`) em `private-app`, só pelo
  servidor e depois de persistir e auditar; `useArchitectRealtime` relê a mesa afetada e o histórico.
- Auditoria `ArquiteturaPlano`: criação de cada versão, o desfecho e o "Tentar novamente".
