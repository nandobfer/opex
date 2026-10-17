"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AxiosInstance } from "axios"
import { toast } from "sonner"
import api, { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { fallbackAttachmentName, formatAttachmentSize } from "@/lib/attachments"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { randomId } from "@/lib/random-id"
import type { MarkdownUploads } from "@/components/ui/markdown-field"
import { TASKS_UPDATED_EVENT } from "@/features/tasks/constants"
import { createAttachmentClient, startAttachmentUpload, type AttachmentClient, type AttachmentTarget, type AttachmentUploadTask } from "./client"
import { ATTACHMENT_FALLBACK_MIME, ATTACHMENT_MAX_BYTES, ATTACHMENT_UPLOAD_CONCURRENCY } from "./constants"
import type { TaskAttachmentDto } from "./types"

/** Anexos: consultas, fila de upload com progresso e atualização em tempo real. */

export const ATTACHMENTS_QUERY_KEY = "attachments"

/**
 * Códigos que provam que a reserva morreu (objeto ausente, vazio ou acima do limite): a próxima
 * tentativa começa com uma reserva nova. As demais falhas (ex.: storage indisponível) preservam a
 * reserva e o arquivo já enviado, e a nova tentativa refaz **só** a confirmação.
 */
const DEAD_RESERVATION_CODES = new Set(["ATTACHMENT_NOT_UPLOADED", "ATTACHMENT_EMPTY", "ATTACHMENT_TOO_LARGE"])

export const attachmentsKey = (target: AttachmentTarget) => [ATTACHMENTS_QUERY_KEY, target.taskId ?? null, target.draftId ?? null, target.serviceId ?? null] as const

/** Cliente de anexos sobre um axios qualquer (o do app ou o do portal). */
export function useAttachmentClient(axiosInstance: AxiosInstance): AttachmentClient {
    return useMemo(() => createAttachmentClient(axiosInstance), [axiosInstance])
}

/** Cliente de anexos do app do dono. */
export function useOwnerAttachmentClient(): AttachmentClient {
    return useMemo(() => createAttachmentClient(api), [])
}

export function useTaskAttachments(client: AttachmentClient, target: AttachmentTarget, enabled = true) {
    return useQuery({
        queryKey: attachmentsKey(target),
        queryFn: () => client.list(target),
        enabled: enabled && Boolean(target.taskId ?? target.draftId ?? target.serviceId),
    })
}

/** Exclusão de anexo (só no app do dono; o portal não exclui anexo vinculado). */
export function useDeleteAttachment(client: AttachmentClient) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (attachment: Pick<TaskAttachmentDto, "id" | "name">) => client.remove(attachment.id),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir o anexo")),
        onSuccess: (_data, attachment) => {
            toast.success(`Anexo "${attachment.name}" excluído`)
            void queryClient.invalidateQueries({ queryKey: [ATTACHMENTS_QUERY_KEY] })
        },
    })
}

