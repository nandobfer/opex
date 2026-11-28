"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AvailabilityNotice } from "@/components/feedback/AvailabilityNotice"
import { MetricsFiltersBar } from "@/components/metrics/MetricsFiltersBar"
import { AgentPageFrame } from "@/components/list/AgentPageFrame"
import { urlFilterCodecs, useUrlFilters, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { apiErrorMessage } from "@/lib/api"
import { agentDef } from "@/features/agent-metrics/catalog"
import { AGENT_METRICS_FILTER_SCHEMA, DEFAULT_AGENT_METRICS_FILTERS } from "@/features/agent-metrics/filters"
import { METRICS_PERIOD_LABELS, METRICS_PERIODS } from "@/features/agent-metrics/period"
import { chatDisabledReason, runDisabledReason } from "../../chat"
import { ROUTINE_AGENTS_PATH, routineRunPath } from "../../constants"
import { useRoutineAgent } from "../../hooks/useRoutineAgents"
import { useRoutineRealtime } from "../../hooks/useRoutineRealtime"
import { ChatWithAgentButton } from "../chat/ChatWithAgentButton"
import { RoutineChatColumn, useRoutineChatCollapsed } from "../chat/RoutineChatColumn"
import { RoutineAgentEditor } from "../editor/RoutineAgentEditor"
import { RoutineRunsTab } from "../runs/RoutineRunsTab"
import { RoutinePauseToggle } from "../schedule/RoutinePauseToggle"
import { RoutineScheduleIndicators } from "../schedule/RoutineScheduleIndicators"
import { RunNowDialog } from "../runs/RunNowDialog"
import { RoutineEntriesTab } from "./RoutineEntriesTab"
import { RoutineMemoriesTab } from "./RoutineMemoriesTab"
import { RoutineOverviewLayout, RoutineAgentPageSkeleton } from "./RoutineOverviewLayout"
import { RoutineOverviewTab } from "./RoutineOverviewTab"
import { RoutineSecretsTab } from "./secrets/RoutineSecretsTab"

const TABS = [
    { value: "visao-geral", label: "Visão geral" },
    { value: "execucoes", label: "Execuções" },
    { value: "entradas", label: "Entradas" },
    { value: "memorias", label: "Memórias" },
    { value: "segredos", label: "Segredos" },
]
// `execucao` só lê links antigos (a gaveta da execução virou página na OPE-208) para redirecioná-los.
const PAGE_DEFAULTS = { aba: "visao-geral", execucao: "", configurar: "" }
const PAGE_SCHEMA: UrlFilterSchema<typeof PAGE_DEFAULTS> = { aba: urlFilterCodecs.string(TABS.map((tab) => tab.value)), execucao: urlFilterCodecs.string(), configurar: urlFilterCodecs.string(["1"]) }
const PERIODS = METRICS_PERIODS.map((value) => ({ value, label: METRICS_PERIOD_LABELS[value] }))

export { chatDisabledReason, runDisabledReason }

/**
 * `/agentes-rotineiros/[id]` (OPE-130), no padrão das páginas de agente (`AgentPageFrame`): seta de voltar
 * para a lista (OPE-160), Configurar (abre o editor na própria página, D20), "Conversar" (OPE-160),
 * "Executar agora" e as abas na URL — Visão geral (filtro de período, KPIs e gráficos à esquerda e a
 * conversa com o agente à direita, recolhível), Execuções (cada uma abre a própria página, OPE-208), Entradas,
 * Memórias e Segredos. Atualiza em tempo real. Um link antigo com `?execucao=<id>` (da gaveta que existia antes)
 * é redirecionado para a página da execução.
 */
export function RoutineAgentPage({ id }: { id: string }) {
    const def = agentDef("rotineiros")
    const query = useRoutineAgent(id)
    useRoutineRealtime()
    const router = useRouter()
    const [{ aba, execucao, configurar }, setPage] = useUrlFilters(PAGE_DEFAULTS, PAGE_SCHEMA)
    useEffect(() => {
        if (execucao) router.replace(routineRunPath(id, execucao))
    }, [execucao, id, router])
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_AGENT_METRICS_FILTERS, AGENT_METRICS_FILTER_SCHEMA)
    const params = useMemo(() => ({ periodo: filters.periodo, ...(filters.de ? { de: filters.de } : {}), ...(filters.ate ? { ate: filters.ate } : {}) }), [filters.periodo, filters.de, filters.ate])
    const { collapsed, setCollapsed } = useRoutineChatCollapsed()
    if (query.isLoading) return <RoutineAgentPageSkeleton />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar o agente rotineiro" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const agent = query.data
    const provisioningNotice = agent.provisioning.status === "error" ? `Provisionamento com erro: ${agent.provisioning.error ?? ""} Use "Tentar de novo" em Configurar.` : null
    // "Conversar": vai para a Visão geral e expande a conversa (OPE-160).
    const openChat = () => {
        setPage((current) => ({ ...current, aba: "visao-geral" }))
        setCollapsed(false)
        requestAnimationFrame(() => document.querySelector('[data-testid="routine-chat"]')?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }))
    }
    return (
        <>
            <AgentPageFrame
                id={`rotineiro-${agent.slug}`}
                icon={def.icon}
                title={agent.title}
                description={agent.objective}
                backHref={ROUTINE_AGENTS_PATH}
                backLabel="Voltar para os agentes rotineiros"
                // D20: "Configurar" abre o editor aqui mesmo (`?configurar=1`), sem ir para a integração.
                onSettings={() => setPage((current) => ({ ...current, configurar: "1" }))}
                actions={
                    <>
                        <RoutinePauseToggle agent={agent} />
                        <ChatWithAgentButton disabledReason={chatDisabledReason(agent)} onOpen={openChat} />
                        <RunNowDialog agentId={agent.id} disabledReason={runDisabledReason(agent)} />
                    </>
                }
                notice={
                    <>
                        {/* OPE-213: gatilhos ligados e a próxima execução, acima das abas (visíveis em todas). */}
                        <RoutineScheduleIndicators agent={agent} />
                        <AvailabilityNotice reason={provisioningNotice} />
                    </>
                }
                tabs={TABS}
                tab={aba}
                onTabChange={(value) => setPage((current) => ({ ...current, aba: value }))}
            >
                {aba === "visao-geral" && (
                    <RoutineOverviewLayout
                        filters={<MetricsFiltersBar filters={filters} onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onClear={resetFilters} periods={PERIODS} customPeriod="custom" clients={null} repos={null} />}
                        chat={<RoutineChatColumn agent={agent} icon={def.icon} collapsed={collapsed} onCollapsedChange={setCollapsed} />}
                    >
                        <RoutineOverviewTab agentId={agent.id} params={params} />
                    </RoutineOverviewLayout>
                )}
                {aba === "execucoes" && <RoutineRunsTab agentId={agent.id} />}
                {aba === "entradas" && <RoutineEntriesTab agentId={agent.id} />}
                {aba === "memorias" && <RoutineMemoriesTab agent={agent} />}
                {aba === "segredos" && <RoutineSecretsTab agentId={agent.id} />}
            </AgentPageFrame>
            <RoutineAgentEditor agentId={agent.id} open={configurar === "1"} onClose={() => setPage((current) => ({ ...current, configurar: "" }))} />
        </>
    )
}
