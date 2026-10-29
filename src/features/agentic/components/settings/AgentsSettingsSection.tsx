"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { AlertTriangle, Info } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { FormToggleCard } from "@/components/ui/toggle-card"
import type { AiFeatureAvailability } from "@/features/ai/types"
import type { AgenticSettings } from "../../schemas"
import { AgentRolesCard } from "./AgentRolesCard"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Subaba "Agentes": liga a feature e define os agentes padrão de cada etapa. */
export function AgentsSettingsSection({ form, availability }: { form: UseFormReturn<AgenticSettings>; availability: AiFeatureAvailability }) {
    const agents = useWatch({ control: form.control, name: "agents" })
    const dirty = form.formState.isDirty

    return (
        <>
            <Card>
                <CardContent className="space-y-3 pt-6">
                    <FormToggleCard<AgenticSettings>
                        bare
                        control={form.control}
                        name="enabled"
                        id="agentic-enabled"
                        label="Desenvolvimento agêntico"
                        description="Mesas de trabalho em que agentes do OpenCode planejam, implementam, sobem a prévia e abrem o PR de tarefas do projeto"
                    />
                    <AnimatePresence initial={false}>
                        {!dirty && !availability.available && availability.reason && (
                            <motion.p key="availability" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {availability.reason}
                            </motion.p>
                        )}
                    </AnimatePresence>
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span>
                            Os agentes executam comandos (git, docker, gh) na máquina do OpenCode a partir do conteúdo das tarefas e das revisões do PR. Pedidos de permissão e perguntas aparecem na mesa para você aprovar ou responder; confira as permissões
                            dos agentes no opencode.json.
                        </span>
                    </div>
                </CardContent>
            </Card>

            <AgentRolesCard
                title="Agentes padrão"
                description="Usados por todas as centrais; cada central pode personalizar uma etapa. Sem modelo, vale o modelo configurado no próprio agente."
                idPrefix="agentic-default"
                values={agents}
                onChange={(role, next) => form.setValue(`agents.${role}`, next ?? { agent: null, model: null, variant: null }, { shouldDirty: true, shouldValidate: true })}
            />
        </>
    )
}
