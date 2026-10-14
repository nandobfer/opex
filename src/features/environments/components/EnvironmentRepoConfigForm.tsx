"use client"

import { useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link2, Server } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Textarea } from "@/components/ui/textarea"
import { environmentRepoUpdateSchema } from "../schemas"
import { useRepoConfig, useUpdateRepoConfig, type AmbientesApi } from "../hooks"
import type { EnvironmentRepoConfigDto } from "../types"
import type { z } from "zod"

type FormValues = z.input<typeof environmentRepoUpdateSchema>
type SecretDraft = { sshPassword: string; sshPrivateKey: string; sshPassphrase: string }

const EMPTY_SECRETS: SecretDraft = { sshPassword: "", sshPrivateKey: "", sshPassphrase: "" }

function secretBadge(status: { configured: boolean; unreadable: boolean }) {
    if (status.unreadable) return <Badge variant="destructive">Ilegível</Badge>
    if (status.configured) return <Badge variant="success">Configurado</Badge>
    return <Badge variant="secondary">Não definido</Badge>
}

/** Configuração de execução do repositório (Local/Remoto) com segredos só substituíveis. */
export function EnvironmentRepoConfigForm({ context, projectId, isOwner }: { context: AmbientesApi; projectId: string; isOwner: boolean }) {
    const query = useRepoConfig(context, projectId)
    return query.data ? <ConfigForm key={query.data.updatedAt} context={context} projectId={projectId} isOwner={isOwner} config={query.data} /> : null
}

