"use client"

import type { UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { ProjectBootstrapStartInput, ProjectBootstrapStartValues } from "../../schemas"
import type { DetectedTechGroup } from "../../tech-detect"
import { TechBadges } from "../TechBadges"

interface ContextFieldProps {
    form: UseFormReturn<ProjectBootstrapStartInput, unknown, ProjectBootstrapStartValues>
    groups: readonly DetectedTechGroup[]
}

/** Contexto geral do projeto (objetivo e stack) com as tecnologias destacadas ao vivo ao lado. */
export function ContextField({ form, groups }: ContextFieldProps) {
    const errors = form.formState.errors
    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Field id="bootstrap-context" label="Contexto geral" error={errors.context?.message}>
                <Textarea
                    id="bootstrap-context"
                    rows={9}
                    placeholder="Ex.: serviço de memórias de IA escrito em Rust com SQLite e um frontend administrativo em Next com Mongo."
                    {...form.register("context")}
                    aria-invalid={errors.context ? true : undefined}
                    aria-describedby="bootstrap-context-hint"
                />
                <p id="bootstrap-context-hint" className="text-xs text-muted-foreground">
                    Conte o <strong className="font-medium text-foreground">objetivo</strong> do produto e a <strong className="font-medium text-foreground">stack tecnológica</strong> (linguagens, bancos, frontend, serviços). O agente pergunta o que faltar.
                </p>
            </Field>
            <div className="space-y-1.5">
                <span className="text-xs font-semibold">Tecnologias reconhecidas</span>
                <div className="min-h-24 rounded-md border bg-muted/20 p-3">
                    <TechBadges groups={groups} />
                </div>
            </div>
        </div>
    )
}
