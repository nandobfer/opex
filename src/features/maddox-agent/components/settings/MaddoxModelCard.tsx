"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FORM_GRID } from "@/components/ui/form-grid"
import { ModelPickerField, VariantSelectField } from "@/features/ai/components/ModelFields"
import { useAiModels } from "@/features/ai/hooks/useAi"
import type { MaddoxAgentSettings } from "../../schemas"

interface MaddoxModelCardProps {
    form: UseFormReturn<MaddoxAgentSettings>
    target: "main" | "title"
    title: string
    description: string
}

/**
 * Modelo e variante do catálogo do **OpenCode** (sem escolha de provedor). No subagente de título,
 * vazio = usa o modelo do agente principal.
 */
export function MaddoxModelCard({ form, target, title, description }: MaddoxModelCardProps) {
    const models = useAiModels("opencode")
    const modelId = useWatch({ control: form.control, name: `${target}.model` })
    const variant = useWatch({ control: form.control, name: `${target}.variant` })
    const model = models.data?.find((item) => item.id === modelId)
    const error = form.formState.errors[target]?.model?.message
    const set = (next: { model: string | null; variant: string | null }) => form.setValue(target, next, { shouldDirty: true, shouldValidate: true })
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className={FORM_GRID}>
                    <ModelPickerField
                        id={`maddox-${target}-model`}
                        models={models}
                        modelId={modelId}
                        error={error}
                        placeholder={target === "title" ? "Mesmo do agente principal" : "Escolha o modelo"}
                        onPick={(item) => set({ model: item.id, variant: null })}
                    />
                    {model && model.variants.length > 0 && <VariantSelectField id={`maddox-${target}-variant`} label="Variante" variants={model.variants} value={variant} onChange={(next) => set({ model: modelId, variant: next })} />}
                </div>
                {target === "title" && modelId && (
                    <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => set({ model: null, variant: null })}>
                            <Undo2 className="h-3.5 w-3.5" aria-hidden /> Usar o modelo do agente principal
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
