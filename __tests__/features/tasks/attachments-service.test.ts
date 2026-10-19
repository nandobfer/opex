import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    recordAudit: vi.fn(),
    publish: vi.fn(),
    copyFile: vi.fn(),
    deleteFile: vi.fn(),
    headFile: vi.fn(),
    getUploadUrl: vi.fn(),
    getFileObject: vi.fn(),
    attachments: null as unknown,
    devTasks: null as unknown,
    drafts: null as unknown,
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: "ATUALIZAR" } }))
vi.mock("@/lib/logger", () => {
    const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    return { logger: noop, loggerFor: () => noop, logApiError: vi.fn() }
})
vi.mock("@/lib/storage/s3", () => ({
    copyFile: mocks.copyFile,
    deleteFile: mocks.deleteFile,
    headFile: mocks.headFile,
    getUploadUrl: mocks.getUploadUrl,
    getFileObject: mocks.getFileObject,
    // Mesma regra do serviço real: 403 é recusa de acesso (não "objeto ausente") e configuração
    // errada (NoSuchBucket) não descarta o envio.
    storageErrorInfo: (error: unknown) => {
        const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null
        const code = candidate?.name ?? null
        const httpStatus = candidate?.$metadata?.httpStatusCode ?? null
        const misconfigured = code === "NoSuchBucket"
        const notFound = !misconfigured && (httpStatus === 404 || code === "NotFound" || code === "NoSuchKey")
        const forbidden = !notFound && !misconfigured && (httpStatus === 401 || httpStatus === 403 || code === "AccessDenied")
        return { kind: notFound ? "not_found" : forbidden ? "forbidden" : "unavailable", httpStatus, code }
    },
}))
vi.mock("@/features/tasks/server/service", () => ({ publishTasksUpdated: mocks.publish, TASK_AUDIT_ENTITY: "Tarefa" }))
vi.mock("@/lib/db/models/TaskAttachment", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.attachments = memoryModel()
    return { TaskAttachment: mocks.attachments }
})
vi.mock("@/lib/db/models/DevTask", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.devTasks = memoryModel()
    return { DevTask: mocks.devTasks, TaskComment: memoryModel() }
})
vi.mock("@/lib/db/models/Orcamento", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.drafts = memoryModel()
    return { OrcamentoDraft: mocks.drafts }
})

import { ATTACHMENT_MAX_BYTES, ATTACHMENT_PENDING_TTL_MS } from "@/features/tasks/attachments/constants"
import type { AttachmentActor } from "@/features/tasks/attachments/server/actor"
import {
    assertAttachmentsLinkable,
    cancelAttachmentUpload,
    cleanupAbandonedAttachments,
    completeAttachmentUpload,
    importAttachmentFromStorage,
    deleteAttachment,
    listAttachments,
    linkAttachmentsToTask,
    readAttachmentContent,
    reserveAttachmentUpload,
} from "@/features/tasks/attachments/server/service"
import type { MemoryModel } from "../../helpers/memory-model"

const attachments = () => mocks.attachments as MemoryModel
const devTasks = () => mocks.devTasks as MemoryModel
const drafts = () => mocks.drafts as MemoryModel

const owner: AttachmentActor = { kind: "owner", userId: "local", name: "Dono", clientId: null }
const clientActor = (clientId: string, userId = "u1"): AttachmentActor => ({ kind: "client", userId, name: "Ana", clientId })

const seedTask = async (clientId: string | null) => String((await devTasks().create({ code: "APP-1", clientId, projectId: "p1", columnId: "todo", title: "Tarefa" }))._id)

const seedAttachment = async (overrides: Record<string, unknown> = {}) =>
    String(
        (
            await attachments().create({
                taskId: null,
                draftId: null,
                uploaderKind: "owner",
                uploaderId: "local",
                uploaderName: "Dono",
                clientId: null,
                name: "foto.png",
                size: 1024,
                mimeType: "image/png",
                key: "attachments/definitiva/foto.png",
                uploadKey: "attachments/tmp/definitiva/foto.png",
                status: "ready",
                ...overrides,
            })
        )._id,
    )

const reserve = (actor: AttachmentActor = owner, input: Record<string, unknown> = {}) =>
    reserveAttachmentUpload(actor, { name: "foto.png", size: 1024, mimeType: "image/png", ...input })

beforeEach(() => {
    vi.clearAllMocks()
    attachments().docs.length = 0
    devTasks().docs.length = 0
    drafts().docs.length = 0
    mocks.getUploadUrl.mockResolvedValue("https://minio.local/opex/attachments/tmp/x/foto.png?X-Amz-Signature=abc")
    mocks.copyFile.mockResolvedValue(undefined)
    mocks.deleteFile.mockResolvedValue(undefined)
})

