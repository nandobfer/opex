"use client"

import { urlFilterCodecs, useUrlFilters, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { useRoutineRealtime } from "../../hooks/useRoutineRealtime"
import { RoutineAgentEditor } from "../editor/RoutineAgentEditor"
import { RoutineAgentsSection } from "./RoutineAgentsSection"
import { RoutineProvisioningModelCard } from "./RoutineProvisioningModelCard"

const NEW = "novo"
const DEFAULTS = { agente: "" }
const SCHEMA: UrlFilterSchema<{ agente: string }> = { agente: urlFilterCodecs.string() }

/**
 * Aba **Rotineiros** de Integrações › Inteligência Artificial (OPE-130): modelo do subagente de
 * provisionamento, lista dos agentes rotineiros e o editor (`?agente=<id>` ou `?agente=novo`, que a
 * página do agente usa no "Configurar"). Salva sozinha (cada ação grava na hora), com tempo real.
 */
export function RoutineAgentsTab() {
    const [{ agente }, setParams] = useUrlFilters(DEFAULTS, SCHEMA)
    useRoutineRealtime()
    const close = () => setParams({ agente: "" })
    return (
        <div className="flex flex-col gap-6">
            <RoutineAgentsSection onEdit={(id) => setParams({ agente: id })} onNew={() => setParams({ agente: NEW })} />
            <RoutineProvisioningModelCard />
            <RoutineAgentEditor key={agente || "fechado"} open={Boolean(agente)} agentId={agente && agente !== NEW ? agente : null} onClose={close} />
        </div>
    )
}
