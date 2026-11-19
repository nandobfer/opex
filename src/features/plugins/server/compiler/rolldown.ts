import { createHash } from "node:crypto"
import type { PluginManifest, PluginSourceFile } from "../../manifest"
import { isNodeBuiltin, isSharedModule, isUnknownSharedModule, sharedMarker } from "../../shared-modules"
import { compilePluginCss } from "./tailwind"
import { compilerUnavailable, isCompilerUnavailable } from "./unavailable"
import { createVirtualFs } from "./virtual-fs"

/**
 * Compilação das versões de plugin com o Rolldown (OPE-172; decisão do dono: Rolldown no lugar do
 * esbuild, formato alinhado ao Vite). Fontes virtuais (sem disco), transform do Oxc para TS/JSX e
 * saída ESM:
 *  - cliente: as bibliotecas do shell (`shared-modules.ts`) ficam EXTERNAS, reescritas para
 *    `opex-shared:<id>`; o carregador do navegador troca o marcador pela instância única do shell;
 *  - servidor (só escopo do dono): tudo empacotado, só `node:*` externo; `@opex/plugin-sdk/server`
 *    é um módulo virtual (`definePlugin`), porque o artefato é importado fora do bundler do Next.
 * Dependência npm não é permitida na v1 (não há instalação): o erro lista o especificador.
 */

export interface CompiledArtifact {
    code: string
    hash: string
    css: string | null
    cssHash: string | null
}

export type CompileResult =
    | { ok: true; server: CompiledArtifact | null; client: CompiledArtifact | null; log: string }
    | { ok: false; errors: string[]; log: string }

const SDK_SERVER_SOURCE = "export const definePlugin = (plugin) => plugin\n"
const SDK_SERVER_ID = "\0opex-sdk-server"

export const contentHash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16)

class CompileIssues {
    readonly list: string[] = []
    add(message: string) {
        if (!this.list.includes(message)) this.list.push(message)
    }
}

async function bundle(target: "client" | "server", entry: string, files: PluginSourceFile[], issues: CompileIssues): Promise<string | null> {
    const { rolldown } = await import("rolldown").catch((error: unknown) => {
        throw compilerUnavailable("Rolldown", error)
    })
    const vfs = createVirtualFs(files)
    let build: Awaited<ReturnType<typeof rolldown>> | null = null
    try {
        build = await rolldown({
            input: entry,
            platform: target === "server" ? "node" : "browser",
            logLevel: "silent",
            transform: { jsx: { runtime: "automatic" } },
            plugins: [
                {
                    name: "opex-plugin-vfs",
                    resolveId(specifier, importer) {
                        if (specifier === entry && !importer) return entry
                        if (vfs.isRelative(specifier)) {
                            const resolved = vfs.resolve(specifier, importer)
                            if (resolved) return resolved
                            issues.add(`Arquivo não encontrado: ${specifier}${importer ? ` (importado por ${importer})` : ""}`)
                            return { id: specifier, external: true }
                        }
                        if (target === "server") {
                            if (specifier === "@opex/plugin-sdk/server") return SDK_SERVER_ID
                            if (isNodeBuiltin(specifier)) return { id: specifier, external: true }
                            issues.add(`Import não permitido no servidor do plugin: "${specifier}" (use node:* ou os serviços do ctx)`)
                            return { id: specifier, external: true }
                        }
                        if (isSharedModule(specifier)) return { id: specifier, external: true }
                        if (isUnknownSharedModule(specifier)) issues.add(`Módulo do Opex inexistente: "${specifier}"`)
                        else issues.add(`Dependência não permitida no plugin: "${specifier}" (use os módulos compartilhados do Opex)`)
                        return { id: specifier, external: true }
                    },
                    load(id) {
                        if (id === SDK_SERVER_ID) return SDK_SERVER_SOURCE
                        return vfs.read(id)
                    },
                },
            ],
        })
        const { output } = await build.generate({
            format: "esm",
            paths: target === "client" ? (id: string) => (isSharedModule(id) ? sharedMarker(id) : id) : undefined,
            codeSplitting: false,
        })
        return output[0]?.type === "chunk" ? output[0].code : null
    } catch (error) {
        issues.add(formatRolldownError(error))
        return null
    } finally {
        await build?.close().catch(() => undefined)
    }
}

/** Mensagem curta (pt-BR + o texto do Rolldown) de um erro de compilação. */
export function formatRolldownError(error: unknown): string {
    const errors = (error as { errors?: Array<{ message?: string }> }).errors
    if (Array.isArray(errors) && errors.length) return errors.map((item) => `Erro de compilação: ${item.message ?? String(item)}`).join("\n")
    return `Erro de compilação: ${error instanceof Error ? error.message : String(error)}`
}

export async function compilePluginSources(files: PluginSourceFile[], manifest: PluginManifest): Promise<CompileResult> {
    const issues = new CompileIssues()
    const log: string[] = []
    let server: CompiledArtifact | null = null
    let client: CompiledArtifact | null = null

    if (manifest.entries.server && manifest.scope === "owner") {
        const code = await bundle("server", manifest.entries.server, files, issues)
        if (code) {
            server = { code, hash: contentHash(code), css: null, cssHash: null }
            log.push(`Servidor: ${code.length} bytes (${server.hash})`)
        }
    }
    if (manifest.entries.client) {
        const code = await bundle("client", manifest.entries.client, files, issues)
        if (code) {
            let css: string | null = null
            try {
                css = await compilePluginCss(files)
            } catch (error) {
                if (isCompilerUnavailable(error)) throw error
                issues.add(`Falha ao gerar o CSS do plugin: ${error instanceof Error ? error.message : String(error)}`)
            }
            client = { code, hash: contentHash(code), css, cssHash: css ? contentHash(css) : null }
            log.push(`Cliente: ${code.length} bytes (${client.hash})${css ? `, CSS ${css.length} bytes` : ""}`)
        }
    }
    if (issues.list.length) return { ok: false, errors: issues.list, log: [...log, ...issues.list].join("\n") }
    return { ok: true, server, client, log: log.join("\n") }
}
