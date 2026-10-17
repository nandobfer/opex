"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormActions } from "@/components/ui/form-actions"
import { ErrorState } from "@/components/feedback/ErrorState"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import {
    useEnvironmentApi,
    useEnvironmentDetail,
    useSaveEnvironment,
    useEnvironmentRepoConfig,
} from "../hooks/useEnvironments"
import { DEFAULT_ENVIRONMENT, environmentSchema, type EnvironmentInput } from "../schemas"
import { EnvironmentVariables } from "./EnvironmentVariables"

/** Formulário de um ambiente (criação em `novo` e edição), em cards por assunto. */
export function EnvironmentEditor({ repoId, envId }: { repoId: string; envId: string }) {
    const api = useEnvironmentApi()
    const router = useRouter()
    const editing = envId !== "novo"
    const query = useEnvironmentDetail(repoId, envId)
    const repo = useEnvironmentRepoConfig(repoId)
    const save = useSaveEnvironment(repoId, editing ? envId : undefined)
    const form = useForm<EnvironmentInput>({
        resolver: zodResolver(environmentSchema),
        defaultValues: DEFAULT_ENVIRONMENT,
        mode: "onChange",
    })
    const slug = useWatch({ control: form.control, name: "slug" })
    useEffect(() => {
        if (query.data && !form.formState.isDirty) form.reset(environmentSchema.strip().parse(query.data.environment))
    }, [query.data, form])
    if (repo.isLoading || (editing && query.isLoading)) return <Skeleton className="h-96 w-full" />
    if (repo.isError || (editing && query.isError))
        return (
            <ErrorState
                title="Falha ao carregar configuração"
                onRetry={() => {
                    void repo.refetch()
                    if (editing) void query.refetch()
                }}
            />
        )
    if (!repo.data?.canEdit)
        return <p role="alert">Apenas o dono ou administradores do cliente podem configurar ambientes.</p>
    const errors = form.formState.errors
    const submit = form.handleSubmit(async (config) => {
        const saved = await save.mutateAsync({ config, revision: query.data?.environment.revision }).catch(() => null)
        if (saved) {
            form.reset(environmentSchema.strip().parse(saved))
            router.replace(`${api.href}/${repoId}/ambiente/${saved.id}`)
        }
    })
    return (
        <form className="flex flex-col gap-6" onSubmit={submit}>
            <header className="space-y-1">
                <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
                    <Link href={`${api.href}/${repoId}`}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Ambientes
                    </Link>
                </Button>
                <h1 className="text-xl font-semibold md:text-2xl">{editing ? "Configurar ambiente" : "Novo ambiente"}</h1>
                <p className="truncate font-mono text-xs text-muted-foreground">{slug || "defina o slug e os recursos"}</p>
            </header>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Identidade</CardTitle>
                    <CardDescription>Nome, slug (identidade dos recursos no host) e onde o projeto vive neste ambiente.</CardDescription>
                </CardHeader>
                <CardContent className={FORM_GRID_WIDE}>
                    <Field id="environment-name" label="Nome" error={errors.name?.message}>
                        <Input id="environment-name" {...form.register("name")} />
                    </Field>
                    <Field id="environment-slug" label="Slug (identidade dos recursos)" error={errors.slug?.message}>
                        <Input id="environment-slug" className="font-mono" readOnly={editing} {...form.register("slug")} />
                    </Field>
                    <Field id="environment-branch" label="Branch" error={errors.branch?.message}>
                        <Input id="environment-branch" className="font-mono" {...form.register("branch")} />
                    </Field>
                    <Field id="environment-directory" label="Diretório absoluto no host" error={errors.directory?.message}>
                        <Input id="environment-directory" className="font-mono" {...form.register("directory")} />
                    </Field>
                    <Field id="environment-compose" label="Arquivo Compose" error={errors.composeFile?.message}>
                        <Input id="environment-compose" className="font-mono" {...form.register("composeFile")} />
                    </Field>
                    <Controller
                        control={form.control}
                        name="services"
                        render={({ field }) => (
                            <Field
                                id="environment-services"
                                label="Serviços (separados por vírgula; vazio = todos)"
                                error={errors.services?.message}
                            >
                                <Input
                                    id="environment-services"
                                    className="font-mono"
                                    value={field.value.join(", ")}
                                    onChange={(event) =>
                                        field.onChange(
                                            event.target.value
                                                .split(",")
                                                .map((value) => value.trim())
                                                .filter(Boolean),
                                        )
                                    }
                                />
                            </Field>
                        )}
                    />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Recursos</CardTitle>
                    <CardDescription>Porta publicada e limites de CPU/memória do projeto Compose do ambiente.</CardDescription>
                </CardHeader>
                <CardContent className={FORM_GRID_WIDE}>
                    {(
                        [
                            ["port", "Porta publicada"],
                            ["cpus", "Limite de CPU"],
                            ["memoryMb", "Limite de memória (MB)"],
                        ] as const
                    ).map(([name, label]) => (
                        <Controller
                            key={name}
                            control={form.control}
                            name={name}
                            render={({ field }) => (
                                <Field id={`environment-${name}`} label={label} error={errors[name]?.message}>
                                    <Input
                                        id={`environment-${name}`}
                                        type="number"
                                        step={name === "cpus" ? "0.1" : "1"}
                                        value={field.value ?? ""}
                                        onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : null)}
                                    />
                                </Field>
                            )}
                        />
                    ))}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Saúde</CardTitle>
                    <CardDescription>Endereço usado para confirmar que o ambiente respondeu depois de publicar.</CardDescription>
                </CardHeader>
                <CardContent className={FORM_GRID_WIDE}>
                    <Field id="environment-health" label="URL do healthcheck" error={errors.healthcheck?.message}>
                        <Input id="environment-health" className="font-mono" {...form.register("healthcheck")} />
                    </Field>
                    <Field
                        id="environment-timeout"
                        label="Timeout do healthcheck (segundos)"
                        error={errors.healthcheckTimeout?.message}
                    >
                        <Input
                            id="environment-timeout"
                            type="number"
                            {...form.register("healthcheckTimeout", { valueAsNumber: true })}
                        />
                    </Field>
                </CardContent>
            </Card>
            <EnvironmentVariables form={form} canManageSecrets={repo.data.canManageSecrets} />
            <FormActions
                dirty={form.formState.isDirty}
                pending={save.isPending}
                valid={form.formState.isValid}
                disabled={Boolean(query.data?.environment.activeOperationId)}
                onUndo={() =>
                    form.reset(query.data ? environmentSchema.strip().parse(query.data.environment) : DEFAULT_ENVIRONMENT)
                }
                saveLabel="Salvar ambiente"
            />
        </form>
    )
}
