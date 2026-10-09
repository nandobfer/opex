import { DomainError } from "@/lib/api/route"
import { GithubError } from "../client"

/** `GithubError` → resposta da rota (mensagens pt-BR já vêm do cliente). */
export function toGithubDomainError(error: unknown): never {
    if (error instanceof GithubError) {
        switch (error.code) {
            case "NOT_CONFIGURED":
                throw new DomainError(409, error.message, "GITHUB_NOT_CONFIGURED")
            case "UNAUTHENTICATED":
                throw new DomainError(409, error.message, "GITHUB_TOKEN_INVALID")
            case "FORBIDDEN":
                throw new DomainError(403, error.message, "GITHUB_FORBIDDEN")
            case "NOT_FOUND":
                throw new DomainError(404, error.message, "GITHUB_NOT_FOUND")
            case "RATE_LIMITED":
                throw new DomainError(429, error.message, "GITHUB_RATE_LIMITED")
            case "UNAVAILABLE":
                throw new DomainError(502, error.message, "GITHUB_UNAVAILABLE")
            default:
                throw new DomainError(400, error.message, "GITHUB_REJECTED")
        }
    }
    throw error
}

export const errorMessage = (error: unknown, fallback = "Falha inesperada") => (error instanceof Error ? error.message : fallback)