/** Invalida os anexos quando o servidor avisa que as tarefas mudaram (dono). */
export function useAttachmentsRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: [ATTACHMENTS_QUERY_KEY] })
        channel.bind(TASKS_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(TASKS_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}

// ── Fila de upload ─────────────────────────────────────────────────────────

export type AttachmentUploadStatus = "queued" | "uploading" | "confirming" | "done" | "error" | "canceled"

export interface AttachmentUploadItem {
    id: string
    name: string
    size: number
    mimeType: string
    progress: number
    status: AttachmentUploadStatus
    error?: string
    /** Prévia local (só imagem), liberada ao sair da fila. */
    previewUrl: string | null
    /** Mídia vinda do campo Markdown (colada/arrastada): o campo mostra o progresso no cursor. */
    inline: boolean
}

export interface AttachmentUploadQueue {
    items: AttachmentUploadItem[]
    /** Envios em andamento (fila + transferência + confirmação). */
    active: number
    upload: (files: File[] | FileList) => void
    /** Envia a mídia do campo Markdown e resolve com a referência pronta (ou rejeita ao cancelar). */
    enqueueMedia: (file: File) => { id: string; markdown: Promise<string> }
    /** A fila no formato do campo Markdown (progresso, erro, tentar de novo, dispensar). */
    media: MarkdownUploads
    retry: (id: string) => void
    cancel: (id: string) => void
    dismiss: (id: string) => void
}

interface UploadWaiters {
    resolve: (attachment: TaskAttachmentDto) => void
    reject: (error: unknown) => void
}

interface UploadJob {
    file: File
    controller: AbortController
    /** Reserva com o PUT já aceito: a nova tentativa depois disto refaz **só** a confirmação. */
    task: AttachmentUploadTask | null
    /** Quem espera a referência do Markdown (mídia colada): sobrevive à nova tentativa. */
    waiters: UploadWaiters[]
}

/**
 * Fila de upload dos anexos: reserva a URL assinada, envia direto ao storage com **progresso real**,
 * confirma no servidor e só então entrega o anexo (`onUploaded`). A quantidade de arquivos não tem
 * limite; os envios simultâneos são poucos para não saturar a rede.
 *
 * **Tentar de novo não reenvia o arquivo** quando o PUT já foi aceito: a reserva é reaproveitada e
 * apenas a confirmação se repete. Falha de storage (recusa de acesso/indisponibilidade) mantém o
 * envio recuperável; só as falhas definitivas (objeto ausente, vazio ou acima do limite) descartam a
 * reserva.
 */
export function useAttachmentUploads(options: {
    client: AttachmentClient
    target?: AttachmentTarget
    onUploaded?: (attachment: TaskAttachmentDto) => void
    maxBytes?: number
}): AttachmentUploadQueue {
    const { client, target, onUploaded, maxBytes = ATTACHMENT_MAX_BYTES } = options
    const [items, setItems] = useState<AttachmentUploadItem[]>([])
    const jobs = useRef(new Map<string, UploadJob>())
    const queue = useRef<string[]>([])
    const previews = useRef(new Map<string, string>())
    const running = useRef(0)
    /** Opções mais recentes, lidas no momento do envio (a fila não depende de identidade de objeto). */
    const latest = useRef({ client, target, onUploaded, maxBytes })
    const start = useRef<(id: string) => Promise<void>>(async () => {})

    useEffect(() => {
        latest.current = { client, target, onUploaded, maxBytes }
    })

    const patch = useCallback((id: string, change: Partial<AttachmentUploadItem>) => {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...change } : item)))
    }, [])

    const pump = useCallback(() => {
        while (running.current < ATTACHMENT_UPLOAD_CONCURRENCY && queue.current.length > 0) {
            const id = queue.current.shift()
            if (!id) break
            running.current += 1
            void start.current(id)
        }
    }, [])

    useEffect(() => {
        start.current = async (id: string) => {
            const job = jobs.current.get(id)
            if (!job) {
                running.current = Math.max(0, running.current - 1)
                pump()
                return
            }
            const { file, controller } = job
            patch(id, { status: "uploading", progress: 0, error: undefined })
            try {
                const task =
                    job.task ??
                    (await startAttachmentUpload(latest.current.client, {
                        file,
                        target: latest.current.target,
                        signal: controller.signal,
                        onProgress: (progress) => patch(id, { progress, ...(progress >= 100 ? { status: "confirming" as const } : {}) }),
                    }))
                job.task = task
                const attachment = await latest.current.client.complete(task.reservationId)
                patch(id, { status: "done", progress: 100 })
                for (const waiter of job.waiters.splice(0)) waiter.resolve(attachment)
                latest.current.onUploaded?.(attachment)
            } catch (error) {
                if (controller.signal.aborted) patch(id, { status: "canceled" })
                else {
                    const code = apiErrorCode(error)
                    if (code && DEAD_RESERVATION_CODES.has(code)) job.task = null
                    patch(id, { status: "error", error: apiErrorMessage(error, "Falha ao enviar o arquivo") })
                }
            } finally {
                running.current = Math.max(0, running.current - 1)
                pump()
            }
        }
    }, [patch, pump])

    /** Valida, cria o envio e devolve o id (ou `null` quando o arquivo é recusado na hora). */
    const enqueue = useCallback(
        (file: File, inline: boolean): string | null => {
            if (file.size === 0) {
                toast.error(`"${file.name}" está vazio`)
                return null
            }
            if (file.size > latest.current.maxBytes) {
                toast.error(`"${file.name}" tem ${formatAttachmentSize(file.size)}: o limite por arquivo é ${formatAttachmentSize(latest.current.maxBytes)}`)
                return null
            }
            const id = randomId()
            jobs.current.set(id, { file, controller: new AbortController(), task: null, waiters: [] })
            queue.current.push(id)
            const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null
            if (previewUrl) previews.current.set(id, previewUrl)
            setItems((prev) => [
                ...prev,
                {
                    id,
                    name: file.name || fallbackAttachmentName(file.type),
                    size: file.size,
                    mimeType: file.type || ATTACHMENT_FALLBACK_MIME,
                    progress: 0,
                    status: "queued",
                    previewUrl,
                    inline,
                },
            ])
            pump()
            return id
        },
        [pump],
    )

    const upload = useCallback(
        (input: File[] | FileList) => {
            for (const file of Array.from(input)) enqueue(file, false)
        },
        [enqueue],
    )

    const enqueueMedia = useCallback(
        (file: File) => {
            const id = enqueue(file, true)
            // Arquivo recusado na hora (vazio ou acima do limite): o campo nem acompanha a promessa.
            if (!id) return { id: "", markdown: Promise.resolve("") }
            const job = jobs.current.get(id)!
            const markdown = new Promise<string>((resolve, reject) => {
                job.waiters.push({ resolve: (attachment) => resolve(attachment.markdown), reject })
            })
            return { id, markdown }
        },
        [enqueue],
    )

    const retry = useCallback(
        (id: string) => {
            const job = jobs.current.get(id)
            if (!job) return
            job.controller = new AbortController()
            queue.current.push(id)
            patch(id, { status: "queued", progress: 0, error: undefined })
            pump()
        },
        [patch, pump],
    )

    const cancel = useCallback(
        (id: string) => {
            const job = jobs.current.get(id)
            if (!job) return
            job.controller.abort()
            queue.current = queue.current.filter((item) => item !== id)
            for (const waiter of job.waiters.splice(0)) waiter.reject(new Error("Envio cancelado"))
            patch(id, { status: "canceled" })
        },
        [patch],
    )

    const dismiss = useCallback((id: string) => {
        const job = jobs.current.get(id)
        for (const waiter of job?.waiters.splice(0) ?? []) waiter.reject(new Error("Envio descartado"))
        const preview = previews.current.get(id)
        if (preview) {
            URL.revokeObjectURL(preview)
            previews.current.delete(id)
        }
        jobs.current.delete(id)
        setItems((prev) => prev.filter((item) => item.id !== id))
    }, [])

    useEffect(
        () => () => {
            for (const job of jobs.current.values()) {
                job.controller.abort()
                for (const waiter of job.waiters.splice(0)) waiter.reject(new Error("Tela desmontada"))
            }
            for (const preview of previews.current.values()) URL.revokeObjectURL(preview)
            previews.current.clear()
        },
        [],
    )

    const active = items.filter((item) => item.status === "queued" || item.status === "uploading" || item.status === "confirming").length
    const media = useMemo<MarkdownUploads>(() => ({ enqueue: enqueueMedia, items, retry, cancel, dismiss }), [enqueueMedia, items, retry, cancel, dismiss])

    return { items, active, upload, enqueueMedia, media, retry, cancel, dismiss }
}

