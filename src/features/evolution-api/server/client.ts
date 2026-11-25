
import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { EVOLUTION_INTEGRATION_ID } from "../constants"
import {
    evolutionBase64Schema,
    evolutionChatSchema,
    evolutionConnectSchema,
    evolutionConnectionStateSchema,
    evolutionContactSchema,
    evolutionGroupSchema,
    evolutionInfoSchema,
    evolutionInstancesSchema,
    evolutionMessagesPageSchema,
    evolutionMessageSchema,
    evolutionNumberCheckSchema,
    evolutionPictureSchema,
    evolutionSentSchema,
    evolutionSettingsSchema,
    evolutionWebhookSchema,
    type EvolutionMessage,
    type EvolutionMessageKey,
    type EvolutionSettings,
} from "../evolution-dto"

/**
 * Cliente HTTP da Evolution API v2.3.8 (rotas de `src/api/routes`). A chave global vai no header `apikey`
 * e é mascarada no debug (segredo da integração). Erros viram `EvolutionError` com mensagem pt-BR.
 */

export interface EvolutionTarget {
    baseUrl: string
    apiKey: string
}

export class EvolutionError extends Error {
    constructor(
        message: string,
        readonly status: number | null,
        readonly code: "UNREACHABLE" | "UNAUTHORIZED" | "NOT_FOUND" | "BAD_REQUEST" | "UPSTREAM" | "NOT_CONFIGURED" | "INVALID_RESPONSE",
    ) {
        super(message)
        this.name = "EvolutionError"
    }
}

/** Alvo a partir da integração salva (URL interna + chave). */
export async function evolutionTarget(): Promise<EvolutionTarget> {
    const config = await getIntegrationConfig(EVOLUTION_INTEGRATION_ID)
    const baseUrl = config.internalUrl?.trim().replace(/\/+$/, "")
    if (!baseUrl) throw new EvolutionError("Configure a URL interna da Evolution API em Integrações › Evolution API", null, "NOT_CONFIGURED")
    if (!config.apiKey) throw new EvolutionError("Configure a chave global da Evolution API em Integrações › Evolution API", null, "NOT_CONFIGURED")
    return { baseUrl, apiKey: config.apiKey }
}

interface CallOptions {
    target?: EvolutionTarget
    signal?: AbortSignal
    timeoutMs?: number
    query?: Record<string, string | undefined>
    body?: unknown
    label?: string
}

/** Chamada crua: valida a resposta com `schema`. */
export async function evolutionCall<S extends z.ZodType>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, schema: S, options: CallOptions = {}): Promise<z.infer<S>> {
    const target = options.target ?? (await evolutionTarget())
    const url = new URL(`${target.baseUrl}${path}`)
    for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined) url.searchParams.set(key, value)
    const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(options.timeoutMs ?? 20_000)])
    const dbg = integrationDebug(EVOLUTION_INTEGRATION_ID)
    let response: Response
    try {
        // Não envie cabeçalhos, query, corpos ou erros crus a logs ou ao navegador.
        const safeDebug = { ...dbg,
            request: () => dbg.request(`${options.label ?? "Evolution"}: ${method}`),
            response: (_message: string, data?: unknown) => dbg.response(`${options.label ?? "Evolution"}: resposta recebida`, { status: (data as { status?: number } | undefined)?.status }),
            error: () => dbg.error(`${options.label ?? "Evolution"}: falha de rede`),
        }
        response = await debugFetch(safeDebug, options.label ?? "Evolution", url.toString(), {
            method,
            headers: { apikey: target.apiKey, ...(options.body !== undefined ? { "content-type": "application/json" } : {}) },
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
            signal,
            cache: "no-store",
            redirect: "error",
        }, { url: "[Evolution API]", body: "[omitido]" })
    } catch {
        throw new EvolutionError("Evolution API fora do alcance. Confira a URL e tente novamente.", null, "UNREACHABLE")
    }
    const text = await response.text()
    let payload: unknown = null
    if (text) {
        try {
            payload = JSON.parse(text)
        } catch {
            payload = text
        }
    }
    if (!response.ok) {
        const detail = `HTTP ${response.status}`
        if (response.status === 401 || response.status === 403) throw new EvolutionError("Chave da Evolution API recusada: confira a chave global", response.status, "UNAUTHORIZED")
        if (response.status === 404) throw new EvolutionError(`Não encontrado na Evolution API: ${detail}`, 404, "NOT_FOUND")
        if (response.status === 400) throw new EvolutionError(`A Evolution API recusou o pedido: ${detail}`, 400, "BAD_REQUEST")
        throw new EvolutionError(`Erro da Evolution API: ${detail}`, response.status, "UPSTREAM")
    }
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
        dbg.warn(`${options.label ?? "Evolution"}: resposta fora do formato esperado`, { issues: parsed.error.issues.slice(0, 3) })
        throw new EvolutionError("Resposta inesperada da Evolution API", response.status, "INVALID_RESPONSE")
    }
    return parsed.data
}

