import { z } from "zod"
import { MANUAL_STAGES } from "@/features/agentic/constants"
import { manualStageOptions } from "@/features/agentic/logic"
import { formReplySchema, permissionReplySchema, setWorkbenchStageSchema, startWorkbenchSchema, workbenchModelSchema } from "@/features/agentic/schemas"
import { listWorkbenchEvents } from "@/features/agentic/server/hub"
import { listWorkbenchesInProgress } from "@/features/agentic/server/in-progress"
import {
    approve,
    cancelWait,
    deleteWorkbench,
    getWorkbench,
    getWorkbenchByTask,
    implement,
    interrupt,
    listCentralWorkbenches,
    reconnect,
    reopen,
    replyForm,
    replyPermission,
    requestCorrection,
    retry,
    revisePlan,
    setWorkbenchStage,
    setWorkbenchModel,
    startWorkbench,
    submitPrFeedback,
} from "@/features/agentic/server/workflow"
import type { WorkbenchDto } from "@/features/agentic/types"
import { clipText, resolveTask, taskRefSchema } from "./helpers"
import { defineTool, OpexToolError, type OpexTool } from "./define"

const workbenchId = z.string().describe("Id da mesa (de list_workbenches ou get_workbench)")
const feedback = z.string().min(3).describe("Texto para o agente da mesa")
const reason = z.string().min(3).max(2000).describe("Motivo (vai para a auditoria e para a saída da mesa)")

function slimWorkbench(workbench: WorkbenchDto) {
    return {
        id: workbench.id,
        centralId: workbench.centralId,
        taskId: workbench.taskId,
        taskCode: workbench.taskCode,
        taskTitle: workbench.taskTitle,
        stage: workbench.stage,
        runState: workbench.runState,
        error: workbench.error,
        agenticFlow: workbench.agenticFlow,
        branch: workbench.branch,
        previewUrl: workbench.previewUrl,
        pr: workbench.pr,
        models: workbench.models,
        lastPlan: workbench.plans.at(-1) ? { version: workbench.plans.at(-1)!.version, text: clipText(workbench.plans.at(-1)!.text, 8000) } : null,
        pendingPermissions: workbench.pendingPermissions,
        pendingForms: workbench.pendingForms,
        slotQueue: workbench.slotQueue,
        buildQueuePosition: workbench.buildQueuePosition,
        forksDonePrompt: workbench.forksDonePrompt,
        usage: workbench.usage,
        startedAt: workbench.startedAt,
        completedAt: workbench.completedAt,
        manualCompletion: workbench.manualCompletion,
        /** Etapas que set_workbench_stage/complete_workbench aceitam agora (e o motivo das indisponíveis). */
        settableStages: manualStageOptions(workbench),
    }
}

/** Ação simples de mesa (sem entrada além do id). */
function simpleAction(name: string, label: string, description: string, run: (id: string) => Promise<WorkbenchDto>, risk: "write" | "destructive" = "write"): OpexTool {
    return defineTool({
        name,
        group: "workbenches",
        label,
        risk,
        description,
        input: z.object({ workbenchId }),
        summarize: () => `${label} na mesa`,
        execute: async (input) => slimWorkbench(await run(input.workbenchId)),
    })
}

function feedbackAction(name: string, label: string, description: string, run: (id: string, text: string) => Promise<WorkbenchDto>): OpexTool {
    return defineTool({
        name,
        group: "workbenches",
        label,
        risk: "write",
        description,
        input: z.object({ workbenchId, text: feedback }),
        summarize: () => `${label} na mesa`,
        execute: async (input) => slimWorkbench(await run(input.workbenchId, input.text)),
    })
}

