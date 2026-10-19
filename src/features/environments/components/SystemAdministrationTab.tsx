"use client"

import { useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { api, unwrapApi, apiErrorMessage } from "@/lib/api"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormActions } from "@/components/ui/form-actions"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { ProviderModelCard } from "@/features/ai/components/understand-task/ProviderModelCard"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { DEFAULT_ENVIRONMENT_SETTINGS, environmentSettingsSchema, type EnvironmentSettings } from "../schemas"
import { HostProbeCard } from "./HostProbeCard"

const key = ["ai", "system-administration"]
interface SettingsDto {
    settings: EnvironmentSettings
    availability: { available: boolean; reason: string | null }
}

/** Aba "Administração de sistema" (Integrações › Provedores de IA): agente e instruções do módulo Ambientes. */
export function SystemAdministrationTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const cache = useQueryClient()
    const query = useQuery({
        queryKey: key,
        queryFn: async () => unwrapApi<SettingsDto>((await api.get("/ai/features/system-administration")).data),
    })
    const save = useMutation({
        mutationFn: async (input: EnvironmentSettings) =>
            unwrapApi<SettingsDto>((await api.put("/ai/features/system-administration", input)).data),
        onSuccess: (data) => {
            cache.setQueryData(key, data)
            toast.success("Configuração salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Falha ao salvar")),
    })
    const form = useForm<EnvironmentSettings>({
        resolver: zodResolver(environmentSettingsSchema),
        defaultValues: DEFAULT_ENVIRONMENT_SETTINGS,
        mode: "onChange",
    })
    const providers = useAiProviderStatuses()
    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    const dirty = form.formState.isDirty
    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])
    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data)
        return <ErrorState title="Falha ao carregar Administração de sistema" onRetry={() => void query.refetch()} />
    const errors = form.formState.errors
    const submit = () =>
        void form.handleSubmit(async (values) => {
            await save.mutateAsync(values).catch(() => null)
        })()
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Administração de sistema</CardTitle>
                    <CardDescription>
                        As operações dos ambientes rodam no host pelo OpenCode: leitura do Docker e logs pelo shell, e
                        publicação/restauração pelo agente. O Opex coordena e apresenta os resultados.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FormToggleCard
                        control={form.control}
                        name="enabled"
                        id="env-enabled"
                        label="Habilitar agentes de Ambientes"
                        description="Sem isso, publicar, restaurar e inspecionar ficam indisponíveis."
                        onLabel="Ativado"
                        offLabel="Desativado"
                    />
                    <p className="text-sm text-muted-foreground">{query.data.availability.reason ?? "Agente disponível"}</p>
                </CardContent>
            </Card>
            <ProviderModelCard form={form} providers={providers.providers} fixedProvider="opencode" />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Execução no host</CardTitle>
                    <CardDescription>
                        O Opex executa tudo no host pelo shell do OpenCode (o app pode estar em container): grava o acesso
                        temporário, lê o Docker e acompanha os logs. O agente só publica, restaura e identifica a versão do
                        banco.
                    </CardDescription>
                </CardHeader>
                <CardContent className={FORM_GRID_WIDE}>
                    <Field
                        id="env-session-dir"
                        label="Diretório administrativo no OpenCode"
                        error={errors.sessionDirectory?.message}
                    >
                        <Input id="env-session-dir" className="font-mono" {...form.register("sessionDirectory")} />
                    </Field>
                    <Field
                        id="env-access-dir"
                        label="Diretório protegido de acesso (no host do OpenCode, 0700)"
                        error={errors.accessDirectory?.message}
                    >
                        <Input id="env-access-dir" className="font-mono" {...form.register("accessDirectory")} />
                    </Field>
                    <Field id="env-skill" label="Skill (opcional)" error={errors.skill?.message}>
                        <Input id="env-skill" className="font-mono" {...form.register("skill")} />
                    </Field>
                    <Field
                        id="env-timeout"
                        label="Tempo máximo da operação (minutos)"
                        error={errors.timeoutMinutes?.message}
                    >
                        <Input
                            id="env-timeout"
                            type="number"
                            {...form.register("timeoutMinutes", { valueAsNumber: true })}
                        />
                    </Field>
                    <Field id="env-instructions" label="Instruções compartilhadas" error={errors.instructions?.message}>
                        <Textarea id="env-instructions" {...form.register("instructions")} />
                    </Field>
                </CardContent>
            </Card>
            <HostProbeCard dirty={dirty} />
            <FormActions
                dirty={dirty}
                pending={save.isPending}
                valid={form.formState.isValid}
                onUndo={() => form.reset(query.data.settings)}
                onSave={submit}
            />
        </>
    )
}
