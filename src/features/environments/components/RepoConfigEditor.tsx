"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { FORM_GRID } from "@/components/ui/form-grid"
import { DEFAULT_REPO_CONFIG, repoConfigSchema, secretInputSchema, type RepoConfigInput } from "../schemas"
import {
    useEnvironmentApi,
    useEnvironmentRepoConfig,
    useSaveEnvironmentConfig,
    useEnvironmentMutation,
} from "../hooks/useEnvironments"
import type { z } from "zod"

export function RepoConfigEditor({ repoId }: { repoId: string }) {
    const api = useEnvironmentApi()
    const query = useEnvironmentRepoConfig(repoId)
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
    return (
        <div className="flex flex-col gap-6">
            <header>
                <Button asChild variant="ghost">
                    <Link href={`${api.href}/${repoId}`}>Voltar para ambientes</Link>
                </Button>
                <h1 className="text-xl font-semibold">Configuração de ambientes do repositório</h1>
            </header>
            <form
                className="space-y-6"
                onSubmit={form.handleSubmit(async (config) => {
                    await save.mutateAsync({ config, revision: query.data.revision }).catch(() => null)
                })}
            >
                <section className={`${FORM_GRID} rounded-lg border p-6`}>
                    <Controller
                        control={form.control}
                        name="mode"
                        render={({ field }) => (
                            <Field id="repo-mode" label="Acesso ao host">
                                <OptionTabs
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
                        <Input id="repo-workflow" {...form.register("workflow")} placeholder="ci-cd.yml" />
                    </Field>
                    {mode === "remote" && (
                        <>
                            <Field id="repo-host" label="Host SSH" error={errors.host?.message}>
                                <Input id="repo-host" readOnly={!owner} {...form.register("host")} />
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
                                <Input id="repo-user" readOnly={!owner} {...form.register("username")} />
                            </Field>
                            <Controller
                                control={form.control}
                                name="auth"
                                render={({ field }) => (
                                    <Field id="repo-auth" label="Autenticação">
                                        <OptionTabs
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
                                <Textarea id="repo-hostkey" readOnly={!owner} {...form.register("hostKey")} />
                            </Field>
                        </>
                    )}
                </section>
                <p className="text-sm text-muted-foreground">
                    Local usa a máquina do OpenCode/Opex. O agente executa Git, Docker e SSH; o servidor Opex não
                    executa comandos no host. Apenas o dono altera o destino SSH e suas credenciais.
                </p>
                <footer className="flex justify-end gap-2 border-t pt-6">
                    <Button type="button" variant="outline" onClick={() => form.reset(query.data.config)}>
                        Desfazer
                    </Button>
                    <Button disabled={save.isPending || !form.formState.isDirty} type="submit">
                        Salvar configuração
                    </Button>
                </footer>
            </form>
            {owner && mode === "remote" && (
                <form
                    className="space-y-4 rounded-lg border p-6"
                    onSubmit={secretForm.handleSubmit(async (values) => {
                        const saved = await secrets
                            .mutateAsync(Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "")))
                            .catch(() => null)
                        if (saved) secretForm.reset({})
                    })}
                >
                    <h2 className="font-semibold">
                        Credenciais privadas — {query.data.secretsConfigured ? "configuradas" : "não configuradas"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Somente substituição; valores salvos nunca são devolvidos.
                    </p>
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
                            <Input
                                id="ssh-password"
                                type="password"
                                autoComplete="new-password"
                                {...secretForm.register("password")}
                            />
                        </Field>
                    )}
                    <div className="flex justify-end border-t pt-4">
                        <Button type="submit" disabled={secrets.isPending}>
                            Substituir credenciais
                        </Button>
                    </div>
                </form>
            )}
        </div>
    )
}
