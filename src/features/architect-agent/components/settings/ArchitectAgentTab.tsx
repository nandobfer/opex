"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Info, Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { AgentCard, type AgentCardCopy } from "@/features/ai/components/agent-settings/AgentCard"
import { ScopeCard } from "@/features/ai/components/agent-settings/ScopeCard"
import { ARCHITECT_TIMEOUT_MAX, ARCHITECT_TIMEOUT_MIN } from "../../constants"
import { useArchitectSettings, useSaveArchitectSettings } from "../../hooks/useArchitect"
import { DEFAULT_ARCHITECT_SETTINGS, architectSettingsSchema, type ArchitectSettings } from "../../schemas"
import { DiagramCard } from "./DiagramCard"
import { HistorySection } from "./HistorySection"
import { MemoriesSection } from "./MemoriesSection"
import { TriggerCard } from "./TriggerCard"

type Section = "geral" | "diagrama" | "agente" | "memorias" | "historico"
const SECTIONS: { value: Section; label: string }[] = [
    { value: "geral", label: "Geral" },
    { value: "diagrama", label: "Diagrama" },
    { value: "agente", label: "Agente" },
    { value: "memorias", label: "Memórias" },
    { value: "historico", label: "Histórico" },
]
const AGENT_COPY: AgentCardCopy = {
    id: "architect",
    description: "Cada versão abre uma sessão NOVA do OpenCode no worktree da mesa (ou na base do repositório, se o worktree ainda não existe). O agente só lê o plano, a tarefa e o código.",
    timeoutLabel: "Tempo máximo da geração (minutos)",
    timeoutMin: ARCHITECT_TIMEOUT_MIN,
    timeoutMax: ARCHITECT_TIMEOUT_MAX,
    placeholder: "Ex.: destaque os eventos do Pusher; agrupe os componentes de UI por tela.",
    notice: "A geração roda sem ninguém para responder: o agente só tem permissão de leitura (edição, subagentes e comandos de teste, build, lint, instalação e escrita no git são negados) e perguntas são dispensadas. Falha, tempo esgotado ou resposta inválida nunca afetam a mesa.",
}
const sectionMotion = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.18 } }
const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Seção de um erro de validação (o Salvar leva até ela). */
export function sectionOfErrors(errors: Partial<Record<keyof ArchitectSettings, unknown>>): Section {
    if (errors.diagram) return "diagrama"
    if (errors.agent || errors.timeoutMinutes || errors.instructions) return "agente"
    return "geral"
}

/**
 * Aba "Agente Arquiteto" de `/integracoes/ia`: diagrama da arquitetura do plano aprovado, paralelo à
 * mesa. O formulário fica acima das seções; trocar de seção não descarta o rascunho e o Salvar grava
 * tudo (memórias e histórico leem/gravam na hora, fora do formulário).
 */
export function ArchitectAgentTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useArchitectSettings()
    const save = useSaveArchitectSettings()
    const form = useForm<ArchitectSettings>({ resolver: zodResolver(architectSettingsSchema), mode: "onChange", defaultValues: DEFAULT_ARCHITECT_SETTINGS })
    const dirty = form.formState.isDirty
    const [section, setSection] = useState<Section>("geral")

    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])

    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />

    const availability = query.data.availability
    const submit = form.handleSubmit(
        async (values) => {
            const saved = await save.mutateAsync(values).catch(() => null)
            if (saved) form.reset(saved.settings)
        },
        (errors) => {
            setSection(sectionOfErrors(errors))
            toast.error("Corrija os campos destacados antes de salvar")
        },
    )

    return (
        <>
            <OptionTabs<Section> id="architect-section" options={SECTIONS} value={section} onChange={setSection} className="w-full" />
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={section} {...sectionMotion} className="space-y-6">
                    {section === "geral" && (
                        <>
                            <Card>
                                <CardContent className="space-y-3 pt-6">
                                    <FormToggleCard<ArchitectSettings>
                                        control={form.control}
                                        name="enabled"
                                        id="architect-enabled"
                                        label="Agente Arquiteto"
                                        description="Ao aprovar o plano de uma mesa, um agente do OpenCode só leitura desenha a arquitetura do plano (camadas, módulos, rotas, dados e eventos) numa aba nova da mesa. Nunca bloqueia nem altera o desenvolvimento."
                                    />
                                    <AnimatePresence initial={false}>
                                        {!dirty && !availability.available && availability.reason && (
                                            <motion.p key="availability" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {availability.reason}
                                            </motion.p>
                                        )}
                                    </AnimatePresence>
                                </CardContent>
                            </Card>
                            <TriggerCard form={form} />
                            <ScopeCard form={form} id="architect" description="O arquiteto desenha só os planos das mesas das centrais escolhidas." listLabel="Centrais com o Agente Arquiteto" />
                        </>
                    )}
                    {section === "diagrama" && <DiagramCard form={form} />}
                    {section === "agente" && <AgentCard form={form} copy={AGENT_COPY} />}
                    {section === "memorias" && <MemoriesSection />}
                    {section === "historico" && <HistorySection />}
                </motion.div>
            </AnimatePresence>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => form.reset(query.data.settings)}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                </Button>
                <Button type="button" data-ctrl-enter-submit className="gap-1.5" disabled={(!dirty && !query.data.isDefault) || save.isPending} onClick={() => void submit()}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Salvar
                </Button>
            </div>
        </>
    )
}
