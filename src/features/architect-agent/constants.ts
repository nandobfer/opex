/** Constantes do Agente Arquiteto (módulo puro: tela e servidor). */

/** Configuração salva em `ai_feature_settings` (`feature: "architect-agent"`). */
export const ARCHITECT_FEATURE = "architect-agent"
/** Aba de `/integracoes/ia` com a configuração do agente. */
export const ARCHITECT_AI_TAB = "agente-arquiteto" as const
export const ARCHITECT_SETTINGS_HREF = `/integracoes/ia?aba=${ARCHITECT_AI_TAB}`

export const ARCHITECT_UPDATED_EVENT = "architect-diagram-updated"
export const ARCHITECT_AUDIT_ENTITY = "ArquiteturaPlano"
export const ARCHITECT_CONSUMPTION_ORIGIN = "architect-agent"
/** Chave da entrada durável de instruções na sessão do arquiteto (OpenCode). */
export const ARCHITECT_INSTRUCTIONS_KEY = "opex-architect"

export const ARCHITECT_TIMEOUT_MIN = 3
export const ARCHITECT_TIMEOUT_MAX = 60
export const ARCHITECT_TIMEOUT_DEFAULT = 15
/** Versões listadas no Histórico da configuração. */
export const ARCHITECT_HISTORY_LIMIT = 50
/** Arquivos guardados por nó (o resto é cortado no saneamento). */
export const ARCHITECT_NODE_FILES_MAX = 20
/** Teto de grupos (camadas) de um diagrama e tamanho máximo de um id (os mesmos do schema estrito). */
export const ARCHITECT_GROUPS_MAX = 40
export const ARCHITECT_ID_MAX = 80
/**
 * Textos do grafo vindos do modelo: `prompt` é o tamanho PEDIDO nas instruções; `max` é o teto de
 * PROTEÇÃO do schema, bem acima do pedido (o nível Minucioso pede campos, validações e riscos por nó).
 * Só o que passa do teto é cortado, sempre com aviso em `warnings` da versão.
 */
export const ARCHITECT_TEXT_LIMITS = {
    title: { label: "título", prompt: 100, max: 160 },
    summary: { label: "resumo", prompt: 600, max: 2_000 },
    nodeLabel: { label: "rótulo de nó", prompt: 60, max: 120 },
    detail: { label: "descrição de nó", prompt: 4_000, max: 8_000 },
    groupLabel: { label: "rótulo de grupo", prompt: 40, max: 80 },
    groupDetail: { label: "descrição de grupo", prompt: 300, max: 600 },
    edgeLabel: { label: "rótulo de aresta", prompt: 40, max: 80 },
    note: { label: "nota", prompt: 500, max: 1_000 },
} as const
export type ArchitectTextField = keyof typeof ARCHITECT_TEXT_LIMITS
/** Teto de proteção do `detail` de um nó (o prompt pede até `ARCHITECT_TEXT_LIMITS.detail.prompt`). */
export const ARCHITECT_NODE_DETAIL_MAX = ARCHITECT_TEXT_LIMITS.detail.max
/** Texto bruto da resposta guardado em `report` (o final, onde fica o bloco JSON). */
export const ARCHITECT_REPORT_MAX_CHARS = 50_000
/** Bloco do formato ao vivo: uma operação JSON por linha dentro de ` ```architect `. */
export const ARCHITECT_STREAM_FENCE = "architect"
/**
 * Folga do teto durante a geração ao vivo: o rascunho aceita até o teto do nível × 1,25 para não
 * cortar cedo um nó "novo" importante; o teto exato (com a prioridade de sempre) vale no fim.
 */
export const ARCHITECT_LIVE_CAP_FACTOR = 1.25
/** Intervalo mínimo entre as gravações do rascunho no banco (reconexão e abertura no meio da geração). */
export const ARCHITECT_DRAFT_SAVE_MS = 1_500
/** Agrupamento das operações enviadas ao navegador e espera do layout ao vivo. */
export const ARCHITECT_LIVE_BATCH_MS = 150
export const ARCHITECT_LIVE_LAYOUT_DEBOUNCE_MS = 250
/** Duração do deslize dos nós quando o layout ao vivo se reorganiza. */
export const ARCHITECT_LIVE_TWEEN_MS = 300
/** Prazo de cada chamada de preparo da geração (cliente, central, tarefa, sessão, instruções, memórias). */
export const ARCHITECT_SETUP_STEP_TIMEOUT_MS = 60_000

/** Profundidade (minuciosidade): diretiva do prompt e teto de nós/arestas validado no servidor. */
export const ARCHITECT_DEPTHS = [1, 2, 3, 4, 5] as const
export type ArchitectDepth = (typeof ARCHITECT_DEPTHS)[number]
export const ARCHITECT_DEPTH_DEFAULT: ArchitectDepth = 3

