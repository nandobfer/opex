import { z } from "zod"
import { assertDraftEditable, getDraftDoc, listDrafts } from "@/features/orcamentos/server/drafts"
import { prepareBudgetEstimate, prepareBudgetPreview, runBudgetEstimate, runBudgetPreview } from "@/features/orcamentos/server/preview"
import { approveDraft, createDraft, getDraft, setDraftCorrection } from "@/features/orcamentos/server/portal"
import { linkAttachmentsToDraft } from "@/features/tasks/attachments/server/service"
import { TASK_PRIORITIES } from "@/features/tasks/constants"
import { formatAttachmentSize } from "@/lib/attachments"
import { OPEX_FILE_TEXT_INLINE_MAX, OPEX_FILE_TEXT_MAX_BYTES } from "../../constants"
import { opexFileKind } from "../../files"
import { decodeText, listSessionFiles, loadSessionFile, readOpexFileBytes } from "../files"
import { defineTool, OpexToolError, type OpexToolContext } from "../tools/define"
import { collectFeatureStream } from "../tools/helpers"
import { attachmentsActorOf, clientOf, draftScopeOf, findClientTask, requireClientActor, slimClientPreview } from "./helpers"
import { chatFilesToAttachments } from "../tools/files"

const previewId = z.string().trim().min(1).max(40).describe("Id da prévia/pedido (de list_previews ou create_preview)")
const fileIds = z.array(z.string()).min(1).max(50).describe("fileIds dos arquivos do chat (de list_chat_files)")

/**
 * Roda a fase 2 (estimativa) e devolve só a estimativa **segura** do cliente: horas infladas e
 * faturamento. As horas reais e o modelo são internos do dono e nunca vão ao modelo nem ao chat.
 */
async function estimatePreview(context: OpexToolContext, id: string) {
    const scope = draftScopeOf(context)
    const { done } = await collectFeatureStream(runBudgetEstimate(await prepareBudgetEstimate(scope, id), context.signal))
    if (!done) throw new OpexToolError("A estimativa não terminou")
    return { estimate: { clientHours: done.estimate.clientHours, billingBRL: done.estimate.billingBrl }, tags: done.tags }
}

