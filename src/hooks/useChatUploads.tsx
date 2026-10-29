"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import axios from "axios"
import { toast } from "sonner"
import { apiErrorMessage } from "@/lib/api"
import { randomId } from "@/lib/random-id"
import { fallbackAttachmentName, formatAttachmentSize } from "@/lib/attachments"
import { chatFileKind, megabytesToBytes, type ChatFileDto, type ChatFileKind, type ChatFileReservationDto, type ChatFilesLimits, type ReserveChatFileInput } from "@/lib/chat-files/kind"

/**
 * Fila de envio de arquivos anexados a mensagens de agentes, separada por `scope` (sessão do chat,
 * campo da mesa…). Fica acima das telas que a usam: trocar de aba não perde os envios. Cada arquivo
 * segue o envio em duas fases: reserva (URL assinada) → PUT direto no Storage S3 com progresso real →
 * confirmação. Cada feature cria a sua fila com `createChatUploads(endpoints)` (contexto próprio);
 * quando as rotas dependem do contexto (ex.: o Agente Opex do dono ou do portal), o provider recebe
 * `endpoints` e substitui os padrões.
 */

export type ChatUploadStatus = "uploading" | "confirming" | "done" | "error"

export interface ChatUploadItem {
    localId: string
    /** Destino da fila (ex.: id da sessão do chat ou do campo da mesa). */
    scope: string
    file: File
    name: string
    size: number
    mediaType: string
    kind: ChatFileKind
    /** URL local (miniatura) das imagens. */
    previewUrl: string | null
    status: ChatUploadStatus
    progress: number
    error: string | null
    /** Reserva no servidor (id do arquivo) e se o PUT já foi aceito pelo storage. */
    reservationId: string | null
    putDone: boolean
    /** Arquivo confirmado no servidor. */
    uploaded: ChatFileDto | null
}

/** Chamadas ao servidor da feature (reserva, confirmação e remoção de um arquivo ainda não enviado). */
export interface ChatUploadEndpoints {
    reserve: (scope: string, input: ReserveChatFileInput, signal: AbortSignal) => Promise<ChatFileReservationDto>
    complete: (id: string, signal: AbortSignal) => Promise<ChatFileDto>
    remove: (id: string) => Promise<unknown>
}

/** Separa os arquivos aceitos dos recusados pelos limites (quantidade e tamanho). */
export function checkFiles(files: readonly File[], current: number, limits: ChatFilesLimits): { accepted: File[]; tooLarge: File[]; overflow: number } {
    const max = megabytesToBytes(limits.maxSizeMb)
    const room = Math.max(0, limits.maxPerMessage - current)
    const accepted: File[] = []
    const tooLarge: File[] = []
    let overflow = 0
    for (const file of files) {
        if (file.size > max) tooLarge.push(file)
        else if (accepted.length < room) accepted.push(file)
        else overflow++
    }
    return { accepted, tooLarge, overflow }
}

interface UploadsContextValue {
    items: ChatUploadItem[]
    enqueue: (scope: string, files: readonly File[], limits: ChatFilesLimits) => void
    retry: (localId: string) => void
    remove: (localId: string) => void
    /** Tira da fila os arquivos que foram numa mensagem. */
    clearSent: (localIds: readonly string[]) => void
}

/** Situação da fila de um destino (itens, prontos, bloqueios do envio) e as ações. */
export interface ChatUploadsScope {
    /** Fila montada (`false` só com `optional` e sem o provider: anexar fica indisponível). */
    available: boolean
    items: ChatUploadItem[]
    uploading: boolean
    failed: boolean
    ready: ChatUploadItem[]
    enqueue: UploadsContextValue["enqueue"]
    retry: UploadsContextValue["retry"]
    remove: UploadsContextValue["remove"]
    clearSent: UploadsContextValue["clearSent"]
}

