"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Save, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { environmentSchema } from "../schemas"
import type { EnvironmentDto, EnvironmentInput } from "../types"

/** Campos escalares validados pelo schema (os objetos e a lista de variáveis são montados no submit). */
const scalarSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome").max(120),
    slug: z.string().trim().max(120),
    branch: z.string().trim().min(1, "Informe a branch").max(255),
    hostDirectory: z.string().trim().max(500),
    composeFile: z.string().trim().min(1, "Informe o arquivo").max(500),
    composeService: z.string().trim().max(120),
    publishedPort: z.string().trim(),
    cpus: z.string().trim(),
    memoryMb: z.string().trim(),
    healthPath: z.string().trim(),
    healthTimeout: z.string().trim(),
    dbValue: z.string().trim(),
})
type ScalarValues = z.infer<typeof scalarSchema>

function numberOrNull(value: string): number | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
}

function toScalars(env: EnvironmentDto | null): ScalarValues {
    return {
        name: env?.name ?? "",
        slug: env?.slug ?? "",
        branch: env?.branch ?? "main",
        hostDirectory: env?.hostDirectory ?? "",
        composeFile: env?.composeFile ?? "docker-compose.yml",
        composeService: env?.composeService ?? "",
        publishedPort: env?.publishedPort ? String(env.publishedPort) : "",
        cpus: env?.resources.cpus != null ? String(env.resources.cpus) : "",
        memoryMb: env?.resources.memoryMb != null ? String(env.resources.memoryMb) : "",
        healthPath: env?.healthcheck.path ?? "/",
        healthTimeout: String(env?.healthcheck.timeoutMs ?? 60_000),
        dbValue: env?.dbVersionSource.value ?? "",
    }
}

