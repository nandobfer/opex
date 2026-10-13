import { parse as parseYaml } from "yaml"
import { DomainError } from "@/lib/api/route"
import { GithubError, githubRequestFull } from "@/features/github/client"
import { describeIsolationConflicts, findComposeIsolationConflicts, summarizeCompose } from "../logic"
import { MAX_COMPOSE_BYTES } from "../constants"
import type { ComposeSummary } from "../compose-types"

/**
 * Leitura do `docker-compose` pela API do GitHub (na branch do ambiente) e interpretação segura do
 * YAML. Sem execução de comandos; limites de tamanho; erros acionáveis em pt-BR.
 */

export interface ComposeFileResult {
    content: string
    summary: ComposeSummary
    conflicts: string[]
}

/** Interpreta o conteúdo YAML já baixado (puro, para testes). */
export function parseComposeContent(content: string, file = "docker-compose.yml"): ComposeSummary {
    let doc: unknown
    try {
        doc = parseYaml(content)
    } catch (error) {
        throw new DomainError(422, `O arquivo ${file} não é um YAML válido: ${error instanceof Error ? error.message : String(error)}`, "COMPOSE_INVALID")
    }
    return summarizeCompose(doc, file)
}

export function composeConflicts(content: string): string[] {
    try {
        const doc = parseYaml(content)
        return findComposeIsolationConflicts(doc)
    } catch {
        return []
    }
}

interface GithubContentResponse {
    content?: string
    encoding?: string
    size?: number
    html_url?: string
    message?: string
}

/** Baixa o compose pela API do GitHub (Contents API, `ref` = branch). */
export async function fetchComposeFile(repo: string, branch: string, file: string): Promise<ComposeFileResult> {
    const path = `/repos/${repo}/contents/${encodeURIComponent(file).replace(/%2F/g, "/")}`
    let response
    try {
        response = await githubRequestFull<GithubContentResponse>(`${path}?ref=${encodeURIComponent(branch)}`, { label: `compose ${file}` })
    } catch (error) {
        if (error instanceof GithubError) throw new DomainError(error.status === 404 ? 404 : 502, error.message, error.code)
        throw error
    }
    const data = response.data
    if (!data || typeof data.content !== "string") {
        throw new DomainError(404, `O arquivo ${file} não foi encontrado na branch ${branch}.`, "COMPOSE_NOT_FOUND")
    }
    const bytes = Buffer.from(data.content, data.encoding === "base64" ? "base64" : "utf8")
    if (bytes.byteLength > MAX_COMPOSE_BYTES) {
        throw new DomainError(413, `O arquivo ${file} é grande demais para exibir.`, "COMPOSE_TOO_LARGE")
    }
    const content = bytes.toString("utf8")
    const summary = parseComposeContent(content, file)
    const conflicts = composeConflicts(content)
    return { content, summary, conflicts }
}

export function describeComposeConflicts(conflicts: readonly string[]): string {
    return describeIsolationConflicts(conflicts)
}
