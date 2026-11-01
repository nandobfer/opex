"use client"

import { MemoriesNoticesBlock } from "@/features/ai/components/memories/MemoriesNotices"
import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, RefreshCcw, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SecretValueInput, type SecretValueAction } from "@/components/ui/secret-value-input"
import { Skeleton } from "@/components/ui/skeleton"
import { FORM_GRID } from "@/components/ui/form-grid"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { DetailActions } from "@/features/integrations/components/detail/DetailActions"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { ApiDocsCard } from "@/features/integrations/components/detail/ApiDocsCard"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { connectionInputSchema, type ConnectionInput, type ConnectionValues } from "../../schemas/connection"
import type { BootstrapStepDto, EngramindConnectionDto } from "../../types"
import { useEngramindConnection, useEngramindEnvironmentOptions, useRunEngramindBootstrap, useSaveEngramindConnection } from "../../hooks/useEngramindConnection"
import { InfoField } from "../shared/InfoField"
import { Section } from "../shared/Section"
import { ConnectionStatus } from "./ConnectionStatus"

const NO_ENV = "__none__"

interface ConnectionTabProps {
    onDirtyChange: (dirty: boolean) => void
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
    onExplore: () => void
}

/** Aba Conexão: URL base, URL pública do Opex, token (só gravado), Ambiente e o estado do token/webhook. */
export function ConnectionTab(props: ConnectionTabProps) {
    const connection = useEngramindConnection()
    if (connection.isLoading) return <ConnectionSkeleton />
    if (connection.isError || !connection.data) return <ErrorState description={apiErrorMessage(connection.error)} onRetry={() => void connection.refetch()} />
    return <ConnectionForm {...props} connection={connection.data} />
}