export const clientPreviewTools = [
    defineTool({
        name: "list_previews",
        group: "previews",
        label: "Listar orçamentos",
        risk: "read",
        description: "Lista os pedidos de nova tarefa (prévias) do cliente, do mais recente para o mais antigo, com filtro por situação (aberto/aprovado).",
        input: z.object({ status: z.enum(["draft", "approved"]).optional(), limit: z.number().int().min(1).max(50).optional() }),
        execute: async (input, context) => {
            const drafts = await listDrafts(draftScopeOf(context), { status: input.status, limit: input.limit ?? 20 })
            return drafts.map(slimClientPreview)
        },
    }),
    defineTool({
        name: "get_preview",
        group: "previews",
        label: "Ler orçamento",
        risk: "read",
        description: "Estado atual de um pedido: descrição, conteúdo gerado, correção, tags e estimativa segura (horas infladas e faturamento).",
        input: z.object({ previewId }),
        execute: async ({ previewId: id }, context) => slimClientPreview(await getDraft(clientOf(context), id)),
    }),
    defineTool({
        name: "create_preview",
        group: "previews",
        label: "Criar orçamento",
        risk: "write",
        description:
            "Abre um pedido de nova tarefa (prévia de orçamento) num repositório permitido ao cliente. Arquivos do chat em chatFileIds viram anexos. Depois chame generate_preview.",
        input: z.object({
            projectId: z.string().describe("Id do repositório/projeto (de get_portal_overview)"),
            description: z.string().trim().min(10).max(20_000).describe("Pedido do usuário, com todo o contexto que ele deu (Markdown)"),
            chatFileIds: z.array(z.string()).max(50).optional().describe("fileIds de arquivos do chat a anexar"),
        }),
        summarize: (input) => (input.chatFileIds?.length ? `Abrir um pedido de orçamento com ${input.chatFileIds.length} anexo(s)` : "Abrir um pedido de orçamento"),
        execute: async ({ chatFileIds, ...input }, context) => {
            const actor = requireClientActor(context)
            const { attached, failed } = chatFileIds?.length ? await chatFilesToAttachments(context.sessionId, chatFileIds, {}, attachmentsActorOf(context)) : { attached: [], failed: [] }
            const draft = await createDraft(actor.client, { projectId: input.projectId, description: input.description })
            await linkAttachmentsToDraft(attachmentsActorOf(context), attached.map((item) => item.id), draft.id)
            return { ...slimClientPreview(draft), attachmentsFailed: failed }
        },
    }),
    defineTool({
        name: "generate_preview",
        group: "previews",
        label: "Gerar orçamento",
        risk: "write",
        description:
            "Gera com IA o conteúdo do pedido (título, tipo, prioridade, especificação técnica, resumo e tags) e avalia a clareza (critérios de aceite e localização). Em seguida estima as horas quando a feature estiver ativa.",
        input: z.object({ previewId, estimate: z.boolean().optional().describe("Estimar as horas depois de gerar (padrão true)") }),
        summarize: () => "Gerar o conteúdo do pedido com IA",
        execute: async ({ previewId: id, estimate }, context) => {
            assertDraftEditable(await getDraftDoc(draftScopeOf(context), id))
            const { done } = await collectFeatureStream(runBudgetPreview(await prepareBudgetPreview(draftScopeOf(context), id), context.signal))
            if (!done) throw new OpexToolError("A geração do pedido não terminou")
            const clarity = done.preview.clarity ?? null
            let estimation: { estimate: unknown; error: string | null } | null = null
            if (estimate !== false) {
                try {
                    estimation = { estimate: (await estimatePreview(context, id)).estimate, error: null }
                } catch (error) {
                    estimation = { estimate: null, error: error instanceof Error ? error.message : String(error) }
                }
            }
            return { preview: { ...done.preview, clarity: undefined }, clarity, estimation }
        },
    }),
    defineTool({
        name: "set_preview_correction",
        group: "previews",
        label: "Corrigir orçamento",
        risk: "write",
        description: "Registra o ajuste pedido pelo usuário (ou as respostas sobre critérios de aceite e localização). Depois chame generate_preview para regenerar.",
        input: z.object({ previewId, correction: z.string().trim().min(1).max(10_000) }),
        summarize: () => "Registrar a correção do pedido",
        execute: async ({ previewId: id, correction }, context) => slimClientPreview(await setDraftCorrection(clientOf(context), id, correction)),
    }),
    defineTool({
        name: "estimate_preview",
        group: "previews",
        label: "Estimar orçamento",
        risk: "write",
        description: "Estima as horas do pedido já gerado e devolve a estimativa segura do cliente (horas infladas e faturamento).",
        input: z.object({ previewId }),
        summarize: () => "Estimar as horas do pedido",
        execute: async ({ previewId: id }, context) => {
            const draft = await getDraftDoc(draftScopeOf(context), id)
            if (!draft.preview) throw new OpexToolError("Gere o pedido (generate_preview) antes de estimar")
            return { estimate: (await estimatePreview(context, id)).estimate }
        },
    }),
    defineTool({
        name: "approve_preview",
        group: "previews",
        label: "Aprovar orçamento",
        risk: "write",
        description: "Aprova o pedido e cria a tarefa no Opex (com a issue no GitHub e os anexos). Só aprove com o ok explícito do usuário.",
        input: z.object({ previewId, priority: z.enum(TASK_PRIORITIES).optional() }),
        summarize: (input) => `Aprovar o orçamento e criar a tarefa${input.priority ? ` (prioridade ${input.priority})` : ""}`,
        execute: async ({ previewId: id, priority }, context) => {
            const actor = requireClientActor(context)
            const task = await approveDraft(actor.client, id, actor.userId, priority)
            return { task: { id: task.id, code: task.code, title: task.title, priority: task.priority, column: task.columnId } }
        },
    }),
]

