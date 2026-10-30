import { DomainError } from "@/lib/api/route"
import { ConfigFormatError, parseConfigText } from "../jsonc-edit"
import { manifestPath, parseManifest, serializeManifest, type DisabledManifest } from "../disabled-manifest"
import { scopePaths, type ScopePaths } from "../paths"
import type { OpencodeScopeDto } from "../types"
import { createBackup } from "./backups"
import { openHost, type OpencodeHost } from "./host"
import { resolveScope } from "./scopes"

/** Contexto de uma operação num escopo: host, caminhos, arquivo de configuração, manifesto e backup. */

export interface ScopeContext {
    host: OpencodeHost
    scope: OpencodeScopeDto
    paths: ScopePaths
    /** `location` das chamadas à API do OpenCode (projeto; global = diretório da integração). */
    location: { directory: string } | undefined
    /** Arquivo de configuração do escopo (o primeiro que existir; senão o preferido, vazio). */
    configFile(): Promise<{ path: string; text: string; exists: boolean }>
    readConfig(): Promise<Record<string, unknown>>
    manifest(): Promise<DisabledManifest>
    saveManifest(manifest: DisabledManifest): Promise<void>
    /** Backup antes de alterar (id guardado em `lastBackupId`). */
    backup(action: string, label: string, paths: readonly string[]): Promise<string>
    lastBackupId: string | null
}

export function configError(error: unknown): never {
    if (error instanceof ConfigFormatError) throw new DomainError(422, `Configuração do OpenCode inválida: ${error.message}. Corrija o arquivo ou restaure um backup`, "OPENCODE_CONFIG_INVALID")
    throw error
}

export async function openScope(scopeId: string, host?: OpencodeHost): Promise<ScopeContext> {
    const [scope, resolvedHost] = await Promise.all([resolveScope(scopeId), host ? Promise.resolve(host) : openHost()])
    const paths = scopePaths(resolvedHost.home, scope.id, scope.directory)
    let config: { path: string; text: string; exists: boolean } | null = null
    const ctx: ScopeContext = {
        host: resolvedHost,
        scope,
        paths,
        location: scope.directory ? { directory: scope.directory } : resolvedHost.defaultDirectory ? { directory: resolvedHost.defaultDirectory } : undefined,
        async configFile() {
            if (config) return config
            for (const path of paths.configFiles) {
                const text = await resolvedHost.readText(path)
                if (text !== null) return (config = { path, text, exists: true })
            }
            return (config = { path: paths.configFiles[0]!, text: "", exists: false })
        },
        async readConfig() {
            const { text } = await ctx.configFile()
            try {
                return parseConfigText(text)
            } catch (error) {
                return configError(error)
            }
        },
        async manifest() {
            return parseManifest(await resolvedHost.readText(manifestPath(resolvedHost.home)))
        },
        async saveManifest(manifest) {
            await resolvedHost.writeText(manifestPath(resolvedHost.home), serializeManifest(manifest))
        },
        async backup(action, label, list) {
            const id = await createBackup(resolvedHost, { action, label, paths: list })
            ctx.lastBackupId = id
            return id
        },
        lastBackupId: null,
    }
    return ctx
}

/** Grava o arquivo de configuração do escopo e invalida o cache do contexto. */
export async function writeConfig(ctx: ScopeContext, text: string): Promise<void> {
    const file = await ctx.configFile()
    await ctx.host.writeText(file.path, text)
    file.text = text
    file.exists = true
}
