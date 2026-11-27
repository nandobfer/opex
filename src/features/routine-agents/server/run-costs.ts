import type { Types } from "mongoose"
import { AiConsumption } from "@/lib/db/models/AiConsumption"
import type { ListCost } from "@/lib/ai/pricing/types"
import type { AiBilling } from "@/lib/ai/provider-cost"
import { stepEffectiveCost, sumStepCosts, type CostStepInput, type CostTotals, type StepCost } from "@/features/ai-billing/effective"
import { ROUTINE_CONSUMPTION_ORIGIN } from "../constants"
import type { RoutineCostBreakdownRow, RoutineCostDto } from "../types"
import { routineLog } from "./shared"

/**
 * Custos das execuções dos agentes rotineiros (OPE-203, motor Opex): lê os passos gravados em `ai_consumption_logs`
 * (`origin: routine-agent`, `subject: execução`), estima uma única vez os antigos sem custo de tabela (marcados
 * "estimado", sem a separação do cache) e deriva o custo efetivo pelo plano da chave que respondeu. Uma agregação só
 * para a lista de execuções, o detalhe, a Visão geral e a lista de agentes — os números nunca divergem.
 */

/** Passo do motor OpenCode (fora do escopo desta versão). */
const OUT_OF_SCOPE_PROVIDERS = new Set(["opencode"])

interface ConsumptionRow {
    _id: Types.ObjectId
    subject: string | null
    provider: string
    model: string
    apiKeyId?: string | null
    inputTokens: number | null
    outputTokens: number | null
    costUsd: number | null
    billing?: AiBilling | null
    listCost?: ListCost | null
    createdAt: Date
}

export interface RunStepCost {
    runId: string
    provider: string
    model: string
    cost: StepCost
}

export interface RunCostData {
    byRun: Map<string, CostTotals>
    steps: RunStepCost[]
}

const needsEstimate = (row: ConsumptionRow) => !row.listCost || (row.listCost.usd === null && !row.listCost.estimated)

/** Estimativa do histórico (preço atual, tokens de entrada e saída sem cache), gravada uma vez. */
async function estimateMissing(rows: ConsumptionRow[]): Promise<void> {
    const pending = rows.filter(needsEstimate)
    if (!pending.length) return
    const { createStepPricer } = await import("@/lib/ai/pricing/server")
    const groups = new Map<string, ConsumptionRow[]>()
    for (const row of pending) groups.set(`${row.provider}\u0000${row.model}`, [...(groups.get(`${row.provider}\u0000${row.model}`) ?? []), row])
    for (const group of groups.values()) {
        const { provider, model } = group[0]!
        const pricer = await createStepPricer({ provider, model }).catch(() => null)
        if (!pricer) continue
        const ops: Parameters<typeof AiConsumption.bulkWrite>[0] = []
        for (const row of group) {
            const priced = pricer.price({ input: row.inputTokens, noCache: null, cacheRead: null, cacheWrite: null, output: row.outputTokens, reasoning: null }, new Date(row.createdAt), row.billing ?? null)
            if (priced.usd === null) {
                row.listCost = row.listCost ?? priced
                continue
            }
            // O Go informa o custo de tabela na própria resposta: o valor é exato, não estimado.
            const listCost: ListCost = { ...priced, estimated: priced.source !== "opencode-go-response" }
            row.listCost = listCost
            ops.push({ updateOne: { filter: { _id: row._id, $or: [{ listCost: { $exists: false } }, { listCost: null }, { "listCost.usd": null, "listCost.estimated": { $ne: true } }] }, update: { $set: { listCost } } } })
        }
        if (ops.length) await AiConsumption.bulkWrite(ops).catch((error: unknown) => routineLog.warn({ err: error instanceof Error ? error.message : String(error) }, "[routine-agents] falha ao gravar a estimativa do custo de tabela"))
    }
}

function toStepInput(row: ConsumptionRow): CostStepInput {
    return {
        id: String(row._id),
        at: new Date(row.createdAt),
        provider: row.provider,
        model: row.model,
        apiKeyId: row.apiKeyId ?? null,
        listUsd: row.listCost?.usd ?? null,
        estimated: row.listCost?.estimated === true,
        allowanceUsd: row.billing?.allowanceUsd ?? null,
        // Go: `costUsd` = cobrado + cota; o uso extra (cobrado à parte) é a diferença.
        extraUsd: row.provider === "opencode-go" && typeof row.costUsd === "number" ? Math.max(0, row.costUsd - (row.billing?.allowanceUsd ?? 0)) : null,
    }
}

