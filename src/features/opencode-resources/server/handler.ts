import { DomainError } from "@/lib/api/route"
import type { OpencodeResourceKind } from "../constants"
import { encodeResourceId } from "../ids"
import type { ResourceContentInput, ResourceInstallInput } from "../schemas"
import type { OpencodeResourceDetailDto, OpencodeResourceDto } from "../types"
import type { ScopeContext } from "./context"

/** Contrato de cada tipo de recurso (skills, agentes, comandos, plugins, MCPs). */

export interface MutationEffect {
    /** Só vale depois de reiniciar o serviço (plugins). */
    restartRequired?: boolean
}

export interface KindHandler {
    list(ctx: ScopeContext, options: { refresh?: boolean }): Promise<OpencodeResourceDto[]>
    get(ctx: ScopeContext, name: string): Promise<OpencodeResourceDetailDto>
    create?(ctx: ScopeContext, name: string, content: ResourceContentInput): Promise<MutationEffect>
    update?(ctx: ScopeContext, name: string, content: ResourceContentInput): Promise<MutationEffect>
    remove(ctx: ScopeContext, name: string): Promise<MutationEffect>
    setEnabled(ctx: ScopeContext, name: string, enabled: boolean): Promise<MutationEffect>
    install?(ctx: ScopeContext, input: ResourceInstallInput): Promise<MutationEffect & { names: string[] }>
    /** Devolve em `names` só os itens que de fato tratou. */
    updateVersions?(ctx: ScopeContext, items: readonly OpencodeResourceDto[]): Promise<MutationEffect & { names: string[] }>
}

export function baseDto(ctx: ScopeContext, kind: OpencodeResourceKind, name: string, rest: Omit<OpencodeResourceDto, "id" | "kind" | "name" | "scope" | "scopeLabel">): OpencodeResourceDto {
    return { id: encodeResourceId({ kind, scope: ctx.scope.id, name }), kind, name, scope: ctx.scope.id, scopeLabel: ctx.scope.label, ...rest }
}

export function notFound(kind: OpencodeResourceKind, name: string): DomainError {
    const label = { skill: "Skill", agent: "Agente", command: "Comando", plugin: "Plugin", mcp: "MCP" }[kind]
    return new DomainError(404, `${label} "${name}" não encontrado neste escopo`, "OPENCODE_RESOURCE_NOT_FOUND")
}

export function readOnly(name: string): DomainError {
    return new DomainError(409, `"${name}" é nativo do OpenCode (ou de um plugin) e não pode ser alterado aqui`, "OPENCODE_RESOURCE_READ_ONLY")
}

export function mustBeEnabled(name: string): DomainError {
    return new DomainError(409, `"${name}" está desligado: ligue-o antes de editar`, "OPENCODE_RESOURCE_DISABLED")
}

export function alreadyExists(name: string): DomainError {
    return new DomainError(409, `Já existe um item chamado "${name}" neste escopo`, "OPENCODE_RESOURCE_EXISTS")
}

export function invalid(message: string, details?: unknown): DomainError {
    return new DomainError(400, message, "OPENCODE_RESOURCE_INVALID", details)
}

/** Primeira mensagem de um erro Zod, com o caminho. */
export function zodMessage(issues: readonly { path: PropertyKey[]; message: string }[], prefix: string): string {
    const issue = issues[0]
    if (!issue) return prefix
    const path = issue.path.map(String).join(".")
    return `${prefix}: ${path ? `${path}: ` : ""}${issue.message}`
}