function ConfigForm({ context, projectId, isOwner, config }: { context: AmbientesApi; projectId: string; isOwner: boolean; config: EnvironmentRepoConfigDto }) {
    const form = useForm<FormValues>({
        resolver: zodResolver(environmentRepoUpdateSchema),
        mode: "onChange",
        defaultValues: {
            mode: config.mode,
            host: config.host,
            sshPort: config.sshPort,
            sshUser: config.sshUser,
            authMethod: config.authMethod,
            sshKeyPath: config.sshKeyPath,
            cdWorkflow: config.cdWorkflow,
            repositoryDirectory: config.repositoryDirectory,
        },
    })
    const update = useUpdateRepoConfig(context, projectId)
    const [secrets, setSecrets] = useState<SecretDraft>(EMPTY_SECRETS)
    const [mode, authMethod] = useWatch({ control: form.control, name: ["mode", "authMethod"] })
    const errors = form.formState.errors

    const submit = form.handleSubmit((values) => {
        const secretPayload: Record<string, unknown> = {}
        if (secrets.sshPassword.trim()) secretPayload.sshPassword = { action: "set", value: secrets.sshPassword }
        if (secrets.sshPrivateKey.trim()) secretPayload.sshPrivateKey = { action: "set", value: secrets.sshPrivateKey }
        if (secrets.sshPassphrase.trim()) secretPayload.sshPassphrase = { action: "set", value: secrets.sshPassphrase }
        update.mutate(
            environmentRepoUpdateSchema.parse({ ...values, ...(Object.keys(secretPayload).length ? { secrets: secretPayload } : {}) }),
        )
        setSecrets(EMPTY_SECRETS)
    })

    return (
        <form onSubmit={submit} className="space-y-6">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                        <Server className="h-4 w-4 text-primary" aria-hidden />
                        Execução
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Field id="repo-mode" label="Modo">
                        <Controller
                            control={form.control}
                            name="mode"
                            render={({ field }) => (
                                <OptionTabs
                                    aria-label="Modo de execução"
                                    options={[
                                        { value: "local", label: "Local (Opex)" },
                                        { value: "remote", label: "Remoto (SSH)" },
                                    ]}
                                    value={field.value}
                                    onChange={field.onChange}
                                />
                            )}
                        />
                    </Field>

                    {mode === "remote" && (
                        <div className={FORM_GRID}>
                            <Field id="repo-host" label="Host" error={errors.host?.message}>
                                <Input id="repo-host" placeholder="ex.: 192.168.0.64" {...form.register("host")} />
                            </Field>
                            <Field id="repo-port" label="Porta SSH" error={errors.sshPort?.message}>
                                <Input id="repo-port" type="number" {...form.register("sshPort", { valueAsNumber: true })} />
                            </Field>
                            <Field id="repo-user" label="Usuário" error={errors.sshUser?.message}>
                                <Input id="repo-user" placeholder="ex.: deploy" {...form.register("sshUser")} />
                            </Field>
                            <Field id="repo-auth" label="Autenticação">
                                <Controller
                                    control={form.control}
                                    name="authMethod"
                                    render={({ field }) => (
                                        <OptionTabs
                                            aria-label="Método de autenticação"
                                            options={[
                                                { value: "key", label: "Chave" },
                                                { value: "password", label: "Senha" },
                                            ]}
                                            value={field.value}
                                            onChange={field.onChange}
                                        />
                                    )}
                                />
                            </Field>
                            {authMethod === "key" && (
                                <Field id="repo-keypath" label="Caminho da chave no host" error={errors.sshKeyPath?.message} className="space-y-1.5 sm:col-span-2">
                                    <Input id="repo-keypath" placeholder="ex.: ~/.ssh/id_ed25519" {...form.register("sshKeyPath")} />
                                </Field>
                            )}
                        </div>
                    )}

                    <Field id="repo-dir" label="Diretório dos repositórios no host" error={errors.repositoryDirectory?.message}>
                        <Input id="repo-dir" placeholder="ex.: /home/deploy/apps" {...form.register("repositoryDirectory")} />
                    </Field>
                    <Field id="repo-cd" label="Workflow de CD (GitHub Actions)" error={errors.cdWorkflow?.message}>
                        <Input id="repo-cd" placeholder="ex.: ci-cd.yml" {...form.register("cdWorkflow")} />
                    </Field>
                </CardContent>
            </Card>

            {isOwner && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <Link2 className="h-4 w-4 text-primary" aria-hidden />
                            Credenciais
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {mode === "remote" && (
                            <div className={FORM_GRID}>
                                {authMethod === "password" && (
                                    <Field id="secret-ssh-password" label="Senha SSH">
                                        <div className="space-y-1.5">
                                            {secretBadge(config.secrets.sshPassword)}
                                            <Input id="secret-ssh-password" type="password" autoComplete="new-password" value={secrets.sshPassword} onChange={(e) => setSecrets((s) => ({ ...s, sshPassword: e.target.value }))} placeholder="Substituir senha" />
                                        </div>
                                    </Field>
                                )}
                                {authMethod === "key" && (
                                    <Field id="secret-ssh-key" label="Chave privada (conteúdo)" className="space-y-1.5 sm:col-span-2">
                                        <div className="space-y-1.5">
                                            {secretBadge(config.secrets.sshPrivateKey)}
                                            <Textarea id="secret-ssh-key" rows={3} value={secrets.sshPrivateKey} onChange={(e) => setSecrets((s) => ({ ...s, sshPrivateKey: e.target.value }))} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
                                        </div>
                                    </Field>
                                )}
                                <Field id="secret-ssh-passphrase" label="Passphrase da chave (opcional)">
                                    <div className="space-y-1.5">
                                        {secretBadge(config.secrets.sshPassphrase)}
                                        <Input id="secret-ssh-passphrase" type="password" autoComplete="new-password" value={secrets.sshPassphrase} onChange={(e) => setSecrets((s) => ({ ...s, sshPassphrase: e.target.value }))} placeholder="Substituir passphrase" />
                                    </div>
                                </Field>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">Os segredos são cifrados e nunca são exibidos de volta; preencha só para substituir.</p>
                    </CardContent>
                </Card>
            )}

            <div className="flex justify-end gap-2 border-t pt-6">
                <Button type="submit" disabled={update.isPending || !form.formState.isValid}>
                    Salvar
                </Button>
            </div>
        </form>
    )
}
