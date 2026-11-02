"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { ARCHITECT_TRIGGER_LABELS, ARCHITECT_TRIGGERS, type ArchitectTrigger } from "../../constants"
import type { ArchitectSettings } from "../../schemas"

const LABELS: Record<ArchitectTrigger, string> = { auto: "Automático", manual: "Manual" }

/** Disparo: automático ao aprovar o plano (padrão) ou manual, pelo botão "Gerar arquitetura" da mesa. */
export function TriggerCard({ form }: { form: UseFormReturn<ArchitectSettings> }) {
    const trigger = useWatch({ control: form.control, name: "trigger" })
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Disparo</CardTitle>
                <CardDescription>O arquiteto roda em paralelo: a implementação começa na hora e o diagrama chega depois, na aba &quot;Arquitetura&quot; da mesa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                <Controller
                    control={form.control}
                    name="trigger"
                    render={({ field }) => (
                        <OptionTabs<ArchitectTrigger> id="architect-trigger" aria-label="Disparo do Agente Arquiteto" options={ARCHITECT_TRIGGERS.map((value) => ({ value, label: LABELS[value], title: ARCHITECT_TRIGGER_LABELS[value] }))} value={field.value} onChange={field.onChange} className="w-full" />
                    )}
                />
                <p className="text-xs text-muted-foreground">
                    {trigger === "auto"
                        ? "Quando o planejador entrega um plano, o agente gera a arquitetura da funcionalidade (consolidando todos os planos da mesa) para a análise do plano. Cada plano novo gera uma versão nova; a geração de um plano anterior é descartada. Ao aprovar (Implementar), só gera se o plano ainda não tiver diagrama."
                        : 'Nada roda sozinho: use "Gerar arquitetura" na aba da mesa (disponível assim que a mesa tem um plano).'}
                </p>
            </CardContent>
        </Card>
    )
}