/** Converte `EvolutionError` em `DomainError` para as rotas. */
export function toDomainError(error: unknown): never {
    if (error instanceof EvolutionError) {
        const status = error.code === "NOT_CONFIGURED" ? 409 : error.code === "NOT_FOUND" ? 404 : error.code === "BAD_REQUEST" ? 400 : 502
        throw new DomainError(status, error.message, `EVOLUTION_${error.code}`)
    }
    throw error
}

const inst = (name: string) => encodeURIComponent(name)
/** Resposta que o Opex não usa (só o status HTTP importa). */
const anyPayload = z.unknown()

export const evolution = {
    info: (options?: CallOptions) => evolutionCall("GET", "/", evolutionInfoSchema, { label: "Versão", ...options }),
    fetchInstances: (options?: CallOptions) => evolutionCall("GET", "/instance/fetchInstances", evolutionInstancesSchema, { label: "Instâncias", ...options }),
    createInstance: (name: string, settings: EvolutionSettings, options?: CallOptions) =>
        evolutionCall("POST", "/instance/create", anyPayload, {
            label: "Criar instância",
            body: { instanceName: name, integration: "WHATSAPP-BAILEYS", qrcode: false, ...settings, readMessages: false },
            ...options,
        }),
    connect: (name: string, number?: string, options?: CallOptions) =>
        evolutionCall("GET", `/instance/connect/${inst(name)}`, evolutionConnectSchema, { label: "Conectar", query: { number: number?.replace(/\D/g, "") || undefined }, ...options }),
    connectionState: (name: string, options?: CallOptions) => evolutionCall("GET", `/instance/connectionState/${inst(name)}`, evolutionConnectionStateSchema, { label: "Estado", ...options }),
    restart: (name: string, options?: CallOptions) => evolutionCall("POST", `/instance/restart/${inst(name)}`, anyPayload, { label: "Reiniciar", ...options }),
    logout: (name: string, options?: CallOptions) => evolutionCall("DELETE", `/instance/logout/${inst(name)}`, anyPayload, { label: "Desconectar", ...options }),
    deleteInstance: (name: string, options?: CallOptions) => evolutionCall("DELETE", `/instance/delete/${inst(name)}`, anyPayload, { label: "Excluir instância", ...options }),
    findSettings: (name: string, options?: CallOptions) => evolutionCall("GET", `/settings/find/${inst(name)}`, evolutionSettingsSchema.nullable(), { label: "Opções", ...options }),
    setSettings: (name: string, settings: EvolutionSettings, options?: CallOptions) =>
        evolutionCall("POST", `/settings/set/${inst(name)}`, anyPayload, {
            label: "Gravar opções",
            body: { rejectCall: false, groupsIgnore: false, alwaysOnline: false, readStatus: false, syncFullHistory: false, msgCall: "", ...settings, readMessages: false },
            ...options,
        }),
    findWebhook: (name: string, options?: CallOptions) => evolutionCall("GET", `/webhook/find/${inst(name)}`, evolutionWebhookSchema.nullable(), { label: "Webhook", ...options }),
    setWebhook: (name: string, input: { url: string; events: readonly string[]; headers: Record<string, string> }, options?: CallOptions) =>
        evolutionCall("POST", `/webhook/set/${inst(name)}`, evolutionWebhookSchema, {
            label: "Registrar webhook",
            body: { webhook: { enabled: true, url: input.url, events: input.events, headers: input.headers, byEvents: false, base64: false } },
            ...options,
        }),
    sendText: (name: string, input: { number: string; text: string; delay?: number; quotedId?: string }, options?: CallOptions) =>
        evolutionCall("POST", `/message/sendText/${inst(name)}`, evolutionSentSchema, {
            label: "Enviar texto",
            body: { number: input.number, text: input.text, ...(input.delay ? { delay: input.delay } : {}), ...(input.quotedId ? { quoted: { key: { id: input.quotedId } } } : {}) },
            ...options,
        }),
    sendPresence: (name: string, input: { number: string; presence: "composing" | "paused" | "available"; delay: number }, options?: CallOptions) =>
        evolutionCall("POST", `/chat/sendPresence/${inst(name)}`, anyPayload, { label: "Presença", body: input, ...options }),
    markAsRead: (name: string, keys: Pick<EvolutionMessageKey, "id" | "remoteJid" | "fromMe">[], options?: CallOptions) =>
        evolutionCall("POST", `/chat/markMessageAsRead/${inst(name)}`, anyPayload, {
            label: "Marcar como lida",
            body: { readMessages: keys.map((key) => ({ id: key.id, remoteJid: key.remoteJid, fromMe: key.fromMe })) },
            ...options,
        }),
    whatsappNumbers: (name: string, numbers: string[], options?: CallOptions) =>
        evolutionCall("POST", `/chat/whatsappNumbers/${inst(name)}`, evolutionNumberCheckSchema, { label: "Consultar números", body: { numbers }, ...options }),
    findContacts: (name: string, options?: CallOptions) => evolutionCall("POST", `/chat/findContacts/${inst(name)}`, evolutionContactSchema.array(), { label: "Contatos", body: {}, timeoutMs: 60_000, ...options }),
    findChats: (name: string, options?: CallOptions) => evolutionCall("POST", `/chat/findChats/${inst(name)}`, evolutionChatSchema.array(), { label: "Conversas", body: {}, timeoutMs: 60_000, ...options }),
    fetchGroups: (name: string, options?: CallOptions) =>
        evolutionCall("GET", `/group/fetchAllGroups/${inst(name)}`, evolutionGroupSchema.array(), { label: "Grupos", query: { getParticipants: "false" }, timeoutMs: 60_000, ...options }),
    profilePicture: (name: string, number: string, options?: CallOptions) =>
        evolutionCall("POST", `/chat/fetchProfilePictureUrl/${inst(name)}`, evolutionPictureSchema, { label: "Foto do perfil", body: { number }, ...options }),
    mediaBase64: (name: string, messageId: string, options?: CallOptions) =>
        evolutionCall("POST", `/chat/getBase64FromMediaMessage/${inst(name)}`, evolutionBase64Schema, {
            label: "Baixar mídia",
            body: { message: { key: { id: messageId } }, convertToMp4: false },
            timeoutMs: 60_000,
            ...options,
        }),
    /** Uma página de mensagens de uma conversa (mais novas primeiro na 2.3.8). */
    findMessages: async (name: string, input: { remoteJid: string; page?: number; pageSize?: number; from?: Date; to?: Date }, options?: CallOptions) => {
        const result = await evolutionCall("POST", `/chat/findMessages/${inst(name)}`, evolutionMessagesPageSchema, {
            label: "Mensagens",
            timeoutMs: 60_000,
            body: {
                where: {
                    key: { remoteJid: input.remoteJid },
                    ...(input.from ? { messageTimestamp: { gte: input.from.toISOString(), lte: (input.to ?? new Date()).toISOString() } } : {}),
                },
                page: input.page ?? 1,
                offset: input.pageSize ?? 50,
            },
            ...options,
        })
        const records: EvolutionMessage[] = []
        for (const raw of result.messages.records) {
            const parsed = evolutionMessageSchema.safeParse(raw)
            if (parsed.success) records.push(parsed.data)
        }
        return { total: result.messages.total, pages: result.messages.pages, page: result.messages.currentPage, records }
    },
}
