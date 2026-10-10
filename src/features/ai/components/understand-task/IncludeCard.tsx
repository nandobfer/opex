"use client"

import type { UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { UNDERSTAND_TASK_INCLUDE_LABELS } from "../../constants"
import type { UnderstandTaskSettings } from "../../schemas"

const KEYS = Object.keys(UNDERSTAND_TASK_INCLUDE_LABELS) as (keyof typeof UNDERSTAND_TASK_INCLUDE_LABELS)[]

/** O que, além dos dados principais, entra na entrada da IA. */
export function IncludeCard({ form }: { form: UseFormReturn<UnderstandTaskSettings> }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">O que enviar</CardTitle>
                <CardDescription>Código, título, tipo, prioridade, projeto, descrição e especificação vão sempre.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className={FORM_GRID_WIDE}>
                    {KEYS.map((key) => (
                        <FormToggleCard<UnderstandTaskSettings> key={key} control={form.control} name={`include.${key}`} id={`ai-include-${key}`} label={UNDERSTAND_TASK_INCLUDE_LABELS[key].label} description={UNDERSTAND_TASK_INCLUDE_LABELS[key].description} onLabel="Enviar" offLabel="Não enviar" />
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