describe("anexos — reserva e confirmação", () => {
    it("reserva o envio numa chave temporária e assina o PUT com o tipo informado", async () => {
        const reservation = await reserve()

        expect(reservation.method).toBe("PUT")
        expect(reservation.headers["Content-Type"]).toBe("image/png")
        expect(reservation.url).toContain("X-Amz-Signature")
        expect(mocks.getUploadUrl).toHaveBeenCalledWith(`attachments/tmp/${reservation.id}/foto.png`, "image/png", expect.any(Number), "browser")
        expect(attachments().docs).toHaveLength(1)
        expect(attachments().docs[0].status).toBe("pending")
    })

    it("confirma o envio: confere o objeto, promove para a chave definitiva e devolve o anexo", async () => {
        mocks.headFile.mockResolvedValue({ contentLength: 2048, contentType: "image/png" })
        const { id } = await reserve()

        const attachment = await completeAttachmentUpload(owner, id)

        expect(attachment.size).toBe(2048)
        expect(attachment.kind).toBe("image")
        expect(attachment.markdown).toBe(`![foto.png](/api/attachments/${id}/content)`)
        expect(mocks.copyFile).toHaveBeenCalledWith(`attachments/tmp/${id}/foto.png`, `attachments/${id}/foto.png`)
        expect(mocks.deleteFile).toHaveBeenCalledWith(`attachments/tmp/${id}/foto.png`)
        expect(attachments().docs[0].status).toBe("ready")
    })

    it("confirmação repetida é idempotente (não copia de novo)", async () => {
        mocks.headFile.mockResolvedValue({ contentLength: 2048, contentType: "image/png" })
        const { id } = await reserve()
        await completeAttachmentUpload(owner, id)
        const again = await completeAttachmentUpload(owner, id)

        expect(again.id).toBe(id)
        expect(mocks.copyFile).toHaveBeenCalledTimes(1)
        expect(mocks.headFile).toHaveBeenCalledTimes(1)
    })

    it("recusa arquivo acima do limite e descarta a reserva e o objeto", async () => {
        mocks.headFile.mockResolvedValue({ contentLength: ATTACHMENT_MAX_BYTES + 1, contentType: "video/mp4" })
        const { id } = await reserve()

        await expect(completeAttachmentUpload(owner, id)).rejects.toMatchObject({ code: "ATTACHMENT_TOO_LARGE", status: 413 })

        expect(mocks.copyFile).not.toHaveBeenCalled()
        expect(mocks.deleteFile).toHaveBeenCalledWith(`attachments/tmp/${id}/foto.png`)
        expect(attachments().docs).toHaveLength(0)
    })

    it("erro de rede na conferência preserva o envio (502, sem descartar a reserva)", async () => {
        mocks.headFile.mockRejectedValue(new Error("ECONNRESET"))
        const { id } = await reserve()

        await expect(completeAttachmentUpload(owner, id)).rejects.toMatchObject({ code: "ATTACHMENT_STORAGE_UNAVAILABLE", status: 502 })
        expect(attachments().docs).toHaveLength(1)
        expect(attachments().docs[0].status).toBe("pending")
    })

    it("cancela um envio ainda não confirmado (do próprio autor)", async () => {
        const { id } = await reserve()
        await cancelAttachmentUpload(owner, id)

        expect(attachments().docs).toHaveLength(0)
        expect(mocks.deleteFile).toHaveBeenCalledWith(`attachments/tmp/${id}/foto.png`)
    })
})

describe("anexos — vínculo", () => {
    it("exige anexo confirmado e do próprio autor antes de vincular", async () => {
        const pending = await seedAttachment({ status: "pending", uploaderKind: "client", uploaderId: "u9", clientId: "c9" })
        await expect(assertAttachmentsLinkable(owner, [pending])).rejects.toMatchObject({ code: "ATTACHMENT_NOT_READY" })

        const outro = await seedAttachment({ uploaderKind: "client", uploaderId: "u9", clientId: "c9" })
        await expect(assertAttachmentsLinkable(clientActor("c1"), [outro])).rejects.toMatchObject({ code: "FORBIDDEN" })
        await expect(assertAttachmentsLinkable(owner, [outro])).resolves.toBeUndefined()
    })

    it("vincula à tarefa com o cliente da tarefa (visibilidade do portal)", async () => {
        const taskId = await seedTask("c1")
        const id = await seedAttachment()

        await linkAttachmentsToTask(owner, [id], taskId)

        const doc = attachments().docs.find((item) => String(item._id) === id)!
        expect(doc.taskId).toBe(taskId)
        expect(doc.clientId).toBe("c1")
    })
})

