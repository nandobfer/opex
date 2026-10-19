"use client"

import { Controller, useWatch } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChipInput } from "@/components/ui/chip-input"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { useAgenticSettings } from "../../hooks/useAgentic"
import { CiFixCard } from "../settings/CiFixCard"
import type { CentralForm } from "./form"

/** Aba Git e PR: branches, padrões de nome, correção de CI, revisores, labels e comandos de preparo/validação. */
export function GitSection({ form }: { form: CentralForm }) {
    const errors = form.formState.errors.git
    const [inheritCi, fixCi, ciFixLimit] = useWatch({ control: form.control, name: ["git.inheritCi", "git.fixCi", "git.ciFixLimit"] })
    const settings = useAgenticSettings()
    const options = { shouldDirty: true, shouldValidate: true } as const
    const text = (name: "baseBranch" | "prTargetBranch" | "branchPattern" | "commitPattern" | "prTitlePattern", label: string, mono = true) => (
        <Field id={`central-git-${name}`} label={label} error={errors?.[name]?.message}>
            <Input id={`central-git-${name}`} className={mono ? "font-mono" : undefined} {...form.register(`git.${name}`)} aria-invalid={errors?.[name] ? true : undefined} />
        </Field>
    )
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Branches e Pull Request</CardTitle>
                    <CardDescription>
                        Padrões aceitam <code className="font-mono">{"{code}"}</code>, <code className="font-mono">{"{title}"}</code> e <code className="font-mono">{"{slug}"}</code> (título sem acentos).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className={FORM_GRID_WIDE}>
                        {text("baseBranch", "Branch base (origem do worktree)")}
                        {text("prTargetBranch", "Branch de destino do PR")}
                        {text("branchPattern", "Padrão da branch")}
                        {text("commitPattern", "Padrão do commit", false)}
                        {text("prTitlePattern", "Padrão do título do PR", false)}
                    </div>
                    <FormToggleCard control={form.control} name="git.prDraft" id="central-git-draft" label="Abrir como rascunho" description="O PR nasce como draft (gh pr create --draft)" onLabel="Sim" offLabel="Não" />
                    <div className="space-y-1.5">
                        <FormToggleCard
                            control={form.control}
                            name="git.autoMerge"
                            id="central-git-auto-merge"
                            label="Merge automático"
                            description="O agente resolve conflitos, faz o merge (merge commit) e apaga a branch remota assim que o PR fica pronto — inclusive para os PRs já abertos pelas mesas desta central. Respeita as proteções do repositório e não combina com abrir o PR como rascunho."
                            onLabel="Sim"
                            offLabel="Não"
                        />
                        {errors?.autoMerge?.message && (
                            <p className="text-xs text-destructive" role="alert">
                                {errors.autoMerge.message}
                            </p>
                        )}
                    </div>
                    <div className={FORM_GRID_WIDE}>
                        <Field id="central-git-reviewers" label="Revisores" error={errors?.prReviewers?.message}>
                            <Controller control={form.control} name="git.prReviewers" render={({ field }) => <ChipInput id="central-git-reviewers" value={field.value} onChange={field.onChange} placeholder="login do GitHub e Enter" max={20} />} />
                        </Field>
                        <Field id="central-git-labels" label="Labels" error={errors?.prLabels?.message}>
                            <Controller control={form.control} name="git.prLabels" render={({ field }) => <ChipInput id="central-git-labels" value={field.value} onChange={field.onChange} placeholder="label e Enter" max={20} />} />
                        </Field>
                    </div>
                </CardContent>
            </Card>
            <CiFixCard
                idPrefix="central-git-ci"
                value={{ fixCi, ciFixLimit }}
                globalValue={settings.data?.settings.ci}
                limitError={errors?.ciFixLimit?.message}
                inherited={{ value: inheritCi, onChange: (inherit) => form.setValue("git.inheritCi", inherit, options) }}
                onChange={(next) => {
                    form.setValue("git.fixCi", next.fixCi, options)
                    form.setValue("git.ciFixLimit", next.ciFixLimit, options)
                }}
            />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Comandos</CardTitle>
                    <CardDescription>Executados pelo agente no worktree. Um por linha ou encadeados com &amp;&amp;.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <Field id="central-git-setup" label="Preparo do worktree" error={errors?.setupCommands?.message}>
                        <Textarea id="central-git-setup" rows={3} className="font-mono text-xs" placeholder={"cp ../meu-projeto/.env .env\npnpm install"} {...form.register("git.setupCommands")} />
                    </Field>
                    <Field id="central-git-validate" label="Validação antes do PR" error={errors?.validateCommands?.message}>
                        <Textarea id="central-git-validate" rows={3} className="font-mono text-xs" placeholder={"pnpm lint\npnpm test"} {...form.register("git.validateCommands")} />
                    </Field>
                </CardContent>
            </Card>
        </>
    )
}
