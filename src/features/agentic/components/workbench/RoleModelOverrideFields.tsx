"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { OptionTabs } from "@/components/ui/option-tabs"
import { ModelVariantFields, type ModelVariantValue } from "@/features/ai/components/model-picker/ModelVariantFields"
import type { AiModelDto } from "@/lib/ai/providers"
import type { ModelChoiceDto } from "../../types"
import { MODEL_SOURCE_LABELS, describeChoice } from "./model-settings"

type Mode = "inherit" | "custom"

interface RoleModelOverrideFieldsProps {
    id: string
    choice: ModelChoiceDto
    models: { data?: AiModelDto[]; isError?: boolean; isLoading: boolean; error?: unknown }
    /** "Padrão da central" (mesa) ou "Padrão da mesa" (fork). */
    inheritLabel: string
    /** "Personalizar nesta mesa" ou "Personalizar neste fork". */
    customLabel: string
    /** Grava na hora: modelo/variante próprios ou `model: null` (voltar ao padrão). */
    onChange: (input: ModelVariantValue) => void
}

/**
 * Modelo de uma etapa na mesa ou no fork, no padrão da aba Agentes da central: herda o padrão
 * (resumo com a origem) ou personaliza modelo e variante. "Personalizar" só abre os campos com o
 * valor herdado; a gravação acontece ao escolher um modelo ou uma variante.
 */
export function RoleModelOverrideFields({ id, choice, models, inheritLabel, customLabel, onChange }: RoleModelOverrideFieldsProps) {
    const [customizing, setCustomizing] = useState(false)
    const mode: Mode = choice.overridden || customizing ? "custom" : "inherit"
    const inherited = choice.inherited ?? { model: choice.model, variant: choice.variant }
    const inheritedSource = choice.inheritedSource ?? (choice.overridden ? undefined : choice.source)
    const value = choice.overridden ? { model: choice.model, variant: choice.variant } : inherited
    return (
        <div className="space-y-3">
            <OptionTabs<Mode>
                id={`${id}-mode`}
                options={[
                    { value: "inherit", label: inheritLabel },
                    { value: "custom", label: customLabel },
                ]}
                value={mode}
                onChange={(next) => {
                    setCustomizing(next === "custom")
                    if (next === "inherit" && choice.overridden) onChange({ model: null, variant: null })
                }}
                className="w-full"
            />
            <AnimatePresence mode="wait" initial={false}>
                {mode === "inherit" ? (
                    <motion.p key="inherit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="text-sm text-muted-foreground" data-testid={`${id}-inherited`}>
                        {describeChoice(inherited, models.data)}
                        {inheritedSource ? ` · ${MODEL_SOURCE_LABELS[inheritedSource]}` : ""}
                    </motion.p>
                ) : (
                    <motion.div key="custom" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="grid gap-3">
                        <ModelVariantFields id={id} value={value} models={models} onChange={(next) => next.model && onChange(next)} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
