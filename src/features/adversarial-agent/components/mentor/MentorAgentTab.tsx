"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { GraduationCap, Info, Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import type { AiTab } from "@/features/ai/constants"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { MENTOR_AI_TAB } from "../../mentor/constants"
import { DEFAULT_MENTOR_SETTINGS, mentorSettingsSchema, type MentorSettings } from "../../mentor/schemas"
import type { AdversarialSettings } from "../../schemas"
import { useMentorSettings, useSaveMentorSettings } from "../../hooks/useMentor"
import { ScopeCard } from "../settings/ScopeCard"
import { MentorContextSection } from "./MentorContextSection"
import { MentorDeciderCard } from "./MentorDeciderCard"
import { MentorRouterCard } from "./MentorRouterCard"
import { MentorRunsSection } from "./MentorRunsSection"
import { MentorTriggersCard } from "./MentorTriggersCard"
import { MentorWriterCard } from "./MentorWriterCard"

/** Aba "Agente Mentor" de `/integracoes/ia` (logo depois da aba Agente Adversário). */
export const MENTOR_AI_TAB_DEF: IntegrationTabDef<AiTab> = { id: MENTOR_AI_TAB, label: "Agente Mentor", icon: GraduationCap }

type Section = "geral" | "contexto" | "execucoes"
const SECTIONS: { value: Section; label: string }[] = [
    { value: "geral", label: "Geral" },
    { value: "contexto", label: "Contexto" },
    { value: "execucoes", label: "Execuções" },
]
const sectionMotion = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.18 } }
const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Configuração do Agente Mentor: observa os turnos das mesas e os pedidos do agente desenvolvedor e
 * transforma lições relevantes em memórias do Agente Adversário. O formulário fica acima das seções
 * (trocar de seção não descarta o rascunho); as execuções leem na hora, fora do formulário.
 */
export function MentorAgentTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useMentorSettings()
    const save = useSaveMentorSettings()
    // Com o JEV: o decisor pode usá-lo (o redator só lista os provedores de texto).
    const { providers } = useAiProviderStatuses(true)
    const form = useForm<MentorSettings>({ resolver: zodResolver(mentorSettingsSchema), mode: "onChange", defaultValues: DEFAULT_MENTOR_SETTINGS })
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
            setSection(errors.context ? "contexto" : "geral")
            toast.error("Corrija os campos destacados antes de salvar")
        },
    )

    return (
        <>
            <OptionTabs<Section> id="mentor-section" options={SECTIONS} value={section} onChange={setSection} className="w-full" />
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={section} {...sectionMotion} className="space-y-6">
                    {section === "geral" && (
                        <>
                            <Card>
                                <CardContent className="space-y-3 pt-6">
                                    <FormToggleCard<MentorSettings>
                                        control={form.control}
                                        name="enabled"
                                        id="mentor-enabled"
                                        label="Agente Mentor"
                                        description="Observa os turnos das mesas e os pedidos do agente desenvolvedor e, quando há uma lição relevante, grava (ou funde) uma memória genérica do Agente Adversário. Roda em segundo plano: a mesa nunca espera."
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
                            <MentorTriggersCard form={form} />
                            <MentorDeciderCard form={form} providers={providers} />
                            <MentorRouterCard form={form} providers={providers} />
                            <MentorWriterCard form={form} providers={providers} />
                            {/* O cartão de centrais só usa `scope.*`, igual nas duas configurações. */}
                            <ScopeCard form={form as unknown as UseFormReturn<AdversarialSettings>} id="mentor" description="O Mentor avalia só as mesas das centrais escolhidas." listLabel="Centrais com o Agente Mentor" />
                        </>
                    )}
                    {section === "contexto" && <MentorContextSection form={form} />}
                    {section === "execucoes" && <MentorRunsSection />}
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
