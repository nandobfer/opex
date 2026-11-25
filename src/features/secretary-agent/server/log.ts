import { loggerFor } from "@/lib/logger"

/** Logger do Agente Secretário (nunca com texto de mensagem nem segredos). */
export const secretaryLog = loggerFor({ feature: "secretary-agent" })

/** Classe curta do erro para o motivo da decisão (sem a mensagem, que pode repetir dados da conversa). */
export function errorKind(error: unknown): string {
    if (error && typeof error === "object") {
        const code = (error as { code?: unknown }).code
        if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) return code
        const name = (error as { name?: unknown }).name
        if (typeof name === "string" && name) return name
    }
    return "Error"
}
