import { randomBytes } from "node:crypto"
import { mcpToolsCommand, parseMcpToolsOutput, removeCommand } from "../commands"
import { MCP_TEST_TIMEOUT_MS } from "../constants"
import { ConfigFormatError, listMcpEntries, setMcpDisabled, setMcpEntry, type McpEntry } from "../jsonc-edit"
import { buildMcpEntry, inspectorConfig, mcpDetailOf, withSecrets } from "../mcp-entry"
import { mcpConfigSchema, type McpSecretsInput, type ResourceContentInput } from "../schemas"
import type { McpRuntimeStatus, McpTestResultDto, OpencodeResourceDetailDto, OpencodeResourceDto } from "../types"
import { isExactVersion, isNewer, mcpCommandForSource, mcpNameFromSource, mcpPackageOf, parseNpmSpec, pinMcpPackage } from "../versions"
import { configError, writeConfig, type ScopeContext } from "./context"
import { alreadyExists, baseDto, invalid, notFound, zodMessage, type KindHandler } from "./handler"
import { npmAvailable } from "./versions"

/**
 * MCPs: `mcp.servers.<nome>` (ou `mcp.<nome>`, formato 1.x) do JSON da configuração do escopo. Ligar/
 * desligar usa o próprio `disabled`/`enabled` do OpenCode. Valores de `environment`/`headers` são
 * segredos: nunca saem do servidor (o DTO só traz os nomes).
 */

type Json = Record<string, unknown>

async function entries(ctx: ScopeContext): Promise<McpEntry[]> {
    return listMcpEntries(await ctx.readConfig())
}

async function entryOf(ctx: ScopeContext, name: string): Promise<McpEntry> {
    const entry = (await entries(ctx)).find((item) => item.name === name)
    if (!entry) throw notFound("mcp", name)
    return entry
}

async function runtimeStatus(ctx: ScopeContext): Promise<Map<string, { state: McpRuntimeStatus; error: string | null }>> {
    const servers = await ctx.host.client.mcp.list({ location: ctx.location }).then((result) => result.data).catch(() => [])
    return new Map(servers.map((server) => [server.name, { state: server.status.status as McpRuntimeStatus, error: "error" in server.status ? server.status.error : null }]))
}

async function versionOf(entry: Json, refresh?: boolean): Promise<OpencodeResourceDto["version"]> {
    const command = Array.isArray(entry.command) ? entry.command.map(String) : []
    const pkg = mcpPackageOf(command)
    if (!pkg) return null
    const available = await npmAvailable(pkg.name, isExactVersion(pkg.range) ? null : pkg.range, refresh)
    const installed = isExactVersion(pkg.range) ? pkg.range : null
    return { installed, available, outdated: isNewer(available, installed) }
}

async function list(ctx: ScopeContext, options: { refresh?: boolean }): Promise<OpencodeResourceDto[]> {
    const [items, status] = await Promise.all([entries(ctx), runtimeStatus(ctx)])
    return Promise.all(
        items.map(async (item) => {
            const detail = mcpDetailOf(item.config)
            const version = await versionOf(item.config, options.refresh)
            const pkg = detail.command ? mcpPackageOf(detail.command) : null
            return baseDto(ctx, "mcp", item.name, {
                description: detail.type === "remote" ? detail.url : (detail.command ?? []).join(" "),
                origin: pkg ? "package" : "config",
                source: pkg?.name ?? null,
                path: null,
                enabled: !item.disabled,
                builtin: false,
                editable: true,
                removable: true,
                version,
                status: item.disabled ? { state: "disabled", error: null } : (status.get(item.name) ?? { state: "unknown", error: null }),
                tags: [detail.type === "remote" ? "remoto" : "local", ...(version && !version.installed ? ["acompanha a última versão"] : [])],
            })
        }),
    )
}

async function get(ctx: ScopeContext, name: string): Promise<OpencodeResourceDetailDto> {
    const item = (await list(ctx, {})).find((entry) => entry.name === name)
    if (!item) throw notFound("mcp", name)
    const entry = await entryOf(ctx, name)
    return { ...item, format: "mcp", frontmatter: null, body: null, config: null, mcp: mcpDetailOf(entry.config), files: [] }
}

async function save(ctx: ScopeContext, name: string, entry: Json | undefined) {
    const file = await ctx.configFile()
    try {
        await writeConfig(ctx, setMcpEntry(file.text, name, entry))
    } catch (error) {
        if (error instanceof ConfigFormatError) configError(error)
        throw error
    }
}

function parseInput(content: ResourceContentInput) {
    const parsed = mcpConfigSchema.safeParse(content.mcp)
    if (!parsed.success) throw invalid(zodMessage(parsed.error.issues, "Configuração do MCP inválida"), parsed.error.issues)
    return parsed.data
}

async function create(ctx: ScopeContext, name: string, content: ResourceContentInput) {
    const input = parseInput(content)
    if ((await entries(ctx)).some((item) => item.name === name)) throw alreadyExists(name)
    const file = await ctx.configFile()
    await ctx.backup("criar", `Adicionar o MCP ${name}`, [file.path])
    await save(ctx, name, buildMcpEntry(input, undefined, content.secrets, "replace"))
    return {}
}