function ConnectionForm({ connection, onDirtyChange, data, draft, setDraft, dirty, pending, onSave, onUndo, onExplore }: ConnectionTabProps & { connection: EngramindConnectionDto }) {
    const save = useSaveEngramindConnection()
    const bootstrap = useRunEngramindBootstrap()
    const environments = useEngramindEnvironmentOptions()
    const [token, setToken] = useState<SecretValueAction | undefined>(undefined)
    const [steps, setSteps] = useState<BootstrapStepDto[]>([])
    const form = useForm<ConnectionInput, unknown, ConnectionValues>({
        resolver: zodResolver(connectionInputSchema),
        mode: "onChange",
        defaultValues: { baseUrl: connection.baseUrl ?? "", opexPublicUrl: connection.opexPublicUrl ?? "", environmentId: connection.environmentId || null, adminToken: "" },
    })
    const formDirty = form.formState.isDirty || token !== undefined
    useEffect(() => onDirtyChange(formDirty), [formDirty, onDirtyChange])

    const submit = form.handleSubmit(async (values) => {
        try {
            const result = await save.mutateAsync({ ...values, adminToken: token?.action === "set" ? token.value : undefined })
            setSteps(result.steps)
            setToken(undefined)
            form.reset({ baseUrl: result.connection.baseUrl ?? "", opexPublicUrl: result.connection.opexPublicUrl ?? "", environmentId: result.connection.environmentId || null, adminToken: "" })
            const failed = result.steps.find((step) => step.status === "failed")
            if (failed) toast.warning(failed.message)
            else toast.success("Conexão com o Engramind salva")
        } catch (error) {
            toast.error(apiErrorMessage(error, "Não foi possível salvar a conexão"))
        }
    })
    const repeat = async () => setSteps((await bootstrap.mutateAsync(undefined)).steps)
    const errors = form.formState.errors

    return (
        <div className="flex flex-col gap-6">
            <MemoriesNoticesBlock />
            <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
                <Section title="Conexão" info="O servidor do Opex fala com o Engramind por esta URL, com o token admin guardado cifrado. O navegador nunca chama o Engramind." description="Ao salvar com o token de bootstrap, o Opex cria o app opex, emite um token próprio, revoga o de bootstrap e registra o webhook.">
                    <div className={FORM_GRID}>
                        <InfoField id="eng-base-url" label="URL base do Engramind" info="Endereço que o SERVIDOR do Opex alcança (ex.: http://engramind-api:8000 na rede Docker)." error={errors.baseUrl?.message}>
                            <Input id="eng-base-url" placeholder="http://engramind-api:8000" {...form.register("baseUrl")} />
                        </InfoField>
                        <InfoField id="eng-public-url" label="URL pública do Opex" info="Endereço do Opex que o Engramind alcança para entregar os webhooks (recebidos em /api/engramind/webhook)." error={errors.opexPublicUrl?.message}>
                            <Input id="eng-public-url" placeholder="http://opex:3100" {...form.register("opexPublicUrl")} />
                        </InfoField>
                        <InfoField id="eng-token" label="Token admin" info="Token eng.tk_… admin com read+write+delete. O de bootstrap é trocado automaticamente por um token próprio do Opex. Só é gravado, nunca exibido.">
                            <SecretValueInput id="eng-token" label="token admin" configured={connection.tokenConfigured} statusLabel={connection.tokenConfigured ? "Configurado" : "Não configurado"} action={token} onChange={setToken} allowClear={false} />
                        </InfoField>
                        <InfoField id="eng-env" label="Ambiente do Engramind" info="Ambiente (módulo Ambientes) com a instalação do Engramind (ex.: /home/engramind adotado). Usado na aba Variáveis de ambiente." hint={environments.data?.length === 0 ? "Nenhum Ambiente cadastrado: adote o projeto do Engramind em Ambientes." : undefined}>
                            <Controller
                                control={form.control}
                                name="environmentId"
                                render={({ field }) => (
                                    <Select value={field.value ?? NO_ENV} onValueChange={(value) => field.onChange(value === NO_ENV ? null : value)}>
                                        <SelectTrigger id="eng-env" className="bg-transparent">
                                            <SelectValue placeholder="Escolha o Ambiente" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NO_ENV}>Nenhum</SelectItem>
                                            {(environments.data ?? []).map((env) => (
                                                <SelectItem key={env.id} value={env.id}>
                                                    {env.name} — {env.location}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </InfoField>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="submit" disabled={!formDirty || save.isPending}>
                            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />} Salvar conexão
                        </Button>
                    </div>
                </Section>
            </form>
            <BootstrapSteps steps={steps} />
            <ConnectionStatus
                connection={connection}
                actions={
                    connection.configured && (connection.bootstrapPending || !connection.webhook?.matches) ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => void repeat()} disabled={bootstrap.isPending}>
                            {bootstrap.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCcw className="mr-2 h-4 w-4" aria-hidden />} Repetir configuração automática
                        </Button>
                    ) : null
                }
            />
            <form
                onSubmit={(event) => {
                    event.preventDefault()
                    if (dirty) void onSave()
                }}
                className="flex flex-col gap-6"
            >
                <GeneralCard draft={draft} setDraft={setDraft} />
                <ApiDocsCard data={data} draft={draft} setDraft={setDraft} dirty={dirty} onExplore={onExplore} />
                <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
            </form>
        </div>
    )
}

function BootstrapSteps({ steps }: { steps: BootstrapStepDto[] }) {
    return (
        <AnimatePresence initial={false}>
            {steps.length > 0 && (
                <motion.ol key="steps" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-1 overflow-hidden rounded-lg border bg-muted/30 p-3 text-sm">
                    {steps.map((step, index) => (
                        <motion.li key={`${step.id}-${index}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className={step.status === "failed" ? "text-destructive" : step.status === "skipped" ? "text-muted-foreground" : "text-success"}>
                            {step.status === "failed" ? "✕" : step.status === "skipped" ? "–" : "✓"} {step.message}
                        </motion.li>
                    ))}
                </motion.ol>
            )}
        </AnimatePresence>
    )
}

function ConnectionSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true">
            <div className="space-y-4 rounded-xl border p-6">
                <Skeleton className="h-5 w-32" />
                <div className={FORM_GRID}>
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="space-y-1.5">
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                    ))}
                </div>
            </div>
            <Skeleton className="h-40 w-full rounded-xl" />
        </div>
    )
}