/** Custos das execuções informadas (passos do motor Opex). Execução sem passos não aparece no mapa. */
export async function computeRunCosts(runIds: readonly string[]): Promise<RunCostData> {
    const empty: RunCostData = { byRun: new Map(), steps: [] }
    if (!runIds.length) return empty
    const rows = await AiConsumption.find({ origin: ROUTINE_CONSUMPTION_ORIGIN, subject: { $in: [...runIds] } })
        .select({ subject: 1, provider: 1, model: 1, apiKeyId: 1, inputTokens: 1, outputTokens: 1, costUsd: 1, billing: 1, listCost: 1, createdAt: 1 })
        .lean<ConsumptionRow[]>()
    const inScope = rows.filter((row) => row.subject && !OUT_OF_SCOPE_PROVIDERS.has(row.provider))
    if (!inScope.length) return empty
    await estimateMissing(inScope)
    const inputs = inScope.map(toStepInput)
    const { buildBillingLookup } = await import("@/features/ai-billing/server/billing-context")
    const lookup = await buildBillingLookup(inputs)
    const steps: RunStepCost[] = inScope.map((row, index) => ({ runId: row.subject!, provider: row.provider, model: row.model, cost: stepEffectiveCost(inputs[index]!, lookup) }))
    const grouped = new Map<string, StepCost[]>()
    for (const step of steps) grouped.set(step.runId, [...(grouped.get(step.runId) ?? []), step.cost])
    return { byRun: new Map([...grouped].map(([runId, costs]) => [runId, sumStepCosts(costs)])), steps }
}

export function toCostDto(totals: CostTotals): RoutineCostDto {
    return {
        listUsd: totals.listUsd,
        listBrl: totals.listBrl,
        effectiveUsd: totals.effectiveUsd,
        effectiveBrl: totals.effectiveBrl,
        savingsUsd: totals.savingsUsd,
        savingsBrl: totals.savingsBrl,
        partial: totals.partial,
        brlPartial: totals.brlPartial,
        missingPrices: totals.missingPrices,
        estimated: totals.estimated,
        notices: totals.notices,
    }
}

const PROVIDER_LABELS: Record<string, string> = { gemini: "Gemini", anthropic: "Anthropic", openai: "OpenAI", deepseek: "DeepSeek", "opencode-go": "OpenCode Go", "command-code": "Command Code" }

/** Divisão do custo por uma dimensão, do maior custo efetivo (ou de tabela) para o menor. */
export function breakdownBy(steps: readonly RunStepCost[], keyOf: (step: RunStepCost) => { key: string; label: string }): RoutineCostBreakdownRow[] {
    const groups = new Map<string, { label: string; costs: StepCost[] }>()
    for (const step of steps) {
        const { key, label } = keyOf(step)
        const group = groups.get(key) ?? { label, costs: [] }
        group.costs.push(step.cost)
        groups.set(key, group)
    }
    return [...groups.entries()]
        .map(([key, group]) => {
            const totals = sumStepCosts(group.costs)
            return { key, label: group.label, listUsd: totals.listUsd, effectiveUsd: totals.effectiveUsd, listBrl: totals.listBrl, effectiveBrl: totals.effectiveBrl, partial: totals.partial }
        })
        .sort((a, b) => (b.effectiveUsd ?? b.listUsd ?? 0) - (a.effectiveUsd ?? a.listUsd ?? 0))
}

export function costBreakdown(steps: readonly RunStepCost[]) {
    return {
        providers: breakdownBy(steps, (step) => ({ key: step.provider, label: PROVIDER_LABELS[step.provider] ?? step.provider })),
        models: breakdownBy(steps, (step) => ({ key: `${step.provider}/${step.model}`, label: `${step.model} (${PROVIDER_LABELS[step.provider] ?? step.provider})` })),
        plans: breakdownBy(steps, (step) => ({ key: `${step.provider}:${step.cost.planLabel}`, label: `${PROVIDER_LABELS[step.provider] ?? step.provider} · ${step.cost.planLabel}` })),
    }
}
