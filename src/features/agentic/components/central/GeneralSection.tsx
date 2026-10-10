"use client"

import Link from "next/link"
import { useWatch } from "react-hook-form"
import { AlertTriangle, Github } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { integrationPath } from "@/lib/integrations/catalog"
import type { CentralDto } from "../../types"
import type { CentralForm } from "./form"

/** Aba Geral: ativa, diretório das sessões, pasta dos worktrees, limite de mesas e repositório. */
export function GeneralSection({ form, central }: { form: CentralForm; central: CentralDto }) {
    const errors = form.formState.errors
    const directory = useWatch({ control: form.control, name: "sessionDirectory" })
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Geral</CardTitle>
                <CardDescription>Onde as sessões do OpenCode trabalham para o produto {central.projectName}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <FormToggleCard control={form.control} name="enabled" id="central-enabled" label="Central ativa" description="Desativada, a central aparece na Central de desenvolvimento, mas não abre nem executa mesas" />
                <div className={FORM_GRID_WIDE}>
                    <Field id="central-session-directory" label="Diretório das sessões" error={errors.sessionDirectory?.message}>
                        <Input id="central-session-directory" className="font-mono" {...form.register("sessionDirectory")} aria-invalid={errors.sessionDirectory ? true : undefined} />
                    </Field>
                    <Field id="central-worktree-root" label="Pasta dos worktrees" error={errors.worktreeRoot?.message}>
                        <Input id="central-worktree-root" className="font-mono" placeholder={`${directory || "/caminho/do/repo"}/worktrees`} {...form.register("worktreeRoot")} aria-invalid={errors.worktreeRoot ? true : undefined} />
                    </Field>
                    <Field id="central-max-concurrent" label="Mesas executando ao mesmo tempo" error={errors.maxConcurrent?.message}>
                        <Input id="central-max-concurrent" type="number" min={1} max={10} {...form.register("maxConcurrent", { valueAsNumber: true })} aria-invalid={errors.maxConcurrent ? true : undefined} />
                    </Field>
                </div>
                <p className="text-xs text-muted-foreground">Cada tarefa ganha um worktree em &lt;pasta dos worktrees&gt;/&lt;código&gt;, criado pelo agente de implementação.</p>
                {central.repo ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Github className="h-4 w-4" aria-hidden /> Repositório vinculado:{" "}
                        <a href={central.repoUrl ?? "#"} target="_blank" rel="noreferrer noopener" className="font-mono text-foreground underline-offset-2 hover:underline">
                            {central.repo}
                        </a>
                    </p>
                ) : (
                    <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span>
                            O produto não tem repositório vinculado.{" "}
                            <Link href={integrationPath("github")} className="underline underline-offset-2">
                                Vincule em Integrações › GitHub
                            </Link>{" "}
                            para o link do commit ao concluir a tarefa.
                        </span>
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
