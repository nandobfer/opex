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
import { DEFAULT_ADVERSARIAL_SETTINGS, adversarialSettingsSchema, type AdversarialSettings } from "../../schemas"
import { useAdversarialSettings, useSaveAdversarialSettings } from "../../hooks/useAdversarial"
import { AgentCard, type AgentCardCopy } from "@/features/ai/components/agent-settings/AgentCard"
import { ScopeCard } from "@/features/ai/components/agent-settings/ScopeCard"
import { ADVERSARIAL_TIMEOUT_MAX, ADVERSARIAL_TIMEOUT_MIN } from "../../constants"
import { ContextSection } from "./ContextSection"
import { CriticalityCard } from "./CriticalityCard"
import { FlowCard } from "./FlowCard"
import { MemoriesSection } from "./MemoriesSection"
import { ReviewsSection } from "./ReviewsSection"

type Section = "geral" | "contexto" | "memorias" | "revisoes"
const SECTIONS: { value: Section; label: string }[] = [
    { value: "geral", label: "Geral" },
    { value: "contexto", label: "Contexto" },
    { value: "memorias", label: "Memórias" },
    { value: "revisoes", label: "Revisões" },
]
const AGENT_COPY: AgentCardCopy = {
    id: "adversarial",
    description: "Cada rodada abre uma sessão NOVA do OpenCode no worktree da mesa, sem o histórico do implementador. O agente só lê o código: nunca roda testes, build, lint ou typecheck.",
    timeoutLabel: "Tempo máximo da revisão (minutos)",
    timeoutMin: ADVERSARIAL_TIMEOUT_MIN,
    timeoutMax: ADVERSARIAL_TIMEOUT_MAX,
    placeholder: "Ex.: dê atenção a permissões e a migrações; ignore arquivos gerados.",
    notice: "A revisão roda sem ninguém para responder: o agente só tem permissão de leitura (edição, subagentes e comandos de teste, build, lint, instalação e escrita no git são negados) e perguntas são dispensadas.",
}
const sectionMotion = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.18 } }
const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Aba "Agente Adversário" de `/integracoes/ia`: revisor com contexto limpo ao fim da implementação da mesa.
 * O formulário fica acima das seções: trocar de seção não descarta o rascunho e o Salvar grava tudo
 * (a lista de memórias e o histórico salvam/leem na hora, fora do formulário).
 */
export function AdversarialAgentTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useAdversarialSettings()
    const save = useSaveAdversarialSettings()
    const form = useForm<AdversarialSettings>({ resolver: zodResolver(adversarialSettingsSchema), mode: "onChange", defaultValues: DEFAULT_ADVERSARIAL_SETTINGS })
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
            // O erro pode estar noutra seção: leva até ela.
            const target: Section = errors.context ? "contexto" : "geral"
            setSection(target)
            toast.error("Corrija os campos destacados antes de salvar")
        },
    )

    return (
        <>
            <OptionTabs<Section> id="adversarial-section" options={SECTIONS} value={section} onChange={setSection} className="w-full" />
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={section} {...sectionMotion} className="space-y-6">
                    {section === "geral" && (
                        <>
                            <Card>
                                <CardContent className="space-y-3 pt-6">
                                    <FormToggleCard<AdversarialSettings>
                                        control={form.control}
                                        name="enabled"
                                        id="adversarial-enabled"
                                        label="Agente Adversário"
                                        description="Ao fim de cada implementação da mesa, um agente do OpenCode com contexto limpo revisa o código antes da prévia ou do Pull Request. Não roda testes: o implementador já deixou tudo verde."
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
                            <CriticalityCard form={form} />
                            <FlowCard form={form} />
                            <AgentCard form={form} copy={AGENT_COPY} />
                            <ScopeCard form={form} id="adversarial" description="Ao fim de cada implementação nas centrais escolhidas, o adversário revisa antes da prévia (ou do Pull Request, no fluxo PR automático)." listLabel="Centrais com o agente adversário" />
                        </>
                    )}
                    {section === "contexto" && <ContextSection form={form} />}
                    {section === "memorias" && <MemoriesSection />}
                    {section === "revisoes" && <ReviewsSection />}
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
