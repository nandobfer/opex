/** Constantes das features de IA (módulo puro). */

import type { AiProviderId } from "@/lib/ai/providers"

/** Abas da página "Inteligência Artificial". `provedores` é a padrão (omitida da URL). */
export const AI_TABS = ["provedores", "entender-tarefas", "resumos-tarefas", "tags-tarefas", "orcamentos", "estimar-prazos", "refinar-tarefa", "revisao-pr", "desenvolvimento-agentico", "agente-maddox", "agente-opex", "agente-adversario", "agente-mentor"] as const
export type AiTab = (typeof AI_TABS)[number]

/**
 * Abas da página de um provedor de IA (`/integracoes/ia/opencode`). `configuracao` é a padrão
 * (omitida da URL). Gemini, Anthropic, OpenAI e DeepSeek não têm consumo próprio medido aqui, então não
 * têm a aba Consumo. `contas` (contas dos providers do servidor), `controles` (serviço) e os recursos
 * (`skills`, `agentes`, `comandos`, `plugins`, `mcps`) são só do OpenCode.
 */
export const AI_PROVIDER_TABS = ["configuracao", "controles", "modelos", "contas", "skills", "agentes", "comandos", "plugins", "mcps", "consumo"] as const
export type AiProviderTab = (typeof AI_PROVIDER_TABS)[number]

/** Abas mostradas em cada provedor. [`configuracao`, `modelos`] ou com `consumo`. */
export const AI_PROVIDER_TAB_IDS: Record<AiProviderId, readonly AiProviderTab[]> = {
    opencode: ["configuracao", "controles", "modelos", "contas", "skills", "agentes", "comandos", "plugins", "mcps", "consumo"],
    gemini: ["configuracao", "modelos"],
    anthropic: ["configuracao", "modelos"],
    openai: ["configuracao", "modelos"],
    deepseek: ["configuracao", "modelos"],
    jev: ["configuracao", "modelos", "consumo"],
}

/** Features do app que usam IA (uma configuração salva por feature). */
export const AI_FEATURE_IDS = ["understand-task", "task-summary", "task-tags", "budget-preview", "estimate-hours", "task-refinement", "pr-review"] as const
export type AiFeatureId = (typeof AI_FEATURE_IDS)[number]

export const AI_AUDIT_ENTITY = "FeatureIA"

/** Evento em `private-app` quando a configuração de uma feature muda. Payload: `{ feature }`. */
export const AI_FEATURE_UPDATED_EVENT = "ai-feature-updated"

// ── Memórias dos agentes ───────────────────────────────────────────────────────

export const AI_MEMORY_AUDIT_ENTITY = "MemoriaAgente"
/** Evento no canal da integração "Inteligência Artificial" quando as memórias de uma lista mudam. Payload: `{ agentId, centralId?, clientId? }`. */
export const AI_MEMORIES_UPDATED_EVENT = "ai-memories-updated"

export const UNDERSTAND_TASK_FORMATS = ["sections", "free"] as const
export type UnderstandTaskFormat = (typeof UNDERSTAND_TASK_FORMATS)[number]

export const UNDERSTAND_TASK_FORMAT_LABELS: Record<UnderstandTaskFormat, string> = {
    sections: "Seções fixas",
    free: "Texto livre",
}

/** Seções pedidas no formato "Seções fixas". */
export const UNDERSTAND_TASK_SECTIONS = ["Resumo", "O que precisa ser feito", "Pontos de atenção e riscos", "Dúvidas para o solicitante"] as const

export const DEFAULT_UNDERSTAND_TASK_INSTRUCTIONS = [
    "Você é um analista de desenvolvimento sênior que ajuda um desenvolvedor a entender uma tarefa do Centro de Desenvolvimento antes de começar.",
    "Explique em português do Brasil, de forma objetiva, o que a tarefa pede, o contexto de negócio e o que precisa ser entregue.",
    "Use os comentários e o histórico para identificar decisões, mudanças de escopo e pendências. Não invente requisitos: quando algo não estiver claro, aponte como dúvida.",
].join("\n")

export const UNDERSTAND_TASK_INCLUDE_LABELS = {
    comments: { label: "Comentários", description: "Data e texto de cada comentário" },
    history: { label: "Histórico", description: "Mudanças de coluna, prioridade e campos" },
    timeLogs: { label: "Apontamentos de horas", description: "Quando e a descrição" },
} as const

