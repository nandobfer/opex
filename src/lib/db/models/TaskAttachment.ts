import { Schema, model, models, type Model } from "mongoose"

/**
 * Anexos das tarefas (`task_attachments`). O binário vive no **Storage S3** (Integrações) e aqui
 * ficam só os metadados. Cada registro é criado **antes** do envio (status `pending`, com a chave
 * temporária) e confirmado depois (`ready`, com a chave definitiva) — ver
 * `src/features/tasks/attachments/server/service.ts`.
 *
 * O vínculo é `taskId` (tarefa) **ou** `draftId` (rascunho de prévia, do portal ou do dono); ao
 * aprovar o rascunho, os anexos passam para a tarefa. `clientId` é o cliente que pode ver o anexo
 * (o do upload ou o da tarefa em que ele foi vinculado) — `null` = só o dono.
 */

export type AttachmentStatus = "pending" | "ready" | "removing"
export type AttachmentUploaderKind = "owner" | "client"

export interface ITaskAttachment {
    /** Tarefa vinculada (após a criação/aprovação). */
    taskId: string | null
    /** Rascunho de prévia vinculado (antes de existir a tarefa). */
    draftId: string | null
    /** Quem enviou: o dono ou um usuário do portal. */
    uploaderKind: AttachmentUploaderKind
    /** Id do autor (dono local ou usuário do portal) — usado na autorização e na auditoria. */
    uploaderId: string
    /** Nome exibido do autor. */
    uploaderName: string
    /** Cliente que pode ver o anexo (`null` = só o dono). */
    clientId: string | null
    /** Nome original do arquivo. */
    name: string
    /** Tamanho em bytes confirmado no storage. */
    size: number
    mimeType: string
    /** Chave definitiva do objeto no bucket. */
    key: string
    /** Chave onde o navegador enviou (temporária; removida na confirmação). */
    uploadKey: string
    status: AttachmentStatus
    createdAt: Date
    updatedAt: Date
}

const TaskAttachmentSchema = new Schema<ITaskAttachment>(
    {
        taskId: { type: String, default: null, index: true },
        draftId: { type: String, default: null, index: true },
        uploaderKind: { type: String, default: "owner" },
        uploaderId: { type: String, required: true },
        uploaderName: { type: String, default: null },
        clientId: { type: String, default: null, index: true },
        name: { type: String, required: true },
        size: { type: Number, default: 0 },
        mimeType: { type: String, default: "application/octet-stream" },
        key: { type: String, required: true },
        uploadKey: { type: String, required: true },
        status: { type: String, default: "pending", index: true },
    },
    { collection: "task_attachments", versionKey: false, timestamps: true },
)

if (process.env.NODE_ENV === "development") {
    delete models.TaskAttachment
}

export const TaskAttachment: Model<ITaskAttachment> =
    (models.TaskAttachment as Model<ITaskAttachment>) || model<ITaskAttachment>("TaskAttachment", TaskAttachmentSchema)
