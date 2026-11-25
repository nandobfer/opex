import { getAiProvider, type AiProviderId } from "@/lib/ai/providers"

export class SecretaryDeliveryError extends Error {
    constructor(readonly kind: "missing" | "invalid") {
        super(kind === "missing" ? "O modelo terminou sem entregar a resposta." : "O modelo entregou uma resposta em formato inválido.")
        this.name = "SecretaryDeliveryError"
    }
}

export function providerHttpStatus(error: unknown): number | undefined {
    const status = (error as { statusCode?: unknown } | null)?.statusCode
    return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined
}

/** Traduz diagnósticos conhecidos, sem repassar texto arbitrário que possa repetir a conversa ou uma credencial. */
function providerDetail(error: unknown, status: number): string {
    const body = (error as { responseBody?: unknown }).responseBody
    if (typeof body === "string") {
        try {
            const message: unknown = JSON.parse(body)?.error?.message
            if (typeof message === "string") {
                const diagnostic = message.slice(0, 200).replace(/\s+/g, " ")
                if (/response_format|json_object/i.test(diagnostic)) return "O provedor não aceitou o formato da resposta."
                if (/tool_choice/i.test(diagnostic)) return "O provedor não aceitou a configuração de chamada de ferramentas."
                if (/context length|context window/i.test(diagnostic)) return "A chamada excedeu o contexto aceito pelo modelo."
            }
        } catch { /* corpo não estruturado: usa apenas o status */ }
    }
    if (status === 401 || status === 403) return "Confira a credencial e o acesso ao modelo em Integrações › IA."
    if (status === 429) return "Limite de uso atingido. Confira a cota do provedor."
    return "Confira o modelo e teste a conexão em Integrações › IA."
}

export function providerErrorMessage(error: unknown, provider?: AiProviderId | null): string {
    if (error instanceof SecretaryDeliveryError) return error.message
    const status = providerHttpStatus(error)
    if (status) return `${provider ? getAiProvider(provider).name : "O provedor"} recusou a chamada (HTTP ${status}). ${providerDetail(error, status)}`
    if (error instanceof Error && error.name === "TimeoutError") return "O modelo não respondeu dentro do prazo. Tente novamente."
    return "Não foi possível concluir a operação. Confira a conexão e tente novamente."
}

export class SecretaryProviderError extends Error {
    constructor(error: unknown, provider?: AiProviderId | null) {
        super(providerErrorMessage(error, provider), { cause: error })
        this.name = "SecretaryProviderError"
    }
}
