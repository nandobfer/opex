import type { AgentId } from "../catalog"
import type { AgentMetricsQuery } from "../period"
import type { AgentMetricsDto, AgentMetricsPart } from "../types"
import { finalizeLineChart } from "../logic/common"
import { adversarialMetrics, architectMetrics, budgetMetrics, catalogMetrics, conversationMetrics, mentorMetrics, routineMetrics, refinerMetrics, reviewerMetrics } from "./agents"
import { createMetricsContext, filterOptions, lastUsedAt, usageOf, type MetricsContext } from "./context"
import { developerMetrics } from "./developer"
import { ensureFreshRuns } from "./usage-daily"
import { agentAvailability } from "./availability"

const USAGE_UNITS: Record<AgentId, string> = {
    opex: "respostas",
    maddox: "respostas",
    orcamentista: "gerações",
    catalogador: "gerações",
    refinador: "turnos",
    desenvolvedor: "turnos",
    arquiteto: "versões de diagrama",
    adversario: "rodadas",
    revisor: "revisões",
    mentor: "execuções",
    rotineiros: "execuções",
}

const COMPUTE: Record<AgentId, (ctx: MetricsContext) => Promise<AgentMetricsPart>> = {
    opex: (ctx) => conversationMetrics(ctx, "opex"),
    maddox: (ctx) => conversationMetrics(ctx, "maddox"),
    orcamentista: budgetMetrics,
    catalogador: catalogMetrics,
    refinador: refinerMetrics,
    desenvolvedor: developerMetrics,
    arquiteto: architectMetrics,
    adversario: adversarialMetrics,
    revisor: reviewerMetrics,
    mentor: mentorMetrics,
    rotineiros: routineMetrics,
}

/**
 * Visão geral de um agente (OPE-122): bloco comum (Último uso, Uso por data, opções dos filtros) e as
 * métricas próprias do agente, tudo calculado no servidor. Sincroniza antes as execuções recentes.
 */
export async function getAgentMetrics(agent: AgentId, query: AgentMetricsQuery, now: Date = new Date()): Promise<AgentMetricsDto> {
    await ensureFreshRuns(agent, now.getTime())
    const ctx = await createMetricsContext(agent, query, now)
    const [specific, usage, last, options, availability] = await Promise.all([COMPUTE[agent](ctx), usageOf(ctx), lastUsedAt(agent), filterOptions(), agentAvailability(agent)])
    return {
        agent,
        range: { from: ctx.range.from.toISOString(), to: ctx.range.to.toISOString() },
        bucketMode: ctx.mode,
        lastUsedAt: last,
        usageUnit: USAGE_UNITS[agent],
        usage,
        kpis: specific.kpis ?? [],
        lines: (specific.lines ?? []).map(finalizeLineChart),
        bars: specific.bars ?? [],
        baseCount: specific.baseCount ?? 0,
        baseLabel: specific.baseLabel ?? "",
        emptyReason: specific.emptyReason ?? "Sem dados no período.",
        notices: specific.notices ?? [],
        availability,
        clients: options.clients,
        projects: options.projects,
    }
}
