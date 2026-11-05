"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownField } from "@/components/ui/markdown-field"
import { FormToggleCard } from "@/components/ui/toggle-card"
import type { RoutineAgentInput } from "../../schemas"

/** Nome, objetivo, instruções e o switch de confirmação. */
export function RoutineGeneralFields({ form, slug }: { form: UseFormReturn<RoutineAgentInput>; slug: string | null }) {
    const errors = form.formState.errors
    return (
        <div className="space-y-4">
            <Field id="routine-name" label="Nome" error={errors.name?.message}>
                <Input id="routine-name" placeholder="Ex.: Vagas de backend na Empresa X" {...form.register("name")} />
            </Field>
            {slug && <p className="-mt-2 text-xs text-muted-foreground">Slug fixo: <code>{slug}</code> (renomear não troca os canais de memória).</p>}
            <Field id="routine-objective" label="Objetivo" error={errors.objective?.message}>
                <Textarea id="routine-objective" rows={3} placeholder="O que o agente deve conseguir em cada execução" {...form.register("objective")} />
            </Field>
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