// ── Resumos de tarefas ───────────────────────────────────────────────────────

/** Faixa do tamanho (caracteres) de um resumo de 1 linha. */
export const TASK_SUMMARY_MAX_LENGTH_MIN = 40
export const TASK_SUMMARY_MAX_LENGTH_MAX = 400
export const TASK_SUMMARY_MAX_LENGTH_DEFAULT = 140

export const DEFAULT_TASK_SUMMARY_INSTRUCTIONS = [
    "Você resume tarefas de desenvolvimento para um quadro kanban.",
    "Escreva em português do Brasil, com linguagem direta, o objetivo central da tarefa em UMA única linha.",
    "Não use Markdown, listas, aspas nem ponto final. Não repita o título.",
].join("\n")

// ── Tags de tarefas ──────────────────────────────────────────────

export const DEFAULT_TASK_TAGS_INSTRUCTIONS = [
    "Você classifica tarefas de desenvolvimento com tags de uma taxonomia fechada.",
    "Escolha as tags que melhor descrevem do que a tarefa trata, usando apenas os ids fornecidos.",
    "Prefira poucas tags relevantes; não marque tags só por proximidade. Use [] quando nenhuma se aplicar.",
].join("\n")

// ── Orçamentos (prévia do portal do cliente) ─────────────────────────────

export const DEFAULT_BUDGET_PREVIEW_INSTRUCTIONS = [
    "Você é um analista de desenvolvimento sênior que interpreta pedidos de clientes e prepara uma tarefa para o time.",
    "Leia a descrição do cliente, categorizando o tipo, a prioridade, um título curto e uma especificação técnica objetiva.",
    "Na especificação técnica, escreva sempre as seções '## Critérios de aceite' (o que define a tarefa como concluída) e '## Localização' (página/tela, rota e parte da interface), com o que a descrição permitir.",
    "Avalie também a clareza da descrição: se ela explicita os critérios de aceite e a localização, ou se estão vagos ou ausentes.",
    "Escreva em português do Brasil.",
    "Não invente requisitos: quando a descrição for ambígua, faça a interpretação mais razoável.",
].join("\n")

// ── Estimar prazos (tarefas semelhantes já no prompt) ──────────────────────

export const DEFAULT_ESTIMATE_HOURS_INSTRUCTIONS = [
    "Você estima o TEMPO DE EXECUÇÃO (em horas) de uma tarefa, para fins de orçamento.",
    "Use as horas reais apontadas nas tarefas semelhantes como referência principal: a estimativa deve ficar próxima da mediana do histórico.",
    "Só se afaste da mediana quando a tarefa for claramente maior ou menor que as semelhantes.",
    "Responda em português do Brasil.",
].join("\n")

// ── Agente Refinador (agente OpenCode que faz perguntas até a spec ficar clara) ─

export const DEFAULT_TASK_REFINEMENT_INSTRUCTIONS = [
    "Você é um agente de refinamento técnico que ajuda um desenvolvedor a esclarecer uma tarefa antes de implementá-la.",
    "Leia a tarefa inteira (descrição, especificação atual, comentários e histórico) e conduza o esclarecimento com perguntas objetivas, uma rodada por vez.",
    "Não invente requisitos: quando algo não estiver claro, pergunte em vez de supor.",
    "Escreva em português do Brasil.",
].join("\n")

/** Origem das instruções do Agente Refinador: o texto configurado ou uma skill do OpenCode. */
export const REFINEMENT_INSTRUCTIONS_SOURCES = ["text", "skill"] as const
export type RefinementInstructionsSource = (typeof REFINEMENT_INSTRUCTIONS_SOURCES)[number]

export const REFINEMENT_INSTRUCTIONS_SOURCE_LABELS: Record<RefinementInstructionsSource, string> = {
    text: "Texto",
    skill: "Skill do OpenCode",
}

/** O que, além dos dados principais, entra na entrada do refinamento. */
export const REFINEMENT_INCLUDE_LABELS = {
    comments: { label: "Comentários", description: "Data e texto de cada comentário" },
    history: { label: "Histórico", description: "Mudanças de coluna, prioridade e campos" },
} as const
