"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm, useWatch, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { isAiTextProviderId, type AiProviderId } from "@/lib/ai/providers"
import { DEFAULT_PLUGIN_VERSION_SUMMARY_INSTRUCTIONS } from "../../constants"
import { DEFAULT_PLUGIN_VERSION_SUMMARY_SETTINGS, pluginVersionSummarySettingsSchema, type PluginVersionSummarySettings } from "../../schemas"
import { useAiProviderStatuses, usePluginVersionSummarySettings, useSavePluginVersionSummarySettings } from "../../hooks/useAi"
import { ProviderModelCard } from "../shared/ProviderModelCard"
import { PromptSamplingFieldsBlock, type PromptSamplingFields } from "../shared/PromptSamplingFields"
import { useFeatureSection, type FeatureSectionProps } from "../shared/feature-section"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Seção "Descritivo de versão de plugin" (OPE-172): provedor, modelo e instruções do texto em
 * linguagem natural que descreve a mudança de uma versão para a anterior ("Gerar descritivo" na
 * página do plugin, quando o agente da mesa não escreveu um).
 */
export function PluginVersionSummarySection({ ref, onStateChange }: FeatureSectionProps) {
    const query = usePluginVersionSummarySettings()
    const save = useSavePluginVersionSummarySettings()
    const { providers } = useAiProviderStatuses()
    const form = useForm<PluginVersionSummarySettings>({ resolver: zodResolver(pluginVersionSummarySettingsSchema), mode: "onChange", defaultValues: DEFAULT_PLUGIN_VERSION_SUMMARY_SETTINGS })
    const dirty = form.formState.isDirty
    const provider = useWatch({ control: form.control, name: "provider" })

    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    useFeatureSection(ref, { form, data: query.data, save: save.mutateAsync, pending: save.isPending, onStateChange })

    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />

    const availability = query.data.availability
    const changeProvider = (next: AiProviderId) => {
        if (next === provider || !isAiTextProviderId(next)) return
        form.setValue("provider", next, { shouldDirty: true, shouldValidate: true })
        form.setValue("model", null, { shouldDirty: true, shouldValidate: true })
        form.setValue("variant", null, { shouldDirty: true })
        form.setValue("agent", null, { shouldDirty: true })
    }

    return (
        <>
            <Card>
                <CardContent className="space-y-3 pt-6">
                    <FormToggleCard<PluginVersionSummarySettings>
                        control={form.control}
                        name="enabled"
                        id="ai-plugin-version-summary-enabled"
                        label="Descritivo de versão de plugin"
                        description="Escreve com IA, a partir da diferença das fontes, o que mudou numa versão de plugin em relação à anterior (botão Gerar descritivo, quando o agente da mesa não escreveu um)"
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

            <ProviderModelCard form={form} providers={providers} onProviderChange={changeProvider} />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Descritivo</CardTitle>
                    <CardDescription>Como a IA descreve a mudança. A diferença das fontes entre as duas versões é enviada como entrada.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <PromptSamplingFieldsBlock form={form as unknown as UseFormReturn<PromptSamplingFields>} idPrefix="ai-plugin-version-summary" defaultInstructions={DEFAULT_PLUGIN_VERSION_SUMMARY_INSTRUCTIONS} />
                </CardContent>
            </Card>
        </>
    )
}