export const workbenchTools: OpexTool[] = [
    defineTool({
        name: "list_workbenches",
        group: "workbenches",
        label: "Listar mesas",
        risk: "read",
        description: "Mesas de trabalho em andamento em todas as centrais (ou só as de uma central), com etapa, estado e o que cada uma aguarda.",
        input: z.object({ centralId: z.string().optional() }),
        execute: async ({ centralId }) => (centralId ? listCentralWorkbenches(centralId) : listWorkbenchesInProgress()),
    }),
    defineTool({
        name: "get_workbench",
        group: "workbenches",
        label: "Ler mesa",
        risk: "read",
        description: "Detalhes de uma mesa (por id da mesa ou pela tarefa): etapa, plano mais recente, PR, prévia, permissões e perguntas pendentes do agente da mesa.",
        input: z.object({ workbenchId: z.string().optional(), task: taskRefSchema.optional() }),
        execute: async (input) => {
            if (input.workbenchId) return slimWorkbench(await getWorkbench(input.workbenchId))
            if (!input.task) throw new OpexToolError("Informe workbenchId ou task")
            const { id } = await resolveTask(input.task)
            const workbench = await getWorkbenchByTask(id)
            return workbench ? slimWorkbench(workbench) : { workbench: null, message: "A tarefa não tem mesa de trabalho" }
        },
    }),
    defineTool({
        name: "get_workbench_output",
        group: "workbenches",
        label: "Saída da mesa",
        risk: "read",
        description: "Últimos eventos da conversa do agente da mesa (textos, ferramentas, avisos e fim de turno), para entender o que ele fez ou está pedindo.",
        input: z.object({ workbenchId, limit: z.number().int().min(1).max(200).optional().describe("Padrão 40") }),
        execute: async (input) => {
            const events = await listWorkbenchEvents(input.workbenchId)
            return events.slice(-(input.limit ?? 40)).map((event) => {
                if (event.type === "text") return { type: "text", text: clipText(event.text, 3000) }
                if (event.type === "tool") return { type: "tool", name: event.name, state: event.state, error: event.error ?? null }
                if (event.type === "user") return { type: "user", text: clipText(event.text, 2000) }
                return { ...event, ts: undefined }
            })
        },
    }),
    defineTool({
        name: "start_workbench",
        group: "workbenches",
        label: "Abrir mesa",
        risk: "write",
        description: "Abre a mesa de trabalho de uma tarefa numa central (o agente começa planejando). `text` são instruções extras.",
        input: z.object({ centralId: z.string(), task: taskRefSchema, text: z.string().optional() }),
        summarize: (input) => `Abrir a mesa de trabalho da tarefa ${input.task}`,
        execute: async (input) => {
            const { id } = await resolveTask(input.task)
            const parsed = startWorkbenchSchema.parse({ centralId: input.centralId, taskId: id, text: input.text })
            return slimWorkbench(await startWorkbench(parsed.centralId, parsed.taskId, parsed.text))
        },
    }),
    feedbackAction("revise_plan", "Revisar plano", "Pede ao agente da mesa uma nova versão do plano com o feedback dado.", revisePlan),
    defineTool({
        name: "implement",
        group: "workbenches",
        label: "Implementar",
        risk: "write",
        description: "Aprova o plano e manda o agente da mesa implementar (com informações extras opcionais).",
        input: z.object({ workbenchId, text: z.string().optional() }),
        summarize: () => "Aprovar o plano e implementar",
        execute: async (input) => slimWorkbench(await implement(input.workbenchId, input.text)),
    }),
    feedbackAction("request_correction", "Pedir correção", "Pede correções na implementação (etapa de prévia).", requestCorrection),
    feedbackAction("submit_pr_feedback", "Feedback do PR", "Envia feedback sobre o PR aberto para o agente corrigir.", submitPrFeedback),
    feedbackAction("reopen_workbench", "Reabrir mesa", "Reabre uma mesa concluída com um novo pedido.", reopen),
    simpleAction("approve_workbench", "Aprovar", "Aprova a etapa atual da mesa (ex.: a prévia, seguindo para o PR).", approve),
    simpleAction("retry_workbench", "Tentar novamente", "Refaz o turno da etapa que falhou ou foi interrompida.", retry),
    simpleAction("reconnect_workbench", "Reconectar", "Reconecta a mesa à sessão do agente.", reconnect),
    simpleAction("cancel_workbench_wait", "Cancelar espera", "Cancela a espera da mesa na fila de vagas da central.", cancelWait),
    simpleAction("interrupt_workbench", "Parar mesa", "Interrompe o turno em andamento do agente da mesa.", interrupt, "destructive"),
    defineTool({
        name: "complete_workbench",
        group: "workbenches",
        label: "Concluir mesa",
        risk: "destructive",
        description:
            "Conclui a mesa SEM PR (ex.: o problema já foi resolvido), de qualquer etapa que não seja Concluída: interrompe o turno em andamento, move a tarefa para a coluna 'Ao concluir' (como no merge), limpa o ambiente registrado pela mesa (prévia, backup do MongoDB, worktree e branch local, conforme a central) e exclui a sessão. A mesa continua existindo com histórico, planos e auditoria.",
        input: z.object({ workbenchId, reason }),
        summarize: (input) => `Concluir a mesa sem PR (motivo: ${input.reason}). A tarefa vai para "Ao concluir" e o ambiente registrado (prévia, backup, worktree e branch local) é limpo`,
        execute: async (input) => slimWorkbench(await setWorkbenchStage(input.workbenchId, setWorkbenchStageSchema.parse({ stage: "done", reason: input.reason }))),
    }),
    defineTool({
        name: "set_workbench_stage",
        group: "workbenches",
        label: "Definir etapa da mesa",
        risk: "write",
        confirmByDefault: true,
        description:
            "Define a etapa de espera da mesa sem passar pelo fluxo normal: plan_review (exige plano), preview (exige prévia publicada), pr_open ou changes_requested (exigem PR aberto) ou done (igual a complete_workbench). Interrompe o turno em andamento. Transições inválidas são recusadas; veja settableStages em get_workbench.",
        input: z.object({ workbenchId, stage: z.enum(MANUAL_STAGES), reason }),
        summarize: (input) => `Definir a etapa da mesa como "${input.stage}" (motivo: ${input.reason})`,
        execute: async ({ workbenchId: id, ...input }) => slimWorkbench(await setWorkbenchStage(id, setWorkbenchStageSchema.parse(input))),
    }),
    defineTool({
        name: "reply_workbench_permission",
        group: "workbenches",
        label: "Responder permissão",
        risk: "write",
        description: "Responde a um pedido de permissão do agente da mesa (once = permitir uma vez, always = sempre, reject = negar).",
        input: z.object({ workbenchId, requestId: z.string(), decision: z.enum(["once", "always", "reject"]), message: z.string().optional() }),
        summarize: (input) => `${input.decision === "reject" ? "Negar" : "Permitir"} a ação pedida pelo agente da mesa`,
        execute: async ({ workbenchId: id, requestId, ...input }) => slimWorkbench(await replyPermission(id, requestId, permissionReplySchema.parse(input))),
    }),
    defineTool({
        name: "reply_workbench_form",
        group: "workbenches",
        label: "Responder pergunta",
        risk: "write",
        description: "Responde a uma pergunta (formulário) do agente da mesa. `answerJson` é um objeto JSON com as respostas por campo (ex.: {\"q0\": \"sim\"}); ou cancel=true.",
        input: z.object({ workbenchId, formId: z.string(), answerJson: z.string().optional(), cancel: z.boolean().optional() }),
        summarize: () => "Responder a pergunta do agente da mesa",
        execute: async ({ workbenchId: id, formId, answerJson, cancel }) => {
            let answer: unknown
            try {
                answer = answerJson ? JSON.parse(answerJson) : undefined
            } catch {
                throw new OpexToolError("answerJson não é um JSON válido")
            }
            return slimWorkbench(await replyForm(id, formId, formReplySchema.parse({ answer, cancel })))
        },
    }),
    defineTool({
        name: "set_workbench_model",
        group: "workbenches",
        label: "Trocar modelo da mesa",
        risk: "write",
        description:
            "Troca o modelo (e a variante) de um papel da mesa: planning, implementation, build ou pr. Vale a partir do próximo turno; `model: null` volta ao modelo configurado na central.",
        input: workbenchModelSchema.extend({ workbenchId }),
        summarize: (input) => (input.model ? `Trocar o modelo do papel ${input.role} para ${input.model}` : `Voltar o papel ${input.role} ao modelo padrão`),
        execute: async ({ workbenchId: id, ...input }) => slimWorkbench(await setWorkbenchModel(id, input)),
    }),
    defineTool({
        name: "delete_workbench",
        group: "workbenches",
        label: "Excluir mesa",
        risk: "destructive",
        description: "Exclui a mesa de trabalho (sessões, worktree e ambiente de prévia são limpos).",
        input: z.object({ workbenchId }),
        summarize: () => "Excluir a mesa de trabalho e limpar o ambiente dela",
        execute: async (input) => deleteWorkbench(input.workbenchId),
    }),
]