describe("anexos — consulta, conteúdo e exclusão", () => {
    it("lista só os confirmados visíveis para o ator", async () => {
        const taskId = await seedTask("c1")
        const meu = await seedAttachment({ taskId, clientId: "c1" })
        await seedAttachment({ taskId, clientId: null })
        await seedAttachment({ taskId, clientId: "c1", status: "pending" })

        const list = await listAttachments(clientActor("c1"), { taskId })

        expect(list.attachments.map((item) => item.id)).toEqual([meu])
    })

    it("serve mídia inline e o restante como download", async () => {
        mocks.getFileObject.mockResolvedValue({ body: "stream", contentType: "image/png", contentLength: 4, contentRange: undefined, acceptRanges: "bytes" })
        const imagem = await seedAttachment()
        expect((await readAttachmentContent(owner, imagem)).inline).toBe(true)

        mocks.getFileObject.mockResolvedValue({ body: "stream", contentType: "application/pdf", contentLength: 4, contentRange: undefined, acceptRanges: "bytes" })
        const pdf = await seedAttachment({ mimeType: "application/pdf" })
        expect((await readAttachmentContent(owner, pdf)).inline).toBe(false)
        expect((await readAttachmentContent(owner, pdf, { download: true })).inline).toBe(false)
    })

    it("não entrega o conteúdo de um anexo de outro cliente", async () => {
        const taskId = await seedTask("c1")
        const id = await seedAttachment({ taskId, clientId: "c1" })
        mocks.getFileObject.mockResolvedValue({ body: "stream", contentType: "image/png", contentLength: 4, contentRange: undefined, acceptRanges: "bytes" })

        await expect(readAttachmentContent(clientActor("c2"), id)).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND", status: 404 })
    })

    it("o dono exclui anexo vinculado; o usuário do portal só o próprio ainda não vinculado", async () => {
        const taskId = await seedTask("c1")
        const vinculado = await seedAttachment({ taskId, clientId: "c1", uploaderKind: "client", uploaderId: "u1" })

        await expect(deleteAttachment(clientActor("c1"), vinculado)).rejects.toMatchObject({ code: "FORBIDDEN" })

        const solto = await seedAttachment({ uploaderKind: "client", uploaderId: "u1", clientId: "c1" })
        await deleteAttachment(clientActor("c1"), solto)
        expect(attachments().docs.some((item) => String(item._id) === solto)).toBe(false)

        await deleteAttachment(owner, vinculado)
        expect(attachments().docs.some((item) => String(item._id) === vinculado)).toBe(false)
        expect(mocks.deleteFile).toHaveBeenCalledWith("attachments/definitiva/foto.png")
    })
})

describe("anexos — falhas do storage na confirmação", () => {
    const failure = (name: string, httpStatus?: number) => Object.assign(new Error(name), { name, ...(httpStatus ? { $metadata: { httpStatusCode: httpStatus } } : {}) })

    it("403 na conferência preserva a reserva e o objeto (não descarta o envio)", async () => {
        mocks.headFile.mockRejectedValue(failure("UnknownError", 403))
        const { id } = await reserve()

        await expect(completeAttachmentUpload(owner, id)).rejects.toMatchObject({ code: "ATTACHMENT_STORAGE_UNAVAILABLE", status: 502 })

        expect(attachments().docs).toHaveLength(1)
        expect(attachments().docs[0].status).toBe("pending")
        expect(mocks.copyFile).not.toHaveBeenCalled()
        expect(mocks.deleteFile).not.toHaveBeenCalled()
    })

    it("repetir a confirmação depois de um 403 conclui o anexo sem novo envio", async () => {
        mocks.headFile.mockRejectedValueOnce(failure("AccessDenied", 403)).mockResolvedValue({ contentLength: 2048, contentType: "image/png" })
        const { id } = await reserve()

        await expect(completeAttachmentUpload(owner, id)).rejects.toMatchObject({ code: "ATTACHMENT_STORAGE_UNAVAILABLE" })
        const attachment = await completeAttachmentUpload(owner, id)

        expect(attachment.id).toBe(id)
        expect(attachment.size).toBe(2048)
        expect(attachments().docs[0].status).toBe("ready")
        expect(mocks.copyFile).toHaveBeenCalledTimes(1)
    })

    it("404 na conferência prova a ausência: descarta a reserva e manda enviar de novo", async () => {
        mocks.headFile.mockRejectedValue(failure("NoSuchKey", 404))
        const { id } = await reserve()

        await expect(completeAttachmentUpload(owner, id)).rejects.toMatchObject({ code: "ATTACHMENT_NOT_UPLOADED", status: 400 })

        expect(attachments().docs).toHaveLength(0)
        expect(mocks.deleteFile).toHaveBeenCalledWith(`attachments/tmp/${id}/foto.png`)
    })

    it("falha ao promover o arquivo mantém o envio recuperável (e a nova tentativa promove)", async () => {
        mocks.headFile.mockResolvedValue({ contentLength: 2048, contentType: "image/png" })
        mocks.copyFile.mockRejectedValueOnce(failure("InternalError", 500))
        const { id } = await reserve()

        await expect(completeAttachmentUpload(owner, id)).rejects.toMatchObject({ code: "ATTACHMENT_STORAGE_UNAVAILABLE", status: 502 })
        expect(attachments().docs[0].status).toBe("pending")

        const attachment = await completeAttachmentUpload(owner, id)

        expect(attachment.id).toBe(id)
        expect(attachments().docs[0].status).toBe("ready")
    })

    it("indisponibilidade ao ler o conteúdo vira 502; ausência comprovada, 404", async () => {
        const id = await seedAttachment()

        mocks.getFileObject.mockRejectedValue(failure("UnknownError", 403))
        await expect(readAttachmentContent(owner, id)).rejects.toMatchObject({ code: "ATTACHMENT_STORAGE_UNAVAILABLE", status: 502 })

        mocks.getFileObject.mockRejectedValue(failure("NoSuchKey", 404))
        await expect(readAttachmentContent(owner, id)).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND", status: 404 })
    })
})

