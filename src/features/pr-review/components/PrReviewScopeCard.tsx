"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { PR_REVIEW_REPLAN_LIMIT_MAX, PR_REVIEW_SCOPE_LABELS, PR_REVIEW_SCOPES } from "../constants"
import type { PrReviewSettings } from "../schemas"
import { NumberField } from "./NumberField"

const SCOPE_OPTIONS = PR_REVIEW_SCOPES.map((value) => ({ value, label: PR_REVIEW_SCOPE_LABELS[value].label, title: PR_REVIEW_SCOPE_LABELS[value].description }))
const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Quais PRs revisar automaticamente e como a revisão conversa com as mesas de trabalho. */
export function PrReviewScopeCard({ form, githubLogin }: { form: UseFormReturn<PrReviewSettings>; githubLogin: string | null | undefined }) {
    const scope = useWatch({ control: form.control, name: "scope" })
    const replan = useWatch({ control: form.control, name: "replanOnChanges" })
    const limited = useWatch({ control: form.control, name: "replanLimit.enabled" })
    const errors = form.formState.errors

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Quais PRs revisar automaticamente</CardTitle>
                    <CardDescription>PRs abertos nos repositórios das centrais de desenvolvimento, verificados a cada execução da rotina de PRs. Cada novo commit no PR gera uma nova revisão.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label id="pr-review-scope-label">Critério</Label>
                        <Controller control={form.control} name="scope" render={({ field }) => <OptionTabs aria-labelledby="pr-review-scope-label" options={SCOPE_OPTIONS} value={field.value} onChange={field.onChange} className="w-full" />} />
                        <p className="text-xs text-muted-foreground">
                            {PR_REVIEW_SCOPE_LABELS[scope].description}
                            {scope !== "all" && (githubLogin ? ` — usuário atual: @${githubLogin}.` : " — sem o usuário do GitHub (confira o token em Integrações › GitHub), nenhum PR entra.")}
                        </p>
                    </div>
                    <div className={FORM_GRID_WIDE}>
                        <FormToggleCard<PrReviewSettings> control={form.control} name="includeDrafts" id="pr-review-drafts" label="PRs em rascunho" description="Revisar também PRs marcados como rascunho" onLabel="Revisar" offLabel="Ignorar" />
                        <FormToggleCard<PrReviewSettings> control={form.control} name="includeWorkbenchPrs" id="pr-review-workbench" label="PRs das mesas" description="Revisar os PRs abertos pelo desenvolvimento agêntico" onLabel="Revisar" offLabel="Ignorar" />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Mesas de trabalho</CardTitle>
                    <CardDescription>Quando a revisão pede mudanças num PR de mesa, a mesa volta ao planejamento com os bloqueios apontados. Em PR seu (o GitHub não deixa pedir mudanças no próprio PR), o comentário leva a menção da central.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FormToggleCard<PrReviewSettings> control={form.control} name="replanOnChanges" id="pr-review-replan" label="Replanejar a mesa" description="Pedido de mudanças da revisão automática faz a mesa corrigir o PR" onLabel="Replaneja" offLabel="Não replaneja" />
                    <AnimatePresence initial={false}>
                        {replan && (
                            <motion.div key="limit" {...reveal} className="space-y-4 overflow-hidden">
                                <FormToggleCard<PrReviewSettings>
                                    control={form.control}
                                    name="replanLimit.enabled"
                                    id="pr-review-replan-limit"
                                    label="Limitar replanejamentos"
                                    description="Depois do limite, a revisão continua sendo publicada, mas a mesa não replaneja sozinha"
                                    onLabel="Com limite"
                                    offLabel="Sem limite"
                                />
                                <AnimatePresence initial={false}>
                                    {limited && (
                                        <motion.div key="max" {...reveal} className="overflow-hidden">
                                            <NumberField<PrReviewSettings> control={form.control} name="replanLimit.max" id="pr-review-replan-max" label="Máximo de replanejamentos por PR" min={1} max={PR_REVIEW_REPLAN_LIMIT_MAX} error={errors.replanLimit?.max?.message} />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>
        </>
    )
}