/** Formulário de ambiente: criação e edição (admin do cliente edita; segredos só o dono). */
export function EnvironmentForm({
    env,
    isOwner,
    submitting,
    onSubmit,
}: {
    env: EnvironmentDto | null
    isOwner: boolean
    submitting: boolean
    onSubmit: (input: EnvironmentInput) => void
}) {
    const form = useForm<ScalarValues>({ resolver: zodResolver(scalarSchema), mode: "onChange", defaultValues: toScalars(env) })
    const [healthEnabled, setHealthEnabled] = useState(env?.healthcheck.enabled ?? true)
    const [dbKind, setDbKind] = useState<EnvironmentInput["dbVersionSource"]["kind"]>(env?.dbVersionSource.kind ?? "file")
    const [envVars, setEnvVars] = useState(env?.envVars ?? [])
    const [connectionString, setConnectionString] = useState("")
    const errors = form.formState.errors

    const submit = form.handleSubmit((values) => {
        const payload: EnvironmentInput = environmentSchema.parse({
            name: values.name,
            slug: values.slug || undefined,
            branch: values.branch,
            hostDirectory: values.hostDirectory,
            composeFile: values.composeFile,
            composeService: values.composeService,
            publishedPort: numberOrNull(values.publishedPort),
            resources: { cpus: numberOrNull(values.cpus), memoryMb: numberOrNull(values.memoryMb) },
            envVars,
            healthcheck: { enabled: healthEnabled, path: values.healthPath || "/", timeoutMs: Number(values.healthTimeout) || 60_000 },
            dbVersionSource: { kind: dbKind, value: values.dbValue },
            ...(isOwner && connectionString.trim() ? { secrets: { connectionString: { action: "set" as const, value: connectionString } } } : {}),
        })
        onSubmit(payload)
    })

    return (
        <form onSubmit={submit} className="space-y-6">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Geral</CardTitle>
                </CardHeader>
                <CardContent className={FORM_GRID}>
                    <Field id="env-name" label="Nome" error={errors.name?.message}>
                        <Input id="env-name" autoFocus {...form.register("name")} />
                    </Field>
                    <Field id="env-branch" label="Branch" error={errors.branch?.message}>
                        <Input id="env-branch" {...form.register("branch")} />
                    </Field>
                    <Field id="env-dir" label="Diretório no host" error={errors.hostDirectory?.message}>
                        <Input id="env-dir" placeholder="vazio = diretório do repositório" {...form.register("hostDirectory")} />
                    </Field>
                    <Field id="env-compose" label="Arquivo do compose" error={errors.composeFile?.message}>
                        <Input id="env-compose" {...form.register("composeFile")} />
                    </Field>
                    <Field id="env-service" label="Serviço (opcional)" error={errors.composeService?.message}>
                        <Input id="env-service" placeholder="primeiro serviço" {...form.register("composeService")} />
                    </Field>
                    <Field id="env-port" label="Porta publicada">
                        <Input id="env-port" type="number" placeholder="sem publicação" {...form.register("publishedPort")} />
                    </Field>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Recursos</CardTitle>
                </CardHeader>
                <CardContent className={FORM_GRID}>
                    <Field id="env-cpus" label="CPUs (opcional)">
                        <Input id="env-cpus" type="number" step="0.1" {...form.register("cpus")} />
                    </Field>
                    <Field id="env-memory" label="Memória (MB, opcional)">
                        <Input id="env-memory" type="number" {...form.register("memoryMb")} />
                    </Field>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Healthcheck e versão do banco</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                        <Switch checked={healthEnabled} onCheckedChange={setHealthEnabled} id="env-health" />
                        <label htmlFor="env-health" className="text-sm">
                            Validar a saúde após publicar
                        </label>
                    </div>
                    {healthEnabled && (
                        <div className={FORM_GRID}>
                            <Field id="env-health-path" label="Caminho do healthcheck">
                                <Input id="env-health-path" placeholder="/" {...form.register("healthPath")} />
                            </Field>
                            <Field id="env-health-timeout" label="Timeout (ms)">
                                <Input id="env-health-timeout" type="number" {...form.register("healthTimeout")} />
                            </Field>
                        </div>
                    )}
                    <Field id="env-db-kind" label="Fonte da versão de banco">
                        <OptionTabs
                            aria-label="Fonte da versão de banco"
                            options={[
                                { value: "file", label: "Arquivo" },
                                { value: "command", label: "Comando" },
                                { value: "none", label: "Nenhuma" },
                            ]}
                            value={dbKind}
                            onChange={(value) => setDbKind(value)}
                        />
                    </Field>
                    {dbKind !== "none" && (
                        <Field id="env-db-value" label={dbKind === "file" ? "Arquivo com a versão" : "Comando que imprime a versão"}>
                            <Input id="env-db-value" placeholder={dbKind === "file" ? "ex.: DB_VERSION" : "ex.: cat version.json"} {...form.register("dbValue")} />
                        </Field>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Variáveis de ambiente</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {envVars.map((variable, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <Input
                                aria-label="Nome da variável"
                                value={variable.key}
                                onChange={(event) => setEnvVars((list) => list.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)))}
                                className="w-40 font-mono"
                            />
                            <Input
                                aria-label="Valor"
                                type={variable.secret ? "password" : "text"}
                                value={variable.value}
                                onChange={(event) => setEnvVars((list) => list.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))}
                                className="flex-1 font-mono"
                            />
                            {isOwner && (
                                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Checkbox checked={variable.secret} onCheckedChange={(value) => setEnvVars((list) => list.map((item, i) => (i === index ? { ...item, secret: value === true } : item)))} />
                                    secreta
                                </label>
                            )}
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Remover variável" onClick={() => setEnvVars((list) => list.filter((_, i) => i !== index))}>
                                <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                        </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setEnvVars((list) => [...list, { key: "", value: "", secret: false }])}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden />
                        Adicionar variável
                    </Button>
                </CardContent>
            </Card>

            {isOwner && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            Banco (override do ambiente) {env?.hasConnectionOverride ? <Badge variant="success">Configurado</Badge> : null}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Field id="env-connection" label="Connection string (substituir)">
                            <Textarea id="env-connection" rows={2} value={connectionString} onChange={(event) => setConnectionString(event.target.value)} placeholder="mongodb://… (deixe vazio para usar a do repositório)" />
                        </Field>
                    </CardContent>
                </Card>
            )}

            <div className="flex justify-end gap-2 border-t pt-6">
                <Button type="submit" disabled={submitting}>
                    <Save className="mr-2 h-4 w-4" aria-hidden />
                    Salvar
                </Button>
            </div>
        </form>
    )
}
