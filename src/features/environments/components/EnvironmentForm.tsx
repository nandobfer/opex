"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import { environmentSchema } from "../schemas"
import type { AmbientesApi } from "../hooks"
import type { EnvironmentDto, EnvironmentInput } from "../types"
import { EnvironmentBranchPicker } from "./EnvironmentBranchPicker"

/** Campos escalares validados pelo schema (os objetos são montados no submit). */
const scalarSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome").max(120),
    slug: z.string().trim().max(120),
    branch: z.string().trim().min(1, "Escolha a branch").max(255),
    hostDirectory: z.string().trim().max(500),
    composeFile: z.string().trim().min(1, "Informe o arquivo").max(500),
    composeService: z.string().trim().max(120),
    envFile: z.string().trim().max(300),
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
        envFile: env?.envFile ?? ".env",
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
    context,
    projectId,
    env,
    submitting,
    onSubmit,
}: {
    context: AmbientesApi
    projectId: string
    env: EnvironmentDto | null
    submitting: boolean
    onSubmit: (input: EnvironmentInput) => void
}) {
    const form = useForm<ScalarValues>({ resolver: zodResolver(scalarSchema), mode: "onChange", defaultValues: toScalars(env) })
    const [healthEnabled, setHealthEnabled] = useState(env?.healthcheck.enabled ?? true)
    const [dbKind, setDbKind] = useState<EnvironmentInput["dbVersionSource"]["kind"]>(env?.dbVersionSource.kind ?? "file")
    const [branch, setBranch] = useState(env?.branch ?? "main")
    const errors = form.formState.errors

    const submit = form.handleSubmit((values) => {
        const payload: EnvironmentInput = environmentSchema.parse({
            name: values.name,
            slug: values.slug || undefined,
            branch,
            hostDirectory: values.hostDirectory,
            composeFile: values.composeFile,
            composeService: values.composeService,
            // O projeto Compose é definido pela adoção (no host), não pelo formulário.
            composeProject: env?.composeProject ?? "",
            envFile: values.envFile || ".env",
            publishedPort: numberOrNull(values.publishedPort),
            resources: { cpus: numberOrNull(values.cpus), memoryMb: numberOrNull(values.memoryMb) },
            healthcheck: { enabled: healthEnabled, path: values.healthPath || "/", timeoutMs: Number(values.healthTimeout) || 60_000 },
            dbVersionSource: { kind: dbKind, value: values.dbValue },
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
                        <EnvironmentBranchPicker context={context} projectId={projectId} id="env-branch" value={branch} onChange={setBranch} />
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
                    <Field id="env-file" label="Arquivo de variáveis (.env)" error={errors.envFile?.message}>
                        <Input id="env-file" placeholder=".env" {...form.register("envFile")} />
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
                    <CardTitle className="text-sm">Healthcheck e schema do banco</CardTitle>
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
                    <Field id="env-db-kind" label="Fonte do schema do banco">
                        <OptionTabs
                            aria-label="Fonte do schema do banco"
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
                        <Field id="env-db-value" label={dbKind === "file" ? "Arquivo com o schema" : "Comando que imprime o schema"}>
                            <Input id="env-db-value" placeholder={dbKind === "file" ? "ex.: DB_VERSION" : "ex.: cat version.json"} {...form.register("dbValue")} />
                        </Field>
                    )}
                    <p className="text-xs text-muted-foreground">
                        O Opex não acessa o banco do ambiente: o schema vem daqui (lido no build) e fica registrado nas publicações para bloquear restaurações incompatíveis.
                    </p>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-2 border-t pt-6">
                <Button type="submit" disabled={submitting}>
                    <Save className="mr-2 h-4 w-4" aria-hidden />
                    Salvar
                </Button>
            </div>
        </form>
    )
}
