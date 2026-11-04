"use client"

import { useState } from "react"
import { Info, ListOrdered, Loader2, Play, Wand2 } from "lucide-react"
import { ReasonButton } from "@/components/ui/reason-button"
import type { ModelVariantValue } from "@/features/ai/components/model-picker/ModelVariantFields"
import { useTaskDetail } from "@/features/tasks/hooks/useTasks"
import { useRefinementRealtime, useTaskRefinement } from "@/features/refinement/hooks/useRefinement"
import type { WorkbenchModelRole } from "../../constants"
import { useAgenticSettings, useCentralQueue, useRefineWorkbench, useStartWorkbench } from "../../hooks/useAgentic"
import { useFieldAttachments } from "../../hooks/useWorkbenchFiles"
import { openPlanBlockReason, startRefineBlockReason, type ModelOverride } from "../../logic"
import { saveStartDraft, startFieldKey } from "../../start-draft"
import { AttachableTextarea } from "./AttachableTextarea"
import { StartTaskBlock } from "./StartTaskBlock"
import { StartWorkbenchModelSettings } from "./StartWorkbenchModelSettings"
import { StartWorkbenchSwitches } from "./StartWorkbenchSwitches"
import type { CentralDto } from "../../types"

/**
 * Estado inicial da mesa (tarefa ainda sem mesa): o código, o título e as abas **Descrição** e
 * **Especificação** da tarefa, as chaves **Gerar prévia** e **Gerar plano após refinar** (com herança da
 * central) e um campo opcional de **informações adicionais**. Duas saídas, na mesma linha:
 * - **Refinar tarefa** (OPE-137): abre a mesa em "Refinando" com o Agente Refinador (o texto e os anexos
 *   vão no primeiro prompt do refinamento) — ou em "Especificação pronta" com o refinamento já concluído,
 *   quando o texto passa para o campo do "Gerar plano";
 * - **Abrir mesa e gerar o plano** (Ctrl+Enter): o planejamento direto, bloqueado com um refinamento em andamento.
 *
 * O controle de modelos (OPE-134) fica à esquerda dos botões. A escolha é **só desta tela** (não é
 * gravada na tarefa) e vai junto do clique; abrir pela fila da central ou recarregar volta aos padrões.
 */
export function StartWorkbench({ central, taskId }: { central: CentralDto; taskId: string }) {
    useRefinementRealtime(taskId)
    const task = useTaskDetail(taskId)
    const settings = useAgenticSettings()
    const refinementState = useTaskRefinement(taskId)
    const queue = useCentralQueue(central.id)
    const start = useStartWorkbench()
    const refine = useRefineWorkbench()
    const [text, setText] = useState("")
    const [modelOverrides, setModelOverrides] = useState<Partial<Record<WorkbenchModelRole, ModelOverride>>>({})
    const attachments = useFieldAttachments(startFieldKey(taskId))
    const availability = settings.data?.availability
    const agentic = !central.config.enabled ? "A central está desativada" : availability && !availability.available ? availability.reason : null
    const otherProject = task.data && task.data.project?.id !== central.projectId ? `A tarefa não é do projeto ${central.projectName}` : null
    const queueItem = queue.data?.find((item) => item.taskId === taskId) ?? null
    const existing = refinementState.data?.refinement ?? null
    const blockInput = {
        agentic: agentic ?? null,
        otherProject,
        upload: attachments.blockReason ?? null,
        refinement: refinementState.data
            ? { available: refinementState.data.availability.available, reason: refinementState.data.availability.reason, existing: existing ? { concluded: existing.concluded, running: existing.runState === "running", liveChat: existing.liveChat } : null }
            : undefined,
        hasInput: Boolean(text.trim()) || attachments.fileIds.length > 0,
    }
    const pending = start.isPending || refine.isPending || !task.data
    const planBlock = openPlanBlockReason(blockInput)
    const refineBlock = startRefineBlockReason(blockInput)
    const notice = agentic ?? otherProject

    /** Troca local de um papel: com modelo vira a escolha da abertura; "Padrão da central" remove a troca. */
    const setRoleModel = (role: WorkbenchModelRole, input: ModelVariantValue) => {
        setModelOverrides((current) => {
            const next = { ...current }
            if (input.model) next[role] = { model: input.model, variant: input.variant }
            else delete next[role]
            return next
        })
    }
    const models = Object.keys(modelOverrides).length ? { modelOverrides } : {}

    const onRefine = () => {
        // Refinamento já concluído: a mesa abre em "Especificação pronta" e o texto vai para o "Gerar plano".
        const concluded = Boolean(existing?.concluded)
        if (concluded) saveStartDraft(taskId, text)
        refine.mutate(
            { centralId: central.id, taskId, ...(concluded ? {} : { text: text.trim() || undefined, ...(attachments.fileIds.length ? { fileIds: attachments.fileIds } : {}) }), ...models },
            {
                onSuccess: () => {
                    if (concluded) return
                    setText("")
                    attachments.clearSent()
                },
            },
        )
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
            <div className="my-auto flex w-full flex-col gap-4" data-ctrl-enter-scope>
                <StartTaskBlock query={task} />
                <p className="text-sm text-muted-foreground">
                    A mesa trabalha no diretório <span className="font-mono text-foreground">{central.config.sessionDirectory}</span>: refine a tarefa com o Agente Refinador ou comece direto pelo plano. Você revisa o plano antes de qualquer alteração no código.
                </p>
                {queueItem && (
                    <p className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary">
                        <ListOrdered className="h-3.5 w-3.5" aria-hidden /> Na fila da central — posição {queueItem.position}. A mesa abre {existing && !existing.concluded ? "em Refinando " : ""}quando uma vaga liberar.
                    </p>
                )}
                {task.data && <StartWorkbenchSwitches central={central} task={task.data} />}
                <div className="space-y-1.5">
                    <label htmlFor="workbench-start-context" className="text-sm font-medium">
                        Informações adicionais (opcional)
                    </label>
                    <AttachableTextarea id="workbench-start-context" rows={5} value={text} onValueChange={setText} replyEnabled={false} placeholder="Ex.: regras de negócio, decisões, links, o que evitar…" attachments={attachments} />
                    <p className="text-xs text-muted-foreground">Essas informações (e os arquivos anexados) vão junto da tarefa no primeiro prompt: do refinamento ou do plano.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Modelos (à esquerda) e os botões (à direita), como na barra da mesa. */}
                    <div className="mr-auto flex min-w-0 max-w-full items-center gap-3">
                        <StartWorkbenchModelSettings central={central} settings={settings.data?.settings} overrides={modelOverrides} refiner={refinementState.data?.refinerModel ?? null} onChange={setRoleModel} />
                    </div>
                    <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
                        <ReasonButton variant="outline" disabled={pending} disabledReason={refineBlock} onClick={onRefine}>
                            {refine.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
                            Refinar tarefa
                        </ReasonButton>
                        <ReasonButton
                            disabled={pending}
                            disabledReason={planBlock}
                            buttonProps={{ "data-ctrl-enter-submit": true }}
                            onClick={() =>
                                start.mutate(
                                    { centralId: central.id, taskId, text: text.trim() || undefined, ...(attachments.fileIds.length ? { fileIds: attachments.fileIds } : {}), ...models },
                                    { onSuccess: () => attachments.clearSent() },
                                )
                            }
                        >
                            {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                            Abrir mesa e gerar o plano
                        </ReasonButton>
                    </div>
                    {notice && (
                        <p className="flex w-full items-center justify-end gap-1.5 text-xs text-muted-foreground">
                            <Info className="h-3.5 w-3.5" aria-hidden /> {notice}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