describe("anexos — limpeza", () => {
    it("remove uploads abandonados e conclui remoções pendentes no storage", async () => {
        const antigo = await seedAttachment({ status: "pending", createdAt: new Date(Date.now() - ATTACHMENT_PENDING_TTL_MS - 1000) })
        const recente = await seedAttachment({ status: "pending", createdAt: new Date() })
        const removendo = await seedAttachment({ status: "removing" })

        const summary = await cleanupAbandonedAttachments()

        expect(summary).toContain("abandonado")
        expect(attachments().docs.map((item) => String(item._id))).toEqual([recente])
        expect(attachments().docs.some((item) => String(item._id) === removendo)).toBe(false)
        expect(attachments().docs.some((item) => String(item._id) === antigo)).toBe(false)
    })

    it("mantém o registro quando o storage não confirma a remoção (a rotina tenta de novo)", async () => {
        const removendo = await seedAttachment({ status: "removing" })
        mocks.deleteFile.mockRejectedValue(new Error("S3 fora"))

        await cleanupAbandonedAttachments()

        expect(attachments().docs.some((item) => String(item._id) === removendo)).toBe(true)
    })
})

describe("anexos — rascunho", () => {
    it("reserva com rascunho do cliente e devolve o erro quando o rascunho é de outro", async () => {
        const draftId = String((await drafts().create({ clientId: "c1", projectId: "p1", description: "d", status: "draft" }))._id)

        const reservation = await reserve(clientActor("c1"), { draftId })
        expect(attachments().docs[0].clientId).toBe("c1")
        expect(reservation.id).toBeTruthy()

        await expect(reserve(clientActor("c2"), { draftId })).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND", status: 404 })
    })
})

describe("anexos — cópia de um objeto do storage (arquivos do chat do Agente Opex)", () => {
    const owner: AttachmentActor = { kind: "owner", userId: "local", name: "Dono", clientId: null }

    it("cria o anexo pronto na tarefa copiando o objeto, sem novo envio, e audita no histórico", async () => {
        const task = await (mocks.devTasks as MemoryModel).create({ clientId: null, code: "OPX-1" })
        const dto = await importAttachmentFromStorage(owner, { sourceKey: "opex/s/f/print.png", name: "print.png", size: 3, mimeType: "image/png", taskId: String(task._id) })
        expect(mocks.copyFile).toHaveBeenCalledWith("opex/s/f/print.png", `attachments/${dto.id}/print.png`)
        expect(mocks.getUploadUrl).not.toHaveBeenCalled()
        expect((mocks.attachments as MemoryModel).docs.at(-1)).toMatchObject({ status: "ready", taskId: String(task._id), size: 3 })
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "Tarefa", depois: expect.objectContaining({ anexo: "adicionado" }) }))
        expect(mocks.publish).toHaveBeenCalledWith([String(task._id)])
    })

    it("recusa arquivo acima de 100 MB e objeto de origem ausente", async () => {
        await expect(importAttachmentFromStorage(owner, { sourceKey: "k", name: "a.zip", size: ATTACHMENT_MAX_BYTES + 1, mimeType: "application/zip" })).rejects.toMatchObject({ status: 413 })
        mocks.copyFile.mockRejectedValueOnce({ name: "NoSuchKey", $metadata: { httpStatusCode: 404 } })
        await expect(importAttachmentFromStorage(owner, { sourceKey: "k", name: "a.txt", size: 2, mimeType: "text/plain" })).rejects.toMatchObject({ status: 404 })
    })
})