// ── Anexos pendentes do formulário ─────────────────────────────────────────

export interface PendingAttachments {
    items: AttachmentUploadItem[]
    /** Confirmações já concluídas, na ordem do envio. */
    attachments: TaskAttachmentDto[]
    /** Ids dos anexos confirmados (`attachmentIds` do formulário). */
    ids: string[]
    /** Envios em andamento (fila + mídia colada na descrição). */
    active: number
    upload: (files: File[] | FileList) => void
    /** Estado dos envios para o campo Markdown (mídia colada entra na mesma fila e na mesma lista). */
    media: MarkdownUploads
    retry: (id: string) => void
    cancel: (id: string) => void
    dismiss: (id: string) => void
    remove: (attachment: TaskAttachmentDto) => Promise<void>
}

/**
 * Anexos enviados **antes** de o registro existir (criação da tarefa ou da prévia). Os arquivos
 * ficam pendentes até o salvamento levar os ids (`attachmentIds`); também é o caminho da mídia
 * colada na descrição, que entra na mesma fila e na mesma lista.
 */
export function usePendingAttachments(client: AttachmentClient): PendingAttachments {
    const [attachments, setAttachments] = useState<TaskAttachmentDto[]>([])
    const queue = useAttachmentUploads({ client, onUploaded: (attachment) => setAttachments((prev) => [...prev, attachment]) })

    const remove = useCallback(
        async (attachment: TaskAttachmentDto) => {
            await client.remove(attachment.id)
            setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))
        },
        [client],
    )

    const ids = useMemo(() => attachments.map((attachment) => attachment.id), [attachments])
    return {
        items: queue.items,
        attachments,
        ids,
        active: queue.active,
        upload: queue.upload,
        media: queue.media,
        retry: queue.retry,
        cancel: queue.cancel,
        dismiss: queue.dismiss,
        remove,
    }
}

// ── Mídia colada na descrição de uma tarefa existente ──────────────────────

export interface TaskDescriptionUploads {
    media: MarkdownUploads
    /** Envios em andamento (bloqueiam o salvamento até os anexos entrarem). */
    active: number
}

/**
 * Mídia colada/arrastada num campo de uma tarefa **existente** (descrição na edição e o formulário
 * de comentários): o arquivo já entra vinculado à tarefa (aba Anexos) e a referência vai para o
 * cursor do campo.
 */
export function useTaskDescriptionUploads(client: AttachmentClient, taskId: string): TaskDescriptionUploads {
    const queryClient = useQueryClient()
    const target = useMemo(() => ({ taskId }), [taskId])
    const onUploaded = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: [ATTACHMENTS_QUERY_KEY] })
    }, [queryClient])
    const queue = useAttachmentUploads({ client, target, onUploaded })
    return { media: queue.media, active: queue.active }
}
