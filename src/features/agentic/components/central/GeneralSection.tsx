"use client"

import Link from "next/link"
import { Controller, useWatch } from "react-hook-form"
import { AlertTriangle, Github } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { integrationPath } from "@/lib/integrations/catalog"
import { FORK_DONE_POLICIES, FORK_DONE_POLICY_LABELS, LIVE_CHAT_DESCRIPTION, LIVE_CHAT_POLICIES, LIVE_CHAT_POLICY_LABELS } from "../../constants"
import { useAgenticSettings } from "../../hooks/useAgentic"
import type { CentralDto } from "../../types"
import { CentralColorField } from "./CentralColorField"
import type { CentralForm } from "./form"

/** Aba Geral: ativa, diretório das sessões, pasta dos worktrees, limite de mesas, forks e repositório. */
export function GeneralSection({ form, central }: { form: CentralForm; central: CentralDto }) {
    const errors = form.formState.errors
    const directory = useWatch({ control: form.control, name: "sessionDirectory" })
    const forkPolicy = useWatch({ control: form.control, name: "forks.onWorkbenchDone" })
    const globalLiveChat = useAgenticSettings().data?.settings.liveChat
    const inheritLabel = globalLiveChat === undefined ? LIVE_CHAT_POLICY_LABELS.inherit : `${LIVE_CHAT_POLICY_LABELS.inherit} (${globalLiveChat ? "ligado" : "desligado"})`
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
                <p className="text-xs text-muted-foreground">
                    Mesas em Plano pronto, Prévia pronta ou PR aberto não ocupam vaga. Ao voltarem a executar com o limite cheio, aguardam vaga e têm prioridade sobre as tarefas novas da fila.
                </p>
                <CentralColorField form={form} label={central.repo || central.projectName || "Projeto"} />
                <div className="space-y-1.5">
                    <p id="central-forks-done" className="text-sm font-medium">
                        Forks: ao concluir a mesa
                    </p>
                    <Controller
                        control={form.control}
                        name="forks.onWorkbenchDone"
                        render={({ field }) => (
                            <OptionTabs
                                aria-labelledby="central-forks-done"
                                className="w-full"
                                value={field.value}
                                onChange={field.onChange}
                                options={FORK_DONE_POLICIES.map((policy) => ({ value: policy, label: FORK_DONE_POLICY_LABELS[policy].label, title: `${FORK_DONE_POLICY_LABELS[policy].label} — ${FORK_DONE_POLICY_LABELS[policy].description}` }))}
                            />
                        )}
                    />
                    <p className="text-xs text-muted-foreground">{FORK_DONE_POLICY_LABELS[forkPolicy ?? "ask"].description} Forks não ocupam vaga no limite de mesas.</p>
                </div>
                <div className="space-y-1.5">
                    <p id="central-live-chat" className="text-sm font-medium">
                        Chat durante a execução
                    </p>
                    <Controller
                        control={form.control}
                        name="liveChat"
                        render={({ field }) => (
                            <OptionTabs
                                aria-labelledby="central-live-chat"
                                className="w-full"
                                value={field.value}
                                onChange={field.onChange}
                                options={LIVE_CHAT_POLICIES.map((policy) => ({ value: policy, label: policy === "inherit" ? inheritLabel : LIVE_CHAT_POLICY_LABELS[policy] }))}
                            />
                        )}
                    />
                    <p className="text-xs text-muted-foreground">{LIVE_CHAT_DESCRIPTION} O padrão global fica em Agente Desenvolvedor › Agentes.</p>
                </div>
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
