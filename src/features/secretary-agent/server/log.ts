import { loggerFor } from "@/lib/logger"

/** Logger do Agente Secretário (nunca com texto de mensagem nem segredos). */
export const secretaryLog = loggerFor({ feature: "secretary-agent" })

/**
 * Campos seguros de um erro para o log: só a classe e o status HTTP. Nunca o objeto do erro, porque os erros da SDK
 * de IA carregam o corpo da requisição (prompt com a conversa, mídia), a resposta e os cabeçalhos.
 */
export function safeErr(error: unknown): { errorKind: string; status?: number } {
    const status = error && typeof error === "object" ? ((error as { statusCode?: unknown }).statusCode ?? (error as { status?: unknown }).status) : undefined
    return typeof status === "number" ? { errorKind: errorKind(error), status } : { errorKind: errorKind(error) }
}

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
