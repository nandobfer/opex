import { z } from "zod"
import { PREVIEW_CLARITY_DIMENSION_LABELS, selectPreviewClarity, type PreviewClarityResult } from "@/features/orcamentos/clarity"
import { clienteCorrectionSchema, clienteDraftSchema } from "@/features/orcamentos/schemas"
import { OWNER_SCOPE } from "@/features/orcamentos/server/drafts"
import { approveOwnerDraft, createOwnerDraft, getOwnerDraft, getOwnerDraftDoc, recomputeOwnerEstimate, requireOwnerDraftEditable, setOwnerCorrection, setOwnerEstimateClient } from "@/features/orcamentos/server/owner"
import { prepareBudgetEstimate, prepareBudgetPreview, runBudgetEstimate, runBudgetPreview } from "@/features/orcamentos/server/preview"
import type { OrcamentoDraftDto } from "@/features/orcamentos/types"
import { ownerAttachmentActor } from "@/features/tasks/attachments/server/actor"
import { linkAttachmentsToDraft } from "@/features/tasks/attachments/server/service"
import { TASK_PRIORITIES } from "@/features/tasks/constants"
import { chatFilesToAttachments } from "./files"
import { collectFeatureStream, slimTask } from "./helpers"
import { contextSessionId, defineTool, OpexToolError } from "./define"

/**
 * Clareza da última geração de cada prévia (a clareza é transitória: só vem no fim da geração). A
 * tela bloqueia a aprovação com critério ausente; o agente segue a mesma regra.
 */
const globalClarity = globalThis as unknown as { __opexPreviewClarity?: Map<string, PreviewClarityResult> }
const lastClarity = (globalClarity.__opexPreviewClarity ??= new Map())

function slimPreview(draft: OrcamentoDraftDto) {
    return {
        id: draft.id,
        status: draft.status,
        projectId: draft.projectId,
        projectName: draft.projectName,
        description: draft.description,
        correction: draft.correction,
        preview: draft.preview ? { ...draft.preview, clarity: undefined } : null,
        tags: draft.tags,
        estimate: draft.estimate,
        estimateClientName: draft.estimateClientName,
        taskId: draft.taskId,
    }
}

function clarityReport(result: PreviewClarityResult) {
    return {
        level: result.level,
        canApprove: result.canApprove,
        issues: result.issues.map((issue) => ({ dimension: PREVIEW_CLARITY_DIMENSION_LABELS[issue.dimension], status: issue.status === "missing" ? "ausente" : "vago", detail: issue.detail })),
        guidance:
            result.level === "clear"
                ? "A descrição está clara: mostre a prévia ao usuário e peça o ok para aprovar."
                : result.canApprove
                  ? "Há pontos vagos: mostre a prévia, cite os pontos e pergunte se o usuário quer detalhar (set_preview_correction + generate_preview) ou aprovar assim."
                  : "Falta informação essencial: NÃO aprove. Pergunte ao usuário os pontos ausentes, registre a resposta com set_preview_correction e gere de novo.",
    }
}

async function estimatePreview(previewId: string, signal?: AbortSignal) {
    const draft = await getOwnerDraftDoc(previewId)
    if (typeof draft.estimatedHours === "number") return (await recomputeOwnerEstimate(draft)).estimate
    const { done } = await collectFeatureStream(runBudgetEstimate(await prepareBudgetEstimate(OWNER_SCOPE, previewId), signal))
    return done?.estimate ?? null
}

