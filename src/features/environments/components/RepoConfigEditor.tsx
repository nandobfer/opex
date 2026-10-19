"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormActions } from "@/components/ui/form-actions"
import { FormFooter } from "@/components/ui/form-footer"
import { ErrorState } from "@/components/feedback/ErrorState"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { DEFAULT_REPO_CONFIG, repoConfigSchema, secretInputSchema, type RepoConfigInput } from "../schemas"
import {
    useEnvironmentApi,
    useEnvironmentRepoConfig,
    useEnvironmentRepos,
    useSaveEnvironmentConfig,
    useEnvironmentMutation,
} from "../hooks/useEnvironments"
import type { z } from "zod"

/** Configuração de ambientes do repositório: acesso ao host, workflow de CD e credenciais privadas. */
export function RepoConfigEditor({ repoId }: { repoId: string }) {
    const api = useEnvironmentApi()
    const query = useEnvironmentRepoConfig(repoId)
    const repos = useEnvironmentRepos()
    const save = useSaveEnvironmentConfig(repoId)
    const secrets = useEnvironmentMutation<z.infer<typeof secretInputSchema>>((client, input) =>
        client.send("put", `/${repoId}/secrets`, input),
    )
    const form = useForm<RepoConfigInput>({
        resolver: zodResolver(repoConfigSchema),
        defaultValues: DEFAULT_REPO_CONFIG,
        mode: "onChange",
    })
    const secretForm = useForm<z.infer<typeof secretInputSchema>>({
        resolver: zodResolver(secretInputSchema),
        mode: "onChange",
    })
    useEffect(() => {
        if (query.data) form.reset(query.data.config)
    }, [query.data, form])
    const mode = useWatch({ control: form.control, name: "mode" })
    const auth = useWatch({ control: form.control, name: "auth" })
    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data)
        return <ErrorState title="Falha ao carregar configuração" onRetry={() => void query.refetch()} />
    if (!query.data.canEdit) return <p role="alert">Apenas administradores podem configurar este repositório.</p>
    const owner = query.data.canManageSecrets
    const errors = form.formState.errors
    const repoName = repos.data?.find((repo) => repo.id === repoId)?.repo ?? repoId
    return (
        <div className="flex flex-col gap-6">
            <header className="space-y-1">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={`${api.href}/${repoId}`}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Ambientes
                    </Link>
                </Button>
                <h1 className="text-xl font-semibold md:text-2xl">Ambientes do repositório</h1>
                <p className="truncate font-mono text-xs text-muted-foreground">{repoName}</p>
            </header>
            <form
                className="flex flex-col gap-6"
                onSubmit={form.handleSubmit(async (config) => {
                    await save.mutateAsync({ config, revision: query.data.revision }).catch(() => null)
                })}
            >
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Acesso ao host</CardTitle>
                        <CardDescription>
                            Local usa a máquina do OpenCode; Remoto acessa por SSH a partir dela. Tudo roda no host pelo
                            OpenCode — o servidor do Opex não executa comandos. Apenas o dono altera o destino SSH e as
                            credenciais.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className={FORM_GRID_WIDE}>
                        <Controller
                            control={form.control}
                            name="mode"
                            render={({ field }) => (
                                <Field id="repo-mode" label="Acesso ao host">
                                    <OptionTabs<"local" | "remote">
                                        id="repo-mode"
                                        aria-label="Acesso ao host"
                                        options={[
                                            { value: "local", label: "Local", disabled: !owner },
                                            { value: "remote", label: "Remoto (SSH)", disabled: !owner },
                                        ]}
                                        value={field.value}
                                        onChange={field.onChange}
                                    />
                                </Field>
                            )}
                        />
                        <Field id="repo-workflow" label="Workflow de CD (arquivo ou ID)" error={errors.workflow?.message}>
                            <Input id="repo-workflow" className="font-mono" {...form.register("workflow")} placeholder="ci-cd.yml" />
                        </Field>
                        {mode === "remote" && (
                            <>
                                <Field id="repo-host" label="Host SSH" error={errors.host?.message}>
                                    <Input id="repo-host" className="font-mono" readOnly={!owner} {...form.register("host")} />
                                </Field>
                                <Field id="repo-port" label="Porta SSH" error={errors.port?.message}>
                                    <Input
                                        id="repo-port"
                                        type="number"
                                        readOnly={!owner}
                                        {...form.register("port", { valueAsNumber: true })}
                                    />
                                </Field>
                                <Field id="repo-user" label="Usuário SSH" error={errors.username?.message}>
                                    <Input id="repo-user" className="font-mono" readOnly={!owner} {...form.register("username")} />
                                </Field>
                                <Controller
                                    control={form.control}
                                    name="auth"
                                    render={({ field }) => (
                                        <Field id="repo-auth" label="Autenticação">
                                            <OptionTabs<"key" | "password">
                                                id="repo-auth"
                                                aria-label="Autenticação SSH"
                                                options={[
                                                    { value: "key", label: "Chave privada", disabled: !owner },
                                                    { value: "password", label: "Senha", disabled: !owner },
                                                ]}
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                        </Field>
                                    )}
                                />
                                <Field
                                    id="repo-hostkey"
                                    label="Chave pública do host (linha known_hosts verificada)"
                                    error={errors.hostKey?.message}
                                >
                                    <Textarea id="repo-hostkey" className="font-mono" readOnly={!owner} {...form.register("hostKey")} />
                                </Field>
                            </>
                        )}
                    </CardContent>
                </Card>
                <FormActions
                    dirty={form.formState.isDirty}
                    pending={save.isPending}
                    valid={form.formState.isValid}
                    onUndo={() => form.reset(query.data.config)}
                    saveLabel="Salvar configuração"
                />
            </form>
            {owner && mode === "remote" && (
                <form
                    className="flex flex-col gap-6"
                    onSubmit={secretForm.handleSubmit(async (values) => {
                        const saved = await secrets
                            .mutateAsync(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "")))
                            .catch(() => null)
                        if (saved) secretForm.reset({})
                    })}
                >
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                                Credenciais privadas — {query.data.secretsConfigured ? "configuradas" : "não configuradas"}
                            </CardTitle>
                            <CardDescription>Somente substituição; valores salvos nunca são devolvidos em claro.</CardDescription>
                        </CardHeader>
                        <CardContent className={FORM_GRID_WIDE}>
                            {auth === "key" ? (
                                <>
                                    <Field
                                        id="ssh-key"
                                        label="Nova chave privada"
                                        error={secretForm.formState.errors.privateKey?.message}
                                    >
                                        <Textarea id="ssh-key" autoComplete="off" {...secretForm.register("privateKey")} />
                                    </Field>
                                    <Field id="ssh-passphrase" label="Passphrase da chave (opcional)">
                                        <Input
                                            id="ssh-passphrase"
                                            type="password"
                                            autoComplete="new-password"
                                            {...secretForm.register("passphrase")}
                                        />
                                    </Field>
                                </>
                            ) : (
                                <Field id="ssh-password" label="Nova senha">
                                    <Input id="ssh-password" type="password" autoComplete="new-password" {...secretForm.register("password")} />
                                </Field>
                            )}
                        </CardContent>
                    </Card>
                    <FormFooter>
                        <Button type="submit" disabled={secrets.isPending}>
                            Substituir credenciais
                        </Button>
                    </FormFooter>
                </form>
            )}
        </div>
    )
}
