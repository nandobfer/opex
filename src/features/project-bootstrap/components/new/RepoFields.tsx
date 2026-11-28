"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, type UseFormReturn } from "react-hook-form"
import { Globe, Lock } from "lucide-react"
import Link from "next/link"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { apiErrorMessage } from "@/lib/api"
import { projectBootstrapPath } from "../../constants"
import { repoCheckTone } from "../../form-state"
import type { ProjectBootstrapStartInput, ProjectBootstrapStartValues } from "../../schemas"
import type { RepoCheckDto, RepoOwnersDto } from "../../types"
import { CheckStatus } from "./CheckStatus"
import { RepoOwnerField } from "./RepoOwnerField"

interface RepoFieldsProps {
    form: UseFormReturn<ProjectBootstrapStartInput, unknown, ProjectBootstrapStartValues>
    owners: { data: RepoOwnersDto | undefined; isLoading: boolean; error: unknown }
    check: { data: RepoCheckDto | undefined; isFetching: boolean; error: unknown }
    /** Nome ainda sendo digitado (a conferência espera a pausa). */
    pending: boolean
}

const VISIBILITY = [
    { value: "private" as const, label: "Privado" },
    { value: "public" as const, label: "Público" },
]

/** Dono, nome com a conferência ao vivo no GitHub e a visibilidade (só para repositório novo). */
export function RepoFields({ form, owners, check, pending }: RepoFieldsProps) {
    const errors = form.formState.errors
    const result = check.data
    const existing = result?.state === "existing"
    const tone = pending || check.isFetching ? "loading" : check.error ? "blocked" : repoCheckTone(result)
    const message = pending || check.isFetching ? "Conferindo o nome no GitHub…" : check.error ? apiErrorMessage(check.error, "Não foi possível conferir o nome no GitHub") : (result?.message ?? null)
    return (
        <div className="space-y-4">
            <div className={FORM_GRID}>
                <Field id="bootstrap-owner" label="Dono do repositório" error={errors.owner?.message ?? (owners.error ? apiErrorMessage(owners.error, "Não foi possível listar as contas do token") : undefined)}>
                    <Controller control={form.control} name="owner" render={({ field }) => <RepoOwnerField id="bootstrap-owner" owners={owners.data?.owners ?? []} value={field.value} onChange={field.onChange} loading={owners.isLoading} error={Boolean(errors.owner)} />} />
                </Field>
                <Field id="bootstrap-name" label="Nome do repositório" error={errors.name?.message}>
                    <Input id="bootstrap-name" className="font-mono" autoComplete="off" placeholder="meu-projeto" {...form.register("name")} aria-invalid={errors.name ? true : undefined} aria-describedby="bootstrap-name-status" />
                </Field>
            </div>
            <div className="-mt-2 space-y-1">
                <CheckStatus id="bootstrap-name-status" tone={errors.name ? null : tone} message={errors.name ? null : message} />
                {result?.bootstrapId && (
                    <Link href={projectBootstrapPath(result.bootstrapId)} className="text-xs font-medium text-primary hover:underline">
                        Abrir o bootstrap em andamento
                    </Link>
                )}
            </div>
            <AnimatePresence initial={false} mode="wait">
                {existing ? (
                    <motion.p key="existing" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 overflow-hidden text-xs text-muted-foreground">
                        {result?.private ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <Globe className="h-3.5 w-3.5" aria-hidden />} Repositório {result?.private ? "privado" : "público"} na branch padrão <span className="font-mono text-foreground">{result?.defaultBranch}</span>: a visibilidade não muda.
                    </motion.p>
                ) : (
                    <motion.div key="visibility" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <Field id="bootstrap-visibility" label="Visibilidade">
                            <Controller control={form.control} name="visibility" render={({ field }) => <OptionTabs id="bootstrap-visibility" options={VISIBILITY} value={field.value} onChange={field.onChange} className="w-full" />} />
                        </Field>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
