"use client"

import axios, { type AxiosInstance } from "axios"
import { unwrapApi } from "@/lib/api"
import { fallbackAttachmentName } from "@/lib/attachments"
import type { ApiResponse } from "@/lib/types/api"
import { ATTACHMENT_FALLBACK_MIME } from "./constants"
import type { AttachmentReserveInput } from "./schemas"
import type { AttachmentReservationDto, TaskAttachmentDto, TaskAttachmentListDto } from "./types"

/**
 * Acesso aos anexos pelo navegador. Usa o axios autenticado da tela (app do dono ou portal do
 * cliente) para as rotas do Opex e um PUT **direto** na URL assinada do storage para o arquivo — o
 * binário não passa pelo servidor do app.
 */

export interface AttachmentTarget {
    taskId?: string
    draftId?: string
}

export interface SignedUploadInput {
    url: string
    file: File
    mimeType: string
    onProgress?: (percent: number) => void
    signal?: AbortSignal
}

export interface AttachmentClient {
    list(target: AttachmentTarget): Promise<TaskAttachmentDto[]>
    reserve(input: AttachmentReserveInput): Promise<AttachmentReservationDto>
    complete(id: string): Promise<TaskAttachmentDto>
    cancel(id: string): Promise<void>
    remove(id: string): Promise<void>
    uploadToSignedUrl(input: SignedUploadInput): Promise<void>
}

/** Cliente de anexos sobre um axios já autenticado (o do app ou o do portal). */
export function createAttachmentClient(api: AxiosInstance): AttachmentClient {
    return {
        list: async (target) => unwrapApi((await api.get<ApiResponse<TaskAttachmentListDto>>("/attachments", { params: target })).data).attachments,
        reserve: async (input) => unwrapApi((await api.post<ApiResponse<AttachmentReservationDto>>("/attachments", input)).data),
        complete: async (id) => unwrapApi((await api.post<ApiResponse<TaskAttachmentDto>>(`/attachments/uploads/${id}/complete`, {})).data),
        cancel: async (id) => {
            await api.delete(`/attachments/uploads/${id}`)
        },
        remove: async (id) => {
            await api.delete(`/attachments/${id}`)
        },
        uploadToSignedUrl: async ({ url, file, mimeType, onProgress, signal }) => {
            await axios.put(url, file, {
                headers: { "Content-Type": mimeType },
                signal,
                onUploadProgress: (event) => {
                    if (!onProgress) return
                    const total = event.total ?? file.size
                    onProgress(total > 0 ? Math.min(100, Math.round(((event.loaded ?? 0) / total) * 100)) : 0)
                },
            })
        },
    }
}

/**
 * Fluxo completo de um arquivo: reserva a URL assinada, envia direto ao storage (com progresso) e
 * confirma no servidor. Um envio abortado libera a reserva.
 */
export async function uploadAttachment(
    client: AttachmentClient,
    input: { file: File; target?: AttachmentTarget; onProgress?: (percent: number) => void; signal?: AbortSignal },
): Promise<TaskAttachmentDto> {
    const task = await startAttachmentUpload(client, input)
    return client.complete(task.reservationId)
}

/** O que a confirmação precisa para repetir sem enviar o arquivo de novo. */
export interface AttachmentUploadTask {
    /** Id da reserva (a confirmação usa este id). */
    reservationId: string
    /** O PUT foi aceito pelo storage; repetir a partir daqui refaz **só** a confirmação. */
    uploaded: boolean
}

/**
 * Reserva a URL assinada e envia o arquivo direto ao storage, **sem** confirmar. Devolve o necessário
 * para repetir a confirmação sem novo envio quando o PUT já foi aceito; se o PUT falhar, libera a
 * reserva. Arquivo **sem nome** (mídia colada da área de transferência) ganha um nome padrão do tipo.
 */
export async function startAttachmentUpload(
    client: AttachmentClient,
    input: { file: File; target?: AttachmentTarget; onProgress?: (percent: number) => void; signal?: AbortSignal },
): Promise<AttachmentUploadTask> {
    const mimeType = input.file.type || ATTACHMENT_FALLBACK_MIME
    const name = input.file.name?.trim() || fallbackAttachmentName(mimeType)
    const reservation = await client.reserve({ name, size: input.file.size, mimeType, ...input.target })
    try {
        await client.uploadToSignedUrl({ url: reservation.url, file: input.file, mimeType, onProgress: input.onProgress, signal: input.signal })
    } catch (error) {
        await client.cancel(reservation.id).catch(() => undefined)
        throw error
    }
    return { reservationId: reservation.id, uploaded: true }
}
