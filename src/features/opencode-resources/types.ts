import type { OpencodeResourceKind } from "./constants"

/** DTOs dos recursos do OpenCode (sem segredos). */

export interface OpencodeScopeDto {
    /** `global` ou `central:<id>`. */
    id: string
    label: string
    /** Diretório do projeto no host (`null` no global). */
    directory: string | null
}

export type ResourceOrigin = "builtin" | "file" | "config" | "package" | "local"

export interface ResourceVersionDto {
    installed: string | null
    available: string | null
    outdated: boolean
}

export type McpRuntimeStatus = "connected" | "pending" | "disabled" | "failed" | "needs_auth" | "unknown"

export interface OpencodeResourceDto {
    id: string
    kind: OpencodeResourceKind
    name: string
    description: string | null
    scope: string
    scopeLabel: string
    origin: ResourceOrigin
    /** Repositório/pacote de onde veio (skills instaladas, plugins, MCPs de pacote). */
    source: string | null
    /** Arquivo/pasta no host (itens em arquivo). */
    path: string | null
    enabled: boolean
    /** Nativo do OpenCode (só leitura). */
    builtin: boolean
    editable: boolean
    removable: boolean
    version: ResourceVersionDto | null
    /** MCP: situação da conexão e erro. */
    status?: { state: McpRuntimeStatus; error: string | null }
    /** Detalhes curtos (ex.: modo do agente, recursos do plugin). */
    tags: string[]
}

export interface McpDetailDto {
    type: "local" | "remote"
    command: string[] | null
    url: string | null
    cwd: string | null
    disabled: boolean
    timeout: { startup?: number; catalog?: number; execution?: number } | null
    /** Só os NOMES (o valor nunca sai do servidor). */
    environmentKeys: string[]
    headerKeys: string[]
}

export interface OpencodeResourceDetailDto extends OpencodeResourceDto {
    format: "markdown" | "json" | "mcp" | "plugin"
    frontmatter: Record<string, unknown> | null
    body: string | null
    config: Record<string, unknown> | null
    mcp: McpDetailDto | null
    /** Outros arquivos da pasta da skill (somente leitura). */
    files: string[]
}

export interface ResourceMutationResultDto {
    id: string
    backupId: string | null
    /** Plugins: só valem depois de reiniciar o serviço. */
    restartRequired: boolean
}

export interface ResourceUpdateManyResultDto {
    updated: { id: string; name: string }[]
    backupId: string | null
    restartRequired: boolean
}

export interface McpTestResultDto {
    status: McpRuntimeStatus
    error: string | null
    tools: { name: string; description: string | null }[]
    toolsError: string | null
    durationMs: number
}

export interface OpencodeBackupDto {
    id: string
    createdAt: string
    action: string
    label: string
    paths: string[]
    size: number | null
}