/** Dica do botão de envio enquanto a fila impede o envio (ou `null` quando pode enviar). */
export function uploadsBlockReason(scope: Pick<ChatUploadsScope, "uploading" | "failed">): string | null {
    if (scope.uploading) return "Aguarde o envio dos arquivos"
    if (scope.failed) return "Remova ou reenvie os arquivos com erro"
    return null
}

const NO_ITEMS: ChatUploadItem[] = []
const noop = () => undefined
const INERT: Omit<ChatUploadsScope, "items" | "ready"> = { available: false, uploading: false, failed: false, enqueue: noop, retry: noop, remove: noop, clearSent: noop }

function required(endpoints: ChatUploadEndpoints | null, name: string): ChatUploadEndpoints {
    if (!endpoints) throw new Error(`A fila de arquivos ${name} precisa das rotas de envio`)
    return endpoints
}

/**
 * Cria a fila de uma feature (contexto próprio). `optional`: sem o provider, o hook devolve uma fila
 * inerte (`available: false`) em vez de lançar — para componentes que também vivem fora da tela com fila.
 */
export function createChatUploads(defaults: ChatUploadEndpoints | null, name: string, options: { optional?: boolean } = {}) {
    const UploadsContext = createContext<UploadsContextValue | null>(null)

    function ChatUploadsProvider({ children, endpoints: override }: { children: ReactNode; endpoints?: ChatUploadEndpoints }) {
        const endpointsRef = useRef<ChatUploadEndpoints | null>(override ?? defaults)
        useEffect(() => {
            endpointsRef.current = override ?? defaults
        }, [override])
        const endpoints = useMemo<ChatUploadEndpoints>(
            () => ({
                reserve: (...args) => required(endpointsRef.current, name).reserve(...args),
                complete: (...args) => required(endpointsRef.current, name).complete(...args),
                remove: (...args) => required(endpointsRef.current, name).remove(...args),
            }),
            [],
        )
        const [items, setItems] = useState<ChatUploadItem[]>([])
        const controllers = useRef(new Map<string, AbortController>())
        const itemsRef = useRef(items)
        useEffect(() => {
            itemsRef.current = items
        }, [items])

        const patch = useCallback((localId: string, change: Partial<ChatUploadItem>) => {
            itemsRef.current = itemsRef.current.map((item) => (item.localId === localId ? { ...item, ...change } : item))
            setItems(itemsRef.current)
        }, [])

        const upload = useCallback(
            async (localId: string) => {
                const item = itemsRef.current.find((entry) => entry.localId === localId)
                if (!item) return
                const controller = new AbortController()
                controllers.current.set(localId, controller)
                patch(localId, { status: item.putDone ? "confirming" : "uploading", error: null, ...(item.putDone ? {} : { progress: 0 }) })
                let reservationId = item.reservationId
                try {
                    if (!item.putDone) {
                        const reservation = await endpoints.reserve(item.scope, { name: item.name, size: item.size, mediaType: item.mediaType }, controller.signal)
                        reservationId = reservation.id
                        patch(localId, { reservationId })
                        try {
                            await axios.put(reservation.url, item.file, {
                                headers: reservation.headers,
                                signal: controller.signal,
                                onUploadProgress: (event) => {
                                    const total = event.total ?? item.size
                                    patch(localId, { progress: total > 0 ? Math.min(99, Math.round(((event.loaded ?? 0) / total) * 100)) : 0 })
                                },
                            })
                        } catch (error) {
                            // PUT recusado: a reserva é liberada e a nova tentativa reserva de novo.
                            void endpoints.remove(reservation.id).catch(() => undefined)
                            patch(localId, { reservationId: null })
                            throw error
                        }
                        patch(localId, { putDone: true, status: "confirming", progress: 100 })
                    }
                    const uploaded = await endpoints.complete(reservationId!, controller.signal)
                    patch(localId, { status: "done", progress: 100, uploaded })
                } catch (error) {
                    if (controller.signal.aborted) return
                    patch(localId, { status: "error", error: apiErrorMessage(error, "Não foi possível enviar o arquivo") })
                } finally {
                    controllers.current.delete(localId)
                }
            },
            [patch, endpoints],
        )

        const enqueue = useCallback<UploadsContextValue["enqueue"]>(
            (scope, files, limits) => {
                const current = itemsRef.current.filter((item) => item.scope === scope).length
                const { accepted, tooLarge, overflow } = checkFiles(files, current, limits)
                for (const file of tooLarge) toast.error(`"${file.name}" tem ${formatAttachmentSize(file.size)}: o limite é ${formatAttachmentSize(megabytesToBytes(limits.maxSizeMb))}`)
                if (overflow) toast.error(`Até ${limits.maxPerMessage} arquivo(s) por mensagem: ${overflow} ficou(aram) de fora`)
                const created = accepted.map<ChatUploadItem>((file) => {
                    const mediaType = file.type || "application/octet-stream"
                    const fileName = file.name?.trim() || fallbackAttachmentName(mediaType)
                    const kind = chatFileKind(mediaType, fileName)
                    return {
                        localId: randomId(),
                        scope,
                        file,
                        name: fileName,
                        size: file.size,
                        mediaType,
                        kind,
                        previewUrl: kind === "image" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null,
                        status: "uploading",
                        progress: 0,
                        error: null,
                        reservationId: null,
                        putDone: false,
                        uploaded: null,
                    }
                })
                if (!created.length) return
                itemsRef.current = [...itemsRef.current, ...created]
                setItems(itemsRef.current)
                for (const item of created) void upload(item.localId)
            },
            [upload],
        )

        const retry = useCallback((localId: string) => void upload(localId), [upload])

        const forget = useCallback((localIds: readonly string[]) => {
            const ids = new Set(localIds)
            for (const item of itemsRef.current) if (ids.has(item.localId) && item.previewUrl) URL.revokeObjectURL(item.previewUrl)
            itemsRef.current = itemsRef.current.filter((item) => !ids.has(item.localId))
            setItems(itemsRef.current)
        }, [])

        const remove = useCallback(
            (localId: string) => {
                const item = itemsRef.current.find((entry) => entry.localId === localId)
                if (!item) return
                controllers.current.get(localId)?.abort()
                // Já reservado no servidor: apaga (sem uso, a limpeza oportunista também o remove em 24 h).
                const fileId = item.uploaded?.id ?? item.reservationId
                if (fileId) void endpoints.remove(fileId).catch(() => undefined)
                forget([localId])
            },
            [forget, endpoints],
        )

        useEffect(() => {
            const active = controllers.current
            return () => {
                for (const controller of active.values()) controller.abort()
                for (const item of itemsRef.current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
            }
        }, [])

        const value = useMemo<UploadsContextValue>(() => ({ items, enqueue, retry, remove, clearSent: forget }), [items, enqueue, retry, remove, forget])
        return <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>
    }
    ChatUploadsProvider.displayName = `${name}UploadsProvider`

    /** Fila de um destino: itens, situação para o envio e ações. */
    function useChatUploadsScope(scope: string | null): ChatUploadsScope {
        const context = useContext(UploadsContext)
        if (!context && !options.optional) throw new Error(`A fila de arquivos precisa do ${name}UploadsProvider`)
        const all = context?.items ?? NO_ITEMS
        const items = useMemo(() => all.filter((item) => item.scope === scope), [all, scope])
        if (!context) return { ...INERT, items: NO_ITEMS, ready: NO_ITEMS }
        return {
            available: true,
            items,
            uploading: items.some((item) => item.status === "uploading" || item.status === "confirming"),
            failed: items.some((item) => item.status === "error"),
            ready: items.filter((item) => item.status === "done" && item.uploaded),
            enqueue: context.enqueue,
            retry: context.retry,
            remove: context.remove,
            clearSent: context.clearSent,
        }
    }

    return { Provider: ChatUploadsProvider, useScope: useChatUploadsScope }
}
