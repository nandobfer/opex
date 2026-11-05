"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { BASE_PATH } from "@/lib/base-path"
import { DEFAULT_ROUTINE_AGENT_INPUT, routineAgentInputSchema, type RoutineAgentInput } from "../../schemas"
import type { RoutineAgentDto } from "../../types"
import { useRoutineAgent, useSaveRoutineAgent } from "../../hooks/useRoutineAgents"
import { RoutineEngineFields } from "./RoutineEngineFields"
import { RoutineGeneralFields } from "./RoutineGeneralFields"
import { RoutineLimitsFields } from "./RoutineLimitsFields"
import { RoutineProvisioningPanel } from "./RoutineProvisioningPanel"
import { RoutineToolsFields } from "./RoutineToolsFields"
import { RoutineTriggersFields } from "./RoutineTriggersFields"

type Section = "geral" | "motor" | "ferramentas" | "limites" | "gatilhos" | "provisionamento"
const SECTIONS: { value: Section; label: string }[] = [
    { value: "geral", label: "Geral" },
    { value: "motor", label: "Motor" },
    { value: "ferramentas", label: "Ferramentas" },
    { value: "limites", label: "Limites" },
    { value: "gatilhos", label: "Gatilhos" },
    { value: "provisionamento", label: "Provisionamento" },
]
/** Seção que tem o primeiro erro (para levar o dono até ele ao salvar). */
const SECTION_OF_FIELD: Record<string, Section> = { name: "geral", objective: "geral", instructions: "geral", engine: "motor", opex: "motor", opencode: "motor", limits: "limites", triggers: "gatilhos" }

export const inputOfAgent = (agent: RoutineAgentDto): RoutineAgentInput => ({
    name: agent.name,
    objective: agent.objective,
    instructions: agent.instructions,
    engine: agent.engine,
    opex: agent.opex,
    opencode: agent.opencode,
    confirmIrreversible: agent.confirmIrreversible,
    limits: agent.limits,
    triggers: agent.triggers,
})

/**
 * Criar/editar um agente rotineiro (react-hook-form + o MESMO schema Zod da API). Ao criar, o subagente
 * de provisionamento roda sozinho; editar objetivo ou instruções não reprovisiona.
 */
export function RoutineAgentEditor({ agentId, open, onClose }: { agentId: string | null; open: boolean; onClose: () => void }) {
    const agent = useRoutineAgent(open ? agentId : null)
    const save = useSaveRoutineAgent()
    const [section, setSection] = useState<Section>("geral")
    const form = useForm<RoutineAgentInput>({ resolver: zodResolver(routineAgentInputSchema), mode: "onChange", defaultValues: DEFAULT_ROUTINE_AGENT_INPUT })
    const loaded = agent.data ?? null
    useEffect(() => {
        if (!open) return
        form.reset(agentId && loaded ? inputOfAgent(loaded) : DEFAULT_ROUTINE_AGENT_INPUT)
        // Recarrega só ao abrir ou ao trocar de agente (o tempo real não sobrescreve o que está sendo editado).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, agentId, loaded?.id])
    const sections = useMemo(() => SECTIONS.filter((item) => item.value !== "provisionamento" || Boolean(agentId)), [agentId])
    const webhookUrl = agentId && typeof window !== "undefined" ? `${window.location.origin}${BASE_PATH}/api/v1/routine-agents/${agentId}/runs` : null

    const submit = form.handleSubmit(
        (values) => save.mutate({ id: agentId, input: values }, { onSuccess: () => onClose() }),
        (errors) => {
            const first = Object.keys(errors)[0]
            if (first && SECTION_OF_FIELD[first]) setSection(SECTION_OF_FIELD[first])
        },
    )

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{agentId ? `Editar ${loaded?.title ?? "agente rotineiro"}` : "Novo agente rotineiro"}</DialogTitle>
                    <DialogDescription>Objetivo, motor, ferramentas, limites e gatilhos. A memória própria fica no Engramind (canal agentes/rotineiros/&lt;slug&gt;).</DialogDescription>
                </DialogHeader>
                {agentId && agent.isLoading ? (
                    <Skeleton className="h-96 w-full" />
                ) : (
                    <form id="routine-agent-form" onSubmit={submit} className="space-y-4">
                        <OptionTabs<Section> aria-label="Seções do agente rotineiro" className="w-full" options={sections} value={section} onChange={setSection} />
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                                {section === "geral" && <RoutineGeneralFields form={form} slug={loaded?.slug ?? null} generated={loaded?.generated} />}
                                {section === "motor" && <RoutineEngineFields form={form} editing={Boolean(agentId)} />}
                                {section === "ferramentas" && <RoutineToolsFields form={form} />}
                                {section === "limites" && <RoutineLimitsFields form={form} />}
                                {section === "gatilhos" && <RoutineTriggersFields form={form} webhookUrl={webhookUrl} />}
                                {section === "provisionamento" && loaded && <RoutineProvisioningPanel agent={loaded} />}
                            </motion.div>
                        </AnimatePresence>
                    </form>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button type="submit" form="routine-agent-form" disabled={save.isPending}>
                        {agentId ? "Salvar" : "Criar agente"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