export const ARCHITECT_DEPTH_DEFS: Record<ArchitectDepth, { label: string; content: string; maxNodes: number; maxEdges: number; directive: string }> = {
    1: { label: "Visão geral", content: "camadas e módulos principais", maxNodes: 8, maxEdges: 12, directive: "Mostre só as camadas e os módulos principais que o plano toca. Nada de arquivos, rotas ou campos." },
    2: { label: "Resumido", content: "módulos + integrações", maxNodes: 18, maxEdges: 30, directive: "Mostre os módulos tocados e as integrações (serviços externos, eventos de tempo real, banco) de que eles dependem." },
    3: { label: "Equilibrado", content: "+ rotas, modelos e decisões", maxNodes: 35, maxEdges: 60, directive: "Além dos módulos e integrações, mostre as rotas/APIs, os modelos de dados e as decisões do plano." },
    4: { label: "Detalhado", content: "+ componentes/arquivos e eventos", maxNodes: 70, maxEdges: 120, directive: "Além do nível equilibrado, mostre os componentes e arquivos principais e os eventos (Pusher, rotinas, ganchos) que ligam as partes." },
    5: { label: "Minucioso", content: "+ campos, validações e riscos por nó", maxNodes: 120, maxEdges: 200, directive: "Detalhe ao máximo: em cada nó, descreva campos, validações e riscos no `detail`; inclua os riscos e decisões como nós próprios." },
}

export const ARCHITECT_NODE_KINDS = ["objective", "module", "route", "feature", "lib", "data", "external", "decision", "risk"] as const
export type ArchitectNodeKind = (typeof ARCHITECT_NODE_KINDS)[number]

export const ARCHITECT_NODE_KIND_LABELS: Record<ArchitectNodeKind, string> = {
    objective: "Objetivo",
    module: "Módulo",
    route: "Rota",
    feature: "Feature",
    lib: "Lib",
    data: "Dado",
    external: "Externo",
    decision: "Decisão",
    risk: "Risco",
}

export const ARCHITECT_NODE_STATUSES = ["new", "changed", "existing"] as const
export type ArchitectNodeStatus = (typeof ARCHITECT_NODE_STATUSES)[number]
export const ARCHITECT_NODE_STATUS_LABELS: Record<ArchitectNodeStatus, string> = { new: "Novo", changed: "Alterado", existing: "Existente" }

export const ARCHITECT_EDGE_KINDS = ["contains", "uses", "flow", "event", "data"] as const
export type ArchitectEdgeKind = (typeof ARCHITECT_EDGE_KINDS)[number]
export const ARCHITECT_EDGE_KIND_LABELS: Record<ArchitectEdgeKind, string> = { contains: "contém", uses: "usa", flow: "fluxo", event: "evento", data: "dados" }

export const ARCHITECT_GROUP_LAYERS = ["ui", "routes", "features", "lib", "data", "external", "other"] as const
export type ArchitectGroupLayer = (typeof ARCHITECT_GROUP_LAYERS)[number]
export const ARCHITECT_GROUP_LAYER_LABELS: Record<ArchitectGroupLayer, string> = { ui: "UI", routes: "Rotas/API", features: "Features", lib: "Lib", data: "Banco", external: "Externo", other: "Outros" }

export const ARCHITECT_NOTE_KINDS = ["decision", "risk", "question"] as const
export type ArchitectNoteKind = (typeof ARCHITECT_NOTE_KINDS)[number]
export const ARCHITECT_NOTE_KIND_LABELS: Record<ArchitectNoteKind, string> = { decision: "Decisão", risk: "Risco", question: "Dúvida" }

export const ARCHITECT_VIEWS = ["architecture", "mindmap"] as const
export type ArchitectView = (typeof ARCHITECT_VIEWS)[number]
export const ARCHITECT_VIEW_LABELS: Record<ArchitectView, string> = { architecture: "Arquitetura", mindmap: "Mapa mental" }

export const ARCHITECT_TRIGGERS = ["auto", "manual"] as const
export type ArchitectTrigger = (typeof ARCHITECT_TRIGGERS)[number]
export const ARCHITECT_TRIGGER_LABELS: Record<ArchitectTrigger, string> = { auto: "Automático ao aprovar o plano", manual: "Manual (botão Gerar arquitetura)" }

/** Origem de uma versão: automática (aprovação), manual (botão) ou ajuste (composer da aba). */
export const ARCHITECT_ORIGINS = ["auto", "manual", "adjust"] as const
export type ArchitectOrigin = (typeof ARCHITECT_ORIGINS)[number]
export const ARCHITECT_ORIGIN_LABELS: Record<ArchitectOrigin, string> = { auto: "Automática", manual: "Manual", adjust: "Ajuste" }

export const ARCHITECT_DIAGRAM_STATES = ["running", "done", "failed", "interrupted", "superseded"] as const
export type ArchitectDiagramState = (typeof ARCHITECT_DIAGRAM_STATES)[number]
export const ARCHITECT_DIAGRAM_STATE_LABELS: Record<ArchitectDiagramState, string> = {
    running: "Gerando",
    done: "Pronto",
    failed: "Falhou",
    interrupted: "Interrompido",
    superseded: "Descartada",
}

/** Fases do progresso exibidas enquanto o agente trabalha. */
export const ARCHITECT_PHASES = ["starting", "reading", "writing", "retrying"] as const
export type ArchitectPhase = (typeof ARCHITECT_PHASES)[number]
export const ARCHITECT_PHASE_LABELS: Record<ArchitectPhase, string> = {
    starting: "Abrindo a sessão do arquiteto…",
    reading: "Lendo o plano e o código…",
    writing: "Desenhando o diagrama…",
    retrying: "A resposta veio sem diagrama legível: refazendo o diagrama…",
}