async function update(ctx: ScopeContext, name: string, content: ResourceContentInput) {
    const input = parseInput(content)
    const current = await entryOf(ctx, name)
    const file = await ctx.configFile()
    await ctx.backup("editar", `Editar o MCP ${name}`, [file.path])
    await save(ctx, name, buildMcpEntry(input, current.config, content.secrets, "replace"))
    return {}
}

async function remove(ctx: ScopeContext, name: string) {
    await entryOf(ctx, name)
    const file = await ctx.configFile()
    await ctx.backup("excluir", `Remover o MCP ${name}`, [file.path])
    await save(ctx, name, undefined)
    return {}
}

async function setEnabled(ctx: ScopeContext, name: string, enabled: boolean) {
    const current = await entryOf(ctx, name)
    if (current.disabled === !enabled) return {}
    const file = await ctx.configFile()
    await ctx.backup(enabled ? "ligar" : "desligar", `${enabled ? "Ligar" : "Desligar"} o MCP ${name}`, [file.path])
    try {
        await writeConfig(ctx, setMcpDisabled(file.text, name, !enabled))
    } catch (error) {
        if (error instanceof ConfigFormatError) configError(error)
        throw error
    }
    return {}
}

async function install(ctx: ScopeContext, input: { source: string; name?: string; secrets?: McpSecretsInput }) {
    const name = input.name ?? mcpNameFromSource(input.source)
    if ((await entries(ctx)).some((item) => item.name === name)) throw alreadyExists(name)
    const npm = parseNpmSpec(input.source)
    const version = npm && !isExactVersion(npm.range) ? await npmAvailable(npm.name, npm.range) : null
    const command = mcpCommandForSource(input.source, version)
    const file = await ctx.configFile()
    await ctx.backup("instalar", `Instalar o MCP ${name} (${input.source})`, [file.path])
    await save(ctx, name, buildMcpEntry({ type: "local", command }, undefined, input.secrets, "replace"))
    return { names: [name] }
}

async function updateVersions(ctx: ScopeContext, items: readonly OpencodeResourceDto[]) {
    const targets = items.filter((item) => item.enabled && item.version?.outdated && item.version.available)
    if (targets.length === 0) return { names: [] }
    const file = await ctx.configFile()
    await ctx.backup("atualizar", `Atualizar MCPs: ${targets.map((item) => item.name).join(", ")}`, [file.path])
    let text = file.text
    const all = await entries(ctx)
    for (const target of targets) {
        const entry = all.find((item) => item.name === target.name)
        if (!entry || !Array.isArray(entry.config.command)) continue
        text = setMcpEntry(text, target.name, { ...entry.config, command: pinMcpPackage(entry.config.command.map(String), target.version!.available!) })
    }
    await writeConfig(ctx, text)
    return { names: targets.map((item) => item.name) }
}

/** Grava só os segredos (variáveis/cabeçalhos) — `null` remove; as demais chaves ficam. */
export async function setMcpSecrets(ctx: ScopeContext, name: string, secrets: McpSecretsInput) {
    const current = await entryOf(ctx, name)
    const file = await ctx.configFile()
    await ctx.backup("editar", `Alterar segredos do MCP ${name}`, [file.path])
    await save(ctx, name, withSecrets(current.config, secrets))
    return {}
}

/** Reconecta o MCP, devolve a situação e lista as ferramentas expostas (inspector no host). */
export async function testMcp(ctx: ScopeContext, name: string): Promise<McpTestResultDto> {
    const started = Date.now()
    const entry = await entryOf(ctx, name)
    const client = ctx.host.client
    if (!entry.disabled) {
        await client.mcp.disconnect({ server: name, location: ctx.location }).catch(() => undefined)
        await client.mcp.connect({ server: name, location: ctx.location }).catch(() => undefined)
    }
    const status = entry.disabled ? { state: "disabled" as const, error: null } : ((await runtimeStatus(ctx)).get(name) ?? { state: "unknown" as const, error: null })
    let tools: McpTestResultDto["tools"] = []
    let toolsError: string | null = null
    const file = `${ctx.host.home}/.cache/opex/mcp-test-${randomBytes(6).toString("hex")}.json`
    try {
        await ctx.host.writeText(file, JSON.stringify(inspectorConfig(name, entry.config)))
        const result = await ctx.host.run(mcpToolsCommand(file, name), MCP_TEST_TIMEOUT_MS, { redactedAs: `(listando as ferramentas do MCP ${name} pelo inspector)` })
        const parsed = parseMcpToolsOutput(result.output)
        if (result.exitCode === 0 && parsed) tools = parsed
        else toolsError = (result.output.trim().split("\n").filter(Boolean).at(-1) ?? "O inspector não respondeu").slice(0, 400)
    } catch (error) {
        toolsError = error instanceof Error ? error.message : String(error)
        await ctx.host.run(removeCommand(file), 10_000, { quiet: true }).catch(() => undefined)
    }
    return { status: status.state, error: status.error, tools, toolsError, durationMs: Date.now() - started }
}

export const mcpHandler: KindHandler = { list, get, create, update, remove, setEnabled, install, updateVersions }
