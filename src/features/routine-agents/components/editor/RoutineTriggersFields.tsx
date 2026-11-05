"use client"

import { useFieldArray, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RoutineAgentInput } from "../../schemas"
import { RoutineTriggerRow } from "./RoutineTriggerRow"

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Gatilhos (vários por agente); o disparo manual ("Executar agora") está sempre disponível. */
export function RoutineTriggersFields({ form, webhookUrl }: { form: UseFormReturn<RoutineAgentInput>; webhookUrl: string | null }) {
    const triggers = useFieldArray({ control: form.control, name: "triggers", keyName: "key" })
    const rootError = (form.formState.errors.triggers as { message?: string } | undefined)?.message
    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Sempre no horário de Brasília. O disparo manual (&quot;Executar agora&quot;) está sempre disponível. Pausado, os agendados não disparam e não acumulam.</p>
            <AnimatePresence initial={false}>
                {triggers.fields.map((field, index) => (
                    <motion.div key={field.key} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                        <RoutineTriggerRow form={form} index={index} webhookUrl={webhookUrl} onRemove={() => triggers.remove(index)} />
                    </motion.div>
                ))}
            </AnimatePresence>
            {rootError && (
                <p role="alert" className="text-xs text-destructive">
                    {rootError}
                </p>
            )}
            <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => triggers.append({ id: newId(), enabled: true, kind: "interval", every: 60, unit: "minutes" })}>
                <Plus className="h-4 w-4" aria-hidden /> Adicionar gatilho
            </Button>
        </div>
    )
}
