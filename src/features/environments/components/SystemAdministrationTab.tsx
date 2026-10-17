"use client"

import { useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Loader2, PlugZap } from "lucide-react"
import { api, unwrapApi, apiErrorMessage } from "@/lib/api"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FormActions } from "@/components/ui/form-actions"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { ProviderModelCard } from "@/features/ai/components/understand-task/ProviderModelCard"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { DEFAULT_ENVIRONMENT_SETTINGS, environmentSettingsSchema, type EnvironmentSettings } from "../schemas"

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
    const probe = useMutation({
        mutationFn: async () =>
            unwrapApi<{ ok: boolean; directory: string; detail: string }>((await api.post("/environments/access-probe")).data),
        onSuccess: (data) => (data.ok ? toast.success(data.detail) : toast.error(data.detail)),
        onError: (error) => toast.error(apiErrorMessage(error, "Falha ao testar o acesso do agente")),
    })
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
                        O agente do OpenCode executa as operações dos ambientes (Git, Docker e SSH); o Opex só coordena e
                        apresenta os resultados.
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
                    <CardTitle className="text-base">Execução dos agentes</CardTitle>
                    <CardDescription>
                        O agente do OpenCode roda no host dele (o app pode estar em container), então ele cria o diretório
                        protegido e busca o acesso temporário pela URL abaixo. O diretório não deve ser lido por terceiros.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className={FORM_GRID_WIDE}>
                    <Field
                        id="env-session-dir"
                        label="Diretório administrativo no OpenCode"
                        error={errors.sessionDirectory?.message}
                    >
                        <Input id="env-session-dir" className="font-mono" {...form.register("sessionDirectory")} />
                    </Field>
                    <Field
                        id="env-access-dir"
                        label="Diretório protegido de acesso (no host do agente, 0700)"
                        error={errors.accessDirectory?.message}
                    >
                        <Input id="env-access-dir" className="font-mono" {...form.register("accessDirectory")} />
                    </Field>
                    <Field
                        id="env-agent-url"
                        label="URL base do agente"
                        error={errors.agentBaseUrl?.message}
                    >
                        <Input id="env-agent-url" className="font-mono" placeholder="http://127.0.0.1:7001" {...form.register("agentBaseUrl")} />
                        <p className="text-xs text-muted-foreground">
                            Endereço do Opex que o host do agente alcança para buscar o acesso temporário.
                        </p>
                    </Field>
                    <Field
                        id="env-access-ttl"
                        label="Validade do acesso temporário (minutos)"
                        error={errors.accessTokenTtlMinutes?.message}
                    >
                        <Input
                            id="env-access-ttl"
                            type="number"
                            {...form.register("accessTokenTtlMinutes", { valueAsNumber: true })}
                        />
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
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={probe.isPending}
                            onClick={() => probe.mutate()}
                        >
                            {probe.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                                <PlugZap className="h-3.5 w-3.5" aria-hidden />
                            )}
                            Testar acesso do agente
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Salve a configuração antes de testar: o teste confirma que o agente alcança esta URL e grava o
                            acesso no host dele.
                        </p>
                    </div>
                </CardContent>
            </Card>
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
