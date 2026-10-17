"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { FORM_GRID } from "@/components/ui/form-grid"
import {
    useEnvironmentApi,
    useEnvironmentDetail,
    useSaveEnvironment,
    useEnvironmentRepoConfig,
} from "../hooks/useEnvironments"
import { DEFAULT_ENVIRONMENT, environmentSchema, type EnvironmentInput } from "../schemas"
import { EnvironmentVariables } from "./EnvironmentVariables"

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
            <header>
                <Button variant="ghost" asChild>
                    <Link href={`${api.href}/${repoId}`}>Voltar para ambientes</Link>
                </Button>
                <h1 className="text-xl font-semibold">{editing ? "Configurar ambiente" : "Novo ambiente"}</h1>
            </header>
            <section className={`${FORM_GRID} rounded-lg border p-6`}>
                <Field id="environment-name" label="Nome" error={errors.name?.message}>
                    <Input id="environment-name" {...form.register("name")} />
                </Field>
                <Field id="environment-slug" label="Slug (identidade dos recursos)" error={errors.slug?.message}>
                    <Input id="environment-slug" readOnly={editing} {...form.register("slug")} />
                </Field>
                <Field id="environment-branch" label="Branch" error={errors.branch?.message}>
                    <Input id="environment-branch" {...form.register("branch")} />
                </Field>
                <Field id="environment-directory" label="Diretório absoluto no host" error={errors.directory?.message}>
                    <Input id="environment-directory" {...form.register("directory")} />
                </Field>
                <Field id="environment-compose" label="Arquivo Compose" error={errors.composeFile?.message}>
                    <Input id="environment-compose" {...form.register("composeFile")} />
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
                                value={field.value.join(", ")}
                                onChange={(e) =>
                                    field.onChange(
                                        e.target.value
                                            .split(",")
                                            .map((v) => v.trim())
                                            .filter(Boolean),
                                    )
                                }
                            />
                        </Field>
                    )}
                />
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
                                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                                />
                            </Field>
                        )}
                    />
                ))}
                <Field id="environment-health" label="URL do healthcheck" error={errors.healthcheck?.message}>
                    <Input id="environment-health" {...form.register("healthcheck")} />
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
            </section>
            <EnvironmentVariables form={form} canManageSecrets={repo.data.canManageSecrets} />
            <footer className="flex justify-end gap-2 border-t pt-6">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                        form.reset(
                            query.data ? environmentSchema.strip().parse(query.data.environment) : DEFAULT_ENVIRONMENT,
                        )
                    }
                >
                    Desfazer
                </Button>
                <Button type="submit" disabled={save.isPending || Boolean(query.data?.environment.activeOperationId)}>
                    Salvar ambiente
                </Button>
            </footer>
        </form>
    )
}
