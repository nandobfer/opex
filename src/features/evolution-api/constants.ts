/**
 * Integração Evolution API (OPE-192): WhatsApp pela Evolution API v2.3.8. Módulo PURO (usado na tela e
 * no servidor). Ver aicontext/modules/evolution-api.md.
 */

export const EVOLUTION_INTEGRATION_ID = "evolution-api" as const

/** Slug do ambiente (módulo Ambientes) de onde vem o pré-preenchimento. */
export const EVOLUTION_ENVIRONMENT_SLUG = "evolution-api"
/** Nome do serviço na rede `evolution-network` e porta padrão da Evolution. */
export const EVOLUTION_DEFAULT_HOST = "evolution-api"
export const EVOLUTION_DEFAULT_PORT = 8080
/** Variáveis do ambiente lidas no pré-preenchimento (a chave só no servidor). */
export const EVOLUTION_ENV_KEY = "AUTHENTICATION_API_KEY"
export const EVOLUTION_ENV_SERVER_URL = "SERVER_URL"
export const EVOLUTION_ENV_VERSION = "EVOLUTION_VERSION"
export const EVOLUTION_ENV_PORT = "SERVER_PORT"

/** Rede Docker compartilhada com a Evolution (o compose do Opex entra nela com o alias `opex-<porta>`). */
export const EVOLUTION_NETWORK = "evolution-network"

/** Caminho do webhook de entrada (fora do login, autenticado só pelo header com o segredo). */
export const EVOLUTION_WEBHOOK_PATH = "/api/evolution/webhook"
/** Header com o segredo do webhook, enviado pela Evolution (`webhook.headers`). */
export const EVOLUTION_WEBHOOK_SECRET_HEADER = "x-opex-webhook-secret"

/** Eventos assinados no registro do webhook (nomes da Evolution, `webhook/set`). */
export const EVOLUTION_WEBHOOK_EVENTS = [
    "CONNECTION_UPDATE",
    "QRCODE_UPDATED",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "CONTACTS_UPSERT",
    "CONTACTS_UPDATE",
    "CHATS_UPSERT",
    "CHATS_UPDATE",
] as const
export type EvolutionWebhookEvent = (typeof EVOLUTION_WEBHOOK_EVENTS)[number]

export const EVOLUTION_WEBHOOK_EVENT_LABELS: Record<EvolutionWebhookEvent, string> = {
    CONNECTION_UPDATE: "Conexão",
    QRCODE_UPDATED: "QR code",
    MESSAGES_UPSERT: "Mensagens recebidas",
    MESSAGES_UPDATE: "Mensagens atualizadas",
    CONTACTS_UPSERT: "Contatos (novos)",
    CONTACTS_UPDATE: "Contatos (atualizados)",
    CHATS_UPSERT: "Conversas (novas)",
    CHATS_UPDATE: "Conversas (atualizadas)",
}

/** Estado da conexão como a tela mostra. */
export type EvolutionConnectionState = "disconnected" | "waiting" | "connected"

export const EVOLUTION_STATE_LABELS: Record<EvolutionConnectionState, string> = {
    disconnected: "Desconectada",
    waiting: "Aguardando leitura",
    connected: "Conectada",
}

/** `open` | `connecting` | `close` (e `refused` no fim do limite de QR) → estado da tela. */
export function connectionStateOf(raw: string | null | undefined): EvolutionConnectionState {
    if (raw === "open") return "connected"
    if (raw === "connecting") return "waiting"
    return "disconnected"
}

/** Validade de cada QR code (Baileys: o 1º dura ~60 s, os seguintes ~20 s; usamos 40 s como estimativa da tela). */
export const EVOLUTION_QR_TTL_MS = 40_000
/** Quantos QR codes a Evolution gera antes de desistir (`QRCODE_LIMIT`, padrão 30 na 2.3.8). */
export const EVOLUTION_QR_LIMIT = 30

/** Opções da instância (`settings/set`). `readMessages` fica sempre desligada: quem lê é o Agente Secretário. */
export const EVOLUTION_INSTANCE_OPTIONS = [
    { key: "rejectCall", label: "Rejeitar chamadas", description: "Recusa ligações de voz e vídeo automaticamente" },
    { key: "groupsIgnore", label: "Ignorar grupos", description: "A Evolution não repassa mensagens de grupos" },
    { key: "alwaysOnline", label: "Sempre online", description: "Mantém o status online o tempo todo" },
    { key: "syncFullHistory", label: "Sincronizar histórico completo", description: "Necessário para a análise de personalidade do Agente Secretário" },
    { key: "readStatus", label: "Ler status", description: "Marca os status (stories) como vistos" },
] as const
export type EvolutionInstanceOptionKey = (typeof EVOLUTION_INSTANCE_OPTIONS)[number]["key"]

export const EVOLUTION_READ_MESSAGES_LOCKED_REASON = "O Agente Secretário controla a leitura das mensagens"

/** Evento em `private-app`: `{ type, instance }` (a tela invalida o cache; nada sensível no payload). */
export const EVOLUTION_UPDATED_EVENT = "evolution-updated"
export type EvolutionUpdateType = "connection" | "qrcode" | "profile" | "webhook" | "contacts" | "instances" | "settings"

export const EVOLUTION_QUERY_KEY = "evolution-api"

/** Abas da página da integração. */
export const EVOLUTION_TABS = ["geral", "instancia", "webhook", "operacoes", "debug"] as const
export type EvolutionTab = (typeof EVOLUTION_TABS)[number]

/** Sufixos de JID. */
export const GROUP_JID_SUFFIX = "@g.us"
export const USER_JID_SUFFIX = "@s.whatsapp.net"
export const LID_JID_SUFFIX = "@lid"

export const isGroupJid = (jid: string) => jid.endsWith(GROUP_JID_SUFFIX)
/** Número (só dígitos) de um JID de pessoa (`55319…@s.whatsapp.net`, com `:device` opcional). */
export function jidNumber(jid: string): string {
    return jid.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") ?? ""
}
/** JID de pessoa a partir de um número digitado. */
export function numberToJid(number: string): string {
    return `${number.replace(/\D/g, "")}${USER_JID_SUFFIX}`
}
/** Mesmo JID sem o sufixo de dispositivo (`5531…:12@s.whatsapp.net` → `5531…@s.whatsapp.net`). */
export function normalizeJid(jid: string): string {
    const [user, server] = jid.split("@")
    if (!server) return jid
    return `${user?.split(":")[0] ?? ""}@${server}`
}
