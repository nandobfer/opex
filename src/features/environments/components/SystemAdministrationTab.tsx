import { useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { api, unwrapApi, apiErrorMessage } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { ProviderModelCard } from "@/features/ai/components/understand-task/ProviderModelCard"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { DEFAULT_ENVIRONMENT_SETTINGS, environmentSettingsSchema, type EnvironmentSettings } from "../schemas"

const key = ["ai", "system-administration"]
interface SettingsDto {
    settings: EnvironmentSettings
    availability: { available: boolean; reason: string | null }
}
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
    return (
        <>
            <section className="space-y-4 rounded-lg border p-6">
                <h2 className="font-semibold">Administração de sistema</h2>
                <label className="flex gap-2 text-sm">
                    <input type="checkbox" {...form.register("enabled")} />
                    Habilitar agentes de Ambientes
                </label>
                <p className="text-sm text-muted-foreground">{query.data.availability.reason ?? "Agente disponível"}</p>
            </section>
            <ProviderModelCard form={form} providers={providers.providers} fixedProvider="opencode" />
            <section className="space-y-5 rounded-lg border p-6">
                <Field
                    id="env-session-dir"
                    label="Diretório administrativo no OpenCode"
                    error={errors.sessionDirectory?.message}
                >
                    <Input id="env-session-dir" {...form.register("sessionDirectory")} />
                </Field>
                <Field
                    id="env-access-dir"
                    label="Diretório protegido de acesso temporário (0700)"
                    error={errors.accessDirectory?.message}
                >
                    <Input id="env-access-dir" {...form.register("accessDirectory")} />
                </Field>
                <p className="text-sm text-muted-foreground">
                    Esse diretório deve ser acessível ao Opex e ao OpenCode no mesmo caminho, com o mesmo usuário e sem
                    leitura por terceiros. Em Docker, configure um volume compartilhado. O agente deve ter permissões
                    administrativas previamente restritas ao ambiente; solicitações adicionais são recusadas.
                </p>
                <Field id="env-skill" label="Skill (opcional)" error={errors.skill?.message}>
                    <Input id="env-skill" {...form.register("skill")} />
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
            </section>
            <footer className="flex justify-end gap-2 border-t pt-6">
                <Button type="button" variant="outline" onClick={() => form.reset(query.data.settings)}>
                    Desfazer
                </Button>
                <Button
                    type="button"
                    disabled={save.isPending || !dirty}
                    onClick={() =>
                        void form.handleSubmit(async (values) => {
                            await save.mutateAsync(values).catch(() => null)
                        })()
                    }
                >
                    Salvar
                </Button>
            </footer>
        </>
    )
}
