import { endOfDay, isValid, parseISO, startOfDay } from "date-fns"
import { z } from "zod"

/**
 * Consumo medido dos provedores de IA que não têm painel próprio (`ai_consumption_logs`).
 * O OpenCode e o JEV têm rotas e cards próprios; aqui ficam os provedores diretos
 * (Gemini, Anthropic, OpenAI e DeepSeek), que informam tokens mas não custo.
 */

const optionalDate = z.preprocess((value) => (value === "" || value === null ? undefined : value), z.iso.datetime({ offset: true, error: "Data inválida" }).optional())
export const usageQuerySchema = z.object({ from: optionalDate, to: optionalDate }).refine(
    (query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to),
    { message: "O início do período deve ser anterior ao fim", path: ["to"] },
)
export type UsageQuery = z.infer<typeof usageQuerySchema>

/** Datas do calendário são locais; a API recebe instantes ISO, incluindo o dia final inteiro. */
export function usageRangeQuery(from: string, to: string): UsageQuery | null {
    const convert = (value: string, end: boolean) => {
        if (!value) return undefined
        const date = parseISO(value)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValid(date)) return null
        return (end ? endOfDay(date) : startOfDay(date)).toISOString()
    }
    const start = convert(from, false)
    const end = convert(to, true)
    if (start === null || end === null) return null
    const parsed = usageQuerySchema.safeParse({ from: start, to: end })
    return parsed.success ? parsed.data : null
}

/** Provedores diretos com aba Consumo (o OpenCode e o JEV têm rotas fixas). */
export const USAGE_PROVIDER_IDS = ["gemini", "anthropic", "openai", "deepseek"] as const

export type UsageProviderId = (typeof USAGE_PROVIDER_IDS)[number]

export function isUsageProviderId(value: string): value is UsageProviderId {
    return (USAGE_PROVIDER_IDS as readonly string[]).includes(value)
}

/** Uma linha do painel: consumo de um recurso (feature ou agente) no período. */
export interface ProviderUsageRow {
    key: string
    label: string
    requests: number
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
}

export type ProviderUsageTotals = Omit<ProviderUsageRow, "key" | "label">

export interface ProviderUsageSummary {
    rows: ProviderUsageRow[]
    total: ProviderUsageTotals
    /** Início da cobertura: instante do registro mais antigo do provedor, independente do período. */
    coverageFrom: string | null
    /** Registros do período sem tokens de entrada (0 = medição completa da coluna). */
    missingInputRequests: number
    /** Registros do período sem tokens de saída (0 = medição completa da coluna). */
    missingOutputRequests: number
    /** Registros do período sem tokens totais (0 = medição completa). */
    missingTokenRequests: number
    /** Registros do período sem custo (0 = medição completa). */
    missingCostRequests: number
}

/** Rótulos dos recursos que consomem IA (feature, agente ou rotina). */
export const AI_CONSUMPTION_ORIGIN_LABELS: Record<string, string> = {
    "task-summary": "Resumos de tarefas",
    "task-tags": "Tags de tarefas",
    "budget-preview": "Orçamentos",
    "estimate-hours": "Estimar prazos",
    refinement: "Refinar tarefa",
    agentic: "Desenvolvimento agêntico (mesas)",
    "pr-review": "Agente Revisor",
    "adversarial-agent": "Agente Adversário",
    "architect-agent": "Agente Arquiteto",
    "adversarial-mentor-decision": "Agente Mentor (decisor)",
    "adversarial-mentor-writer": "Agente Mentor (redator)",
    "adversarial-mentor-router": "Agente Mentor (roteador)",
    "memory-curator": "Curador de memórias (migração para o Engramind)",
    "memory-summary": "Resumos de memórias (legado)",
    "opex-agent": "Agente Opex",
    "opex-title": "Agente Opex (títulos)",
    "opex-client-agent": "Agente Opex (portal)",
    "opex-client-title": "Agente Opex (portal, títulos)",
    "maddox-agent": "Agente Maddox",
    "maddox-title": "Agente Maddox (títulos)",
    "maddox-client-agent": "Agente Maddox (portal)",
    "maddox-client-title": "Agente Maddox (portal, títulos)",
    "service-ai": "Serviços (título, resumo e tags)",
    environments: "Ambientes",
}

export function aiConsumptionOriginLabel(origin: string): string {
    return AI_CONSUMPTION_ORIGIN_LABELS[origin] ?? origin
}

const UNITS = [
    { divisor: 1e12, suffix: "T" },
    { divisor: 1e9, suffix: "B" },
    { divisor: 1e6, suffix: "M" },
    { divisor: 1e3, suffix: "k" },
] as const

const compact = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 })

/**
 * Tokens abreviados com até 3 casas decimais, sem zeros à direita (`1000` → `1k`,
 * `1234` → `1,234k`, `2500000` → `2,5M`). Abaixo de mil o número aparece inteiro.
 */
export function formatTokensCompact(value: number): string {
    const unit = UNITS.find((candidate) => Math.abs(value) >= candidate.divisor)
    if (!unit) return compact.format(value)
    const scaled = value / unit.divisor
    // 999.999,6 tokens arredondam para 1.000k; promove para a unidade seguinte em vez de mostrar 1.000k.
    const index = UNITS.indexOf(unit)
    if (index > 0 && Math.abs(Number(scaled.toFixed(3))) >= 1000) {
        return `${compact.format(scaled / 1000)}${UNITS[index - 1].suffix}`
    }
    return `${compact.format(scaled)}${unit.suffix}`
}

/** Número completo, para o `title` das células abreviadas. */
export const formatTokens = (value: number) => new Intl.NumberFormat("pt-BR").format(value)

export const formatUsd = (value: number) => new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 9,
}).format(value)
