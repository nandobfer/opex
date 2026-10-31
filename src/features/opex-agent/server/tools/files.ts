import { z } from "zod"
import { getOwnerDraftDoc } from "@/features/orcamentos/server/owner"
import { getTask, updateTask } from "@/features/tasks/server/service"
import type { AttachmentActor } from "@/features/tasks/attachments/server/actor"
import { formatAttachmentSize } from "@/lib/attachments"
import { OPEX_FILE_TEXT_INLINE_MAX, OPEX_FILE_TEXT_MAX_BYTES } from "../../constants"
import { opexFileKind } from "../../files"
import { copyChatFileToAttachments, decodeText, listSessionFiles, loadSessionFile, readOpexFileBytes } from "../files"
import { defineTool, OpexToolError, toolErrorMessage } from "./define"
import { resolveTask, taskRefSchema } from "./helpers"

/** Chamada sem conversa (token de sistema): não existem arquivos do chat. */
export const NO_CHAT_SESSION = "Arquivos do chat só existem nas conversas do agente (chamada por token de sistema)"

const fileIds = z.array(z.string()).min(1).max(50).describe("fileIds dos arquivos do chat (de list_chat_files ou das referências nas mensagens)")

/** Copia os arquivos do chat para os anexos (tarefa ou rascunho de prévia), sem novo envio pelo navegador. */
export async function chatFilesToAttachments(sessionId: string | null, ids: readonly string[], target: { taskId?: string; draftId?: string }, actor?: AttachmentActor) {
    const attached: Awaited<ReturnType<typeof copyChatFileToAttachments>>[] = []
    const failed: { fileId: string; error: string }[] = []
    if (!sessionId) return { attached, failed: ids.map((fileId) => ({ fileId, error: NO_CHAT_SESSION })) }
    for (const id of ids) {
        try {
            attached.push(await copyChatFileToAttachments(sessionId, id, target, actor))
        } catch (error) {
            failed.push({ fileId: id, error: toolErrorMessage(error) })
        }
    }
    return { attached, failed }
}

export const fileTools = [
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
        description: `Lê o conteúdo de texto de um arquivo do chat (txt, md, csv, json, código...), em janelas de até ${OPEX_FILE_TEXT_INLINE_MAX.toLocaleString("pt-BR")} caracteres. Use para arquivos grandes ou de mensagens antigas.`,
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
        description: "Copia arquivos do chat para os anexos de uma tarefa existente (até 100 MB cada). Com appendToDescription, também insere as imagens/links no fim da descrição.",
        input: z.object({ task: taskRefSchema, fileIds, appendToDescription: z.boolean().optional() }),
        summarize: (input) => `Anexar ${input.fileIds.length} arquivo(s) à tarefa ${input.task}`,
        execute: async ({ task, fileIds: ids, appendToDescription }, context) => {
            const { id } = await resolveTask(task)
            const { attached, failed } = await chatFilesToAttachments(context.sessionId, ids, { taskId: id })
            if (!attached.length) throw new OpexToolError(`Nenhum arquivo foi anexado: ${failed.map((item) => item.error).join("; ")}`)
            if (appendToDescription) {
                const detail = await getTask(id)
                const description = [detail.description?.trim() ?? "", ...attached.map((item) => item.markdown)].filter(Boolean).join("\n\n")
                await updateTask(id, { description }, context.actorId)
            }
            return { attached: attached.map((item) => ({ id: item.id, name: item.name, markdown: item.markdown })), failed }
        },
    }),
    defineTool({
        name: "attach_files_to_preview",
        group: "files",
        label: "Anexar à prévia",
        risk: "write",
        description: "Copia arquivos do chat para os anexos de uma prévia ainda não aprovada: eles passam para a tarefa quando a prévia for aprovada.",
        input: z.object({ previewId: z.string(), fileIds }),
        summarize: (input) => `Anexar ${input.fileIds.length} arquivo(s) à prévia`,
        execute: async ({ previewId, fileIds: ids }, context) => {
            const draft = await getOwnerDraftDoc(previewId)
            if (draft.status !== "draft") throw new OpexToolError("A prévia já foi aprovada: anexe à tarefa criada com attach_files_to_task.")
            const { attached, failed } = await chatFilesToAttachments(context.sessionId, ids, { draftId: previewId })
            if (!attached.length) throw new OpexToolError(`Nenhum arquivo foi anexado: ${failed.map((item) => item.error).join("; ")}`)
            return { attached: attached.map((item) => ({ id: item.id, name: item.name })), failed }
        },
    }),
]
