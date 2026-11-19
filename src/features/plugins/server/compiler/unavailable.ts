import { DomainError } from "@/lib/api/route"

/**
 * Compilador de plugins indisponível no servidor (OPE-172): o Rolldown (binário nativo) ou o
 * Tailwind (folhas de estilo) não carregou. É falha da instalação do Opex, não do código do plugin:
 * nunca vira "problema do plugin" para o agente corrigir.
 */
export const PLUGIN_COMPILER_UNAVAILABLE = "PLUGIN_COMPILER_UNAVAILABLE"

export function compilerUnavailable(component: "Rolldown" | "Tailwind", error: unknown): DomainError {
    const reason = error instanceof Error ? error.message : String(error)
    return new DomainError(
        503,
        `O compilador de plugins não está disponível neste servidor (${component}: ${reason}). Não é um problema do plugin: atualize a imagem do Opex e use Tentar novamente.`,
        PLUGIN_COMPILER_UNAVAILABLE,
    )
}

export const isCompilerUnavailable = (error: unknown): error is DomainError => error instanceof DomainError && error.code === PLUGIN_COMPILER_UNAVAILABLE
