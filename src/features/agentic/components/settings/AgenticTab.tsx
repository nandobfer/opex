"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Bot, FolderGit2, Info, Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { useAgenticRealtime, useAgenticSettings, useSaveAgenticSettings } from "../../hooks/useAgentic"
import { agenticSettingsSchema, DEFAULT_AGENTIC_SETTINGS, type AgenticSettings } from "../../schemas"
import { AgentRolesCard } from "./AgentRolesCard"
import { CentralsCard } from "./CentralsCard"
import { CiFixCard } from "./CiFixCard"
import { ColumnsCard } from "./ColumnsCard"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Abas internas da configuração: agentes padrão (com salvar) e a lista de centrais. */
type SettingsTab = "agentes" | "centrais"
const SETTINGS_TABS: readonly SettingsTab[] = ["agentes", "centrais"]
const TABS: readonly IntegrationTabDef<SettingsTab>[] = [
    { id: "agentes", label: "Agentes", icon: Bot },
    { id: "centrais", label: "Centrais de desenvolvimento", icon: FolderGit2 },
]

/**
 * Aba "Desenvolvimento agêntico" (Provedores de IA): liga a feature, define os agentes padrão de
 * cada etapa e lista as centrais (uma por projeto). Só usa o OpenCode.
 */
export function AgenticTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    useAgenticRealtime()
    const query = useAgenticSettings()
    const save = useSaveAgenticSettings()
    const form = useForm<AgenticSettings>({ resolver: zodResolver(agenticSettingsSchema), mode: "onChange", defaultValues: DEFAULT_AGENTIC_SETTINGS })
    const dirty = form.formState.isDirty
    const agents = useWatch({ control: form.control, name: "agents" })
    const columns = useWatch({ control: form.control, name: "columns" })
    const ci = useWatch({ control: form.control, name: "ci" })
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab(SETTINGS_TABS, "agentes", dirty, () => (query.data ? form.reset(query.data.settings) : undefined), "abaAgentic")

    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])

    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />

    const availability = query.data.availability
    const submit = form.handleSubmit(async (values) => {
        const saved = await save.mutateAsync(values).catch(() => null)
        if (saved) form.reset(saved.settings)
    })

    return (
        <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções do desenvolvimento agêntico">
            {tab === "agentes" && (
                <>
                    <Card>
                        <CardContent className="space-y-3 pt-6">
                            <FormToggleCard<AgenticSettings>
                                control={form.control}
                                name="enabled"
                                id="agentic-enabled"
                                label="Desenvolvimento agêntico"
                                description="Mesas de trabalho em que agentes do OpenCode planejam, implementam, sobem a prévia e abrem o PR de tarefas do projeto"
                            />
                            <AnimatePresence initial={false}>
                                {!dirty && !availability.available && availability.reason && (
                                    <motion.p key="availability" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {availability.reason}
                                    </motion.p>
                                )}
                            </AnimatePresence>
                            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                <span>
                                    Os agentes executam comandos (git, docker, gh) na máquina do OpenCode a partir do conteúdo das tarefas e das revisões do PR. Pedidos de permissão e perguntas aparecem na mesa para você aprovar ou responder; confira as
                                    permissões dos agentes no opencode.json.
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    <AgentRolesCard
                        title="Agentes padrão"
                        description="Usados por todas as centrais; cada central pode personalizar uma etapa. Sem modelo, vale o modelo configurado no próprio agente."
                        idPrefix="agentic-default"
                        values={agents}
                        onChange={(role, next) => form.setValue(`agents.${role}`, next ?? { agent: null, model: null, variant: null }, { shouldDirty: true, shouldValidate: true })}
                    />

                    <ColumnsCard
                        title="Fila da central de desenvolvimento"
                        description="Ao mover um card para esta coluna, a mesa da tarefa entra na fila. Havendo vaga, a mesa abre na hora; senão, aguarda na ordem dos cards do kanban. As centrais herdam esta coluna, salvo quando personalizam."
                        idPrefix="agentic-queue"
                        fields={[
                            {
                                id: "agentic-col-queue",
                                label: "Coluna que inicia a mesa automaticamente",
                                noneLabel: "Nenhuma",
                                value: columns.queue,
                                onChange: (value) => form.setValue("columns.queue", value, { shouldDirty: true, shouldValidate: true }),
                            },
                        ]}
                    />
                    <ColumnsCard
                        title="Movimentação das colunas"
                        description={`Ao avançar o desenvolvimento, a tarefa é movida para a coluna escolhida. "Não mover" deixa como está. As centrais herdam estas colunas, salvo quando personalizam.`}
                        idPrefix="agentic-movement"
                        fields={[
                            { id: "agentic-col-start", label: "Ao abrir a mesa (implementação)", value: columns.onStart, onChange: (value) => form.setValue("columns.onStart", value, { shouldDirty: true, shouldValidate: true }) },
                            { id: "agentic-col-pr", label: "Ao abrir o Pull Request", value: columns.onPr, onChange: (value) => form.setValue("columns.onPr", value, { shouldDirty: true, shouldValidate: true }) },
                            { id: "agentic-col-done", label: "Ao concluir (PR mergeado)", value: columns.onDone, onChange: (value) => form.setValue("columns.onDone", value, { shouldDirty: true, shouldValidate: true }) },
                        ]}
                    />

                    <CiFixCard
                        idPrefix="agentic-ci"
                        value={ci}
                        limitError={form.formState.errors.ci?.ciFixLimit?.message}
                        onChange={(next) => form.setValue("ci", next, { shouldDirty: true, shouldValidate: true })}
                    />

                    <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => form.reset(query.data.settings)}>
                            <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                        </Button>
                        <Button type="button" className="gap-1.5" disabled={(!dirty && !query.data.isDefault) || save.isPending} onClick={() => void submit()}>
                            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                            Salvar
                        </Button>
                    </div>
                </>
            )}

            {tab === "centrais" && <CentralsCard />}
        </IntegrationTabs>
    )
}