/** Ferramentas de arquivos do chat no portal (as mesmas regras de leitura do dono). */
export const clientFileTools = [
    defineTool({
        name: "list_chat_files",
        group: "files",
        label: "Arquivos do chat",
        risk: "read",
        description: "Arquivos enviados nesta sessão do chat (fileId, nome, tipo, tamanho e se já foram enviados numa mensagem).",
        input: z.object({}),
        execute: async (_input, context) => listSessionFiles(context.sessionId),
    }),
    defineTool({
        name: "read_chat_file",
        group: "files",
        label: "Ler arquivo",
        risk: "read",
        description: `Lê o conteúdo de texto de um arquivo do chat, em janelas de até ${OPEX_FILE_TEXT_INLINE_MAX.toLocaleString("pt-BR")} caracteres.`,
        input: z.object({
            fileId: z.string(),
            offset: z.number().int().min(0).optional().describe("Caractere inicial (padrão 0)"),
            limit: z.number().int().min(1).max(OPEX_FILE_TEXT_INLINE_MAX).optional(),
        }),
        execute: async ({ fileId, offset, limit }, context) => {
            const doc = await loadSessionFile(context.sessionId, fileId)
            if (opexFileKind(doc.mediaType, doc.name) !== "text") throw new OpexToolError(`"${doc.name}" não é um arquivo de texto (${doc.mediaType}): não dá para ler o conteúdo, só anexá-lo.`)
            if (doc.size > OPEX_FILE_TEXT_MAX_BYTES) throw new OpexToolError(`"${doc.name}" tem ${formatAttachmentSize(doc.size)}: o limite de leitura é ${formatAttachmentSize(OPEX_FILE_TEXT_MAX_BYTES)}. Anexe-o a uma tarefa em vez de ler.`)
            const window = decodeText(await readOpexFileBytes(doc), offset ?? 0, limit ?? OPEX_FILE_TEXT_INLINE_MAX)
            return { name: doc.name, offset: offset ?? 0, total: window.total, truncated: window.truncated, text: window.text }
        },
    }),
    defineTool({
        name: "attach_files_to_task",
        group: "files",
        label: "Anexar à tarefa",
        risk: "write",
        description: "Copia arquivos do chat para os anexos de uma tarefa **do cliente** (até 100 MB cada).",
        input: z.object({ task: z.string().trim().min(1).max(60), fileIds }),
        summarize: (input) => `Anexar ${input.fileIds.length} arquivo(s) à tarefa ${input.task}`,
        execute: async ({ task, fileIds: ids }, context) => {
            const actor = requireClientActor(context)
            const found = await findClientTask(actor, task)
            const { attached, failed } = await chatFilesToAttachments(context.sessionId, ids, { taskId: found.id }, attachmentsActorOf(context))
            if (!attached.length) throw new OpexToolError(`Nenhum arquivo foi anexado: ${failed.map((item) => item.error).join("; ")}`)
            return { attached: attached.map((item) => ({ id: item.id, name: item.name })), failed }
        },
    }),
    defineTool({
        name: "attach_files_to_preview",
        group: "files",
        label: "Anexar ao orçamento",
        risk: "write",
        description: "Copia arquivos do chat para os anexos de um pedido ainda não aprovado: eles passam para a tarefa na aprovação.",
        input: z.object({ previewId, fileIds }),
        summarize: (input) => `Anexar ${input.fileIds.length} arquivo(s) ao pedido de orçamento`,
        execute: async ({ previewId: id, fileIds: ids }, context) => {
            const draft = await getDraftDoc(draftScopeOf(context), id)
            if (draft.status !== "draft") throw new OpexToolError("O pedido já foi aprovado: anexe à tarefa criada com attach_files_to_task.")
            const { attached, failed } = await chatFilesToAttachments(context.sessionId, ids, { draftId: id }, attachmentsActorOf(context))
            if (!attached.length) throw new OpexToolError(`Nenhum arquivo foi anexado: ${failed.map((item) => item.error).join("; ")}`)
            return { attached: attached.map((item) => ({ id: item.id, name: item.name })), failed }
        },
    }),
]
