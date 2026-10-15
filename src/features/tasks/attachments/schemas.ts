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
    /** Serviço de destino (upload já vinculado, feito na página do serviço). */
    serviceId: objectId.optional(),
})
export type AttachmentReserveInput = z.infer<typeof attachmentReserveSchema>

/** Lista de anexos de uma tarefa, de um rascunho **ou** de um serviço (exatamente um dos três). */
export const attachmentListQuerySchema = z
    .object({ taskId: objectId.optional(), draftId: objectId.optional(), serviceId: objectId.optional() })
    .refine((value) => [value.taskId, value.draftId, value.serviceId].filter(Boolean).length === 1, "Informe a tarefa, o rascunho ou o serviço")
export type AttachmentListQuery = z.infer<typeof attachmentListQuerySchema>

/** Anexos vinculados na criação da tarefa (upload antes de a tarefa existir). */
export const attachmentIdsSchema = z.array(objectId).max(ATTACHMENT_MAX_LINK, "Anexos demais").optional()
