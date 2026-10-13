import { z } from "zod"
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_LINK, ATTACHMENT_MAX_NAME_LENGTH } from "./constants"

/** Schemas dos anexos (os MESMOS usados nas rotas e nos formulários). */

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Identificador inválido")

/**
 * Reserva de upload: o navegador declara nome, tamanho e tipo; o servidor cria o registro
 * temporário e devolve a URL assinada de PUT. O tamanho é conferido de novo no storage, na
 * confirmação (a URL assinada de PUT não impõe limite durante a transferência).
 */
export const attachmentReserveSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome do arquivo").max(ATTACHMENT_MAX_NAME_LENGTH, "Nome muito longo"),
    size: z.number({ error: "Informe o tamanho do arquivo" }).int().min(0, "Tamanho inválido").max(ATTACHMENT_MAX_BYTES, "Arquivo maior que 100 MB"),
    mimeType: z.string().trim().max(200).optional(),
    /** Tarefa de destino (upload já vinculado, feito na página da tarefa). */
    taskId: objectId.optional(),
    /** Rascunho de destino (upload feito no formulário de prévia). */
    draftId: objectId.optional(),
})
export type AttachmentReserveInput = z.infer<typeof attachmentReserveSchema>

/** Lista de anexos de uma tarefa **ou** de um rascunho (exatamente um dos dois). */
export const attachmentListQuerySchema = z
    .object({ taskId: objectId.optional(), draftId: objectId.optional() })
    .refine((value) => Boolean(value.taskId) !== Boolean(value.draftId), "Informe a tarefa ou o rascunho")
export type AttachmentListQuery = z.infer<typeof attachmentListQuerySchema>

/** Anexos vinculados na criação da tarefa (upload antes de a tarefa existir). */
export const attachmentIdsSchema = z.array(objectId).max(ATTACHMENT_MAX_LINK, "Anexos demais").optional()
