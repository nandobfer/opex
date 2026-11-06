"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownField } from "@/components/ui/markdown-field"
import { FormToggleCard } from "@/components/ui/toggle-card"
import type { RoutineAgentInput } from "../../schemas"

const GENERATED_HINT = "Opcional: gerado pelo provisionamento se ficar vazio."

/** Selo "Gerado" (campo preenchido pelo subagente de provisionamento; some quando o dono edita). */
function GeneratedHint({ generated }: { generated: boolean }) {
    return (
        <div className="-mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            {generated && (
                <Badge variant="secondary" className="gap-1" data-testid="routine-generated-badge">
                    <Sparkles className="h-3 w-3" aria-hidden /> Gerado
                </Badge>
            )}
            {GENERATED_HINT}
        </div>
    )
}

/**
 * Nome, objetivo, instruções e o switch de confirmação. Nome e objetivo são opcionais (D8): o que ficar
 * vazio o subagente de provisionamento gera (o nome é só o papel, ex. "Recrutador").
 */
export function RoutineGeneralFields({ form, slug, generated }: { form: UseFormReturn<RoutineAgentInput>; slug: string | null; generated?: { name: boolean; objective: boolean } }) {
    const errors = form.formState.errors
    const [name, objective] = useWatch({ control: form.control, name: ["name", "objective"] })
    const dirty = form.formState.dirtyFields
    return (
        <div className="space-y-4">
            <Field id="routine-name" label="Nome" error={errors.name?.message}>
                <Input id="routine-name" placeholder="Ex.: Recrutador (vazio: gerado a partir do objetivo e das instruções)" {...form.register("name")} />
            </Field>
            <GeneratedHint generated={Boolean(generated?.name && name && !dirty.name)} />
            {slug && !slug.startsWith("pendente-") && <p className="-mt-2 text-xs text-muted-foreground">Slug fixo: <code>{slug}</code> (renomear não troca os canais de memória).</p>}
            <Field id="routine-objective" label="Objetivo" error={errors.objective?.message}>
                <Textarea id="routine-objective" rows={3} placeholder="O que o agente deve conseguir em cada execução (vazio: gerado a partir das instruções)" {...form.register("objective")} />
            </Field>
            <GeneratedHint generated={Boolean(generated?.objective && objective && !dirty.objective)} />
            <Field id="routine-instructions" label="Instruções (markdown)" error={errors.instructions?.message}>
                <Controller
                    control={form.control}
                    name="instructions"
                    render={({ field }) => <MarkdownField id="routine-instructions" rows={8} value={field.value} onChange={field.onChange} placeholder="Plataforma, filtros, critérios, o que nunca fazer…" ariaLabel="Instruções" />}
                />
            </Field>
            <FormToggleCard
                control={form.control}
                name="confirmIrreversible"
                id="routine-confirm"
                label="Pedir confirmação antes de ações irreversíveis"
                description="Antes de enviar candidatura, formulário, mensagem ou pagamento, a execução para em Aguardando confirmação até você Confirmar ou Recusar. No motor OpenCode, depende de o agente chamar a ferramenta: o OpenCode não intercepta cliques no navegador."
                onLabel="Ligado"
                offLabel="Desligado"
            />
        </div>
    )
}