export const previewTools = [
    defineTool({
        name: "create_preview",
        group: "previews",
        label: "Criar prévia",
        risk: "write",
        description:
            "Cria uma prévia de tarefa (Nova prévia com IA) a partir do pedido do usuário em linguagem natural. Arquivos do chat em chatFileIds viram anexos (inseridos no fim da descrição) e passam para a tarefa na aprovação. Depois chame generate_preview para a IA preencher título, tipo, prioridade e especificação.",
        input: z.object({
            projectId: z.string().describe("Id do projeto/repositório (de get_task_options)"),
            description: z.string().describe("Pedido do usuário, com todo o contexto que ele deu (Markdown)"),
            chatFileIds: z.array(z.string()).max(50).optional().describe("fileIds de arquivos do chat a anexar (ex.: prints do problema)"),
        }),
        summarize: (input) => (input.chatFileIds?.length ? `Criar uma prévia de tarefa com ${input.chatFileIds.length} anexo(s)` : "Criar uma prévia de tarefa"),
        execute: async ({ chatFileIds, ...input }, context) => {
            const { attached, failed } = chatFileIds?.length ? await chatFilesToAttachments(contextSessionId(context), chatFileIds, {}) : { attached: [], failed: [] }
            const description = [input.description.trim(), ...attached.map((item) => item.markdown)].filter(Boolean).join("\n\n")
            const draft = await createOwnerDraft(clienteDraftSchema.parse({ projectId: input.projectId, description }))
            await linkAttachmentsToDraft(ownerAttachmentActor(), attached.map((item) => item.id), draft.id)
            return { ...slimPreview(draft), attachmentsFailed: failed }
        },
    }),
    defineTool({
        name: "get_preview",
        group: "previews",
        label: "Ler prévia",
        risk: "read",
        description: "Estado atual de uma prévia (conteúdo gerado, correção, estimativa e, se aprovada, a tarefa criada).",
        input: z.object({ previewId: z.string() }),
        execute: async ({ previewId }) => {
            const clarity = lastClarity.get(previewId)
            return { ...slimPreview(await getOwnerDraft(previewId)), clarity: clarity ? clarityReport(clarity) : null }
        },
    }),
    defineTool({
        name: "generate_preview",
        group: "previews",
        label: "Gerar prévia",
        risk: "write",
        description:
            'Gera com IA o conteúdo da prévia (título, tipo, prioridade, especificação técnica, resumo e tags) e avalia a clareza (critérios de aceite e localização). Considera a correção registrada. Em seguida estima as horas (quando a feature "Estimar prazos" estiver ativa).',
        input: z.object({ previewId: z.string(), estimate: z.boolean().optional().describe("Estimar as horas depois de gerar (padrão true)") }),
        summarize: () => "Gerar o conteúdo da prévia com IA",
        execute: async ({ previewId, estimate }, context) => {
            await requireOwnerDraftEditable(previewId)
            const { done } = await collectFeatureStream(runBudgetPreview(await prepareBudgetPreview(OWNER_SCOPE, previewId), context.signal))
            if (!done) throw new OpexToolError("A geração da prévia não terminou")
            const clarity = selectPreviewClarity(done.preview.clarity)
            lastClarity.set(previewId, clarity)
            let estimation: { hours: number | null; error: string | null } | null = null
            if (estimate !== false) {
                try {
                    estimation = { hours: (await estimatePreview(previewId, context.signal))?.hours ?? null, error: null }
                } catch (error) {
                    estimation = { hours: null, error: error instanceof Error ? error.message : String(error) }
                }
            }
            return { preview: { ...done.preview, clarity: undefined }, clarity: clarityReport(clarity), estimate: estimation }
        },
    }),
    defineTool({
        name: "set_preview_correction",
        group: "previews",
        label: "Corrigir prévia",
        risk: "write",
        description: "Registra o ajuste pedido pelo usuário (ou as respostas dele sobre critérios de aceite e localização). Depois chame generate_preview para regenerar.",
        input: z.object({ previewId: z.string(), correction: z.string() }),
        summarize: () => "Registrar a correção da prévia",
        execute: async ({ previewId, correction }) => {
            lastClarity.delete(previewId)
            return slimPreview(await setOwnerCorrection(previewId, clienteCorrectionSchema.parse({ correction }).correction))
        },
    }),
    defineTool({
        name: "estimate_preview",
        group: "previews",
        label: "Estimar prévia",
        risk: "write",
        description: "Estima as horas da prévia já gerada. `clientId` (opcional, de list_clients) só define o cliente usado no custo; null remove.",
        input: z.object({ previewId: z.string(), clientId: z.string().nullable().optional() }),
        summarize: () => "Estimar as horas da prévia",
        execute: async ({ previewId, clientId }, context) => {
            const draft = await requireOwnerDraftEditable(previewId)
            if (!draft.preview) throw new OpexToolError("Gere a prévia (generate_preview) antes de estimar")
            if (clientId !== undefined) await setOwnerEstimateClient(previewId, clientId)
            return { estimate: await estimatePreview(previewId, context.signal) }
        },
    }),
    defineTool({
        name: "approve_preview",
        group: "previews",
        label: "Aprovar prévia",
        risk: "write",
        description: "Aprova a prévia e cria a tarefa no Opex (coluna de entrada do projeto, com issue no GitHub e os anexos da prévia). Só com o ok explícito do usuário.",
        input: z.object({ previewId: z.string(), priority: z.enum(TASK_PRIORITIES).optional().describe("Padrão: a prioridade da prévia") }),
        summarize: () => "Aprovar a prévia e criar a tarefa (com issue no GitHub)",
        execute: async ({ previewId, priority }, context) => {
            const clarity = lastClarity.get(previewId)
            if (clarity && !clarity.canApprove) {
                throw new OpexToolError("A prévia tem critérios de aceite ou localização ausentes. Pergunte ao usuário, registre com set_preview_correction e gere de novo antes de aprovar.")
            }
            const task = await approveOwnerDraft(previewId, context.actorId, priority)
            lastClarity.delete(previewId)
            return slimTask(task)
        },
    }),
]
