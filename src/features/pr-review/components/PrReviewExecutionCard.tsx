"use client"

import type { UseFormReturn } from "react-hook-form"
import { Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FORM_GRID_3 } from "@/components/ui/form-grid"
import { PR_REVIEW_CONCURRENCY_MAX, PR_REVIEW_TIMEOUT_MAX, PR_REVIEW_TIMEOUT_MIN } from "../constants"
import type { PrReviewSettings } from "../schemas"
import { NumberField } from "./NumberField"

/** Skill, limites da execução e instruções adicionais. */
export function PrReviewExecutionCard({ form }: { form: UseFormReturn<PrReviewSettings> }) {
    const errors = form.formState.errors
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Execução</CardTitle>
                <CardDescription>Cada revisão abre uma sessão nova do OpenCode no diretório da central, num worktree temporário no commit do PR, e publica o resultado no GitHub seguindo a skill.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className={FORM_GRID_3}>
                    <Field id="pr-review-skill" label="Skill" error={errors.skill?.message}>
                        <Input id="pr-review-skill" className="font-mono" {...form.register("skill")} />
                    </Field>
                    <NumberField<PrReviewSettings> control={form.control} name="maxConcurrent" id="pr-review-concurrent" label="Revisões simultâneas" min={1} max={PR_REVIEW_CONCURRENCY_MAX} error={errors.maxConcurrent?.message} />
                    <NumberField<PrReviewSettings> control={form.control} name="timeoutMinutes" id="pr-review-timeout" label="Tempo máximo (minutos)" min={PR_REVIEW_TIMEOUT_MIN} max={PR_REVIEW_TIMEOUT_MAX} error={errors.timeoutMinutes?.message} />
                </div>
                <Field id="pr-review-instructions" label="Instruções adicionais (opcional)" error={errors.instructions?.message}>
                    <Textarea id="pr-review-instructions" rows={5} className="font-mono text-xs" placeholder="Ex.: dê atenção especial a migrações de banco; não comente sobre estilo." {...form.register("instructions")} />
                </Field>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> A revisão roda sem ninguém para responder: pedidos de permissão do agente são aprovados automaticamente e perguntas são dispensadas. A skill precisa estar instalada no servidor do OpenCode, e o <span className="font-mono">gh</span> precisa estar autenticado.
                </p>
            </CardContent>
        </Card>
    )
}
