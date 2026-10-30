import { applyEdits, modify, parse, printParseErrorCode, type JSONPath, type ParseError } from "jsonc-parser"

/**
 * Edição do `opencode.jsonc` preservando comentários e formatação (`jsonc-parser`). O arquivo pode
 * estar no formato do OpenCode 1.x (`mcp.<nome>` com `enabled`, `plugin`, `agent`, `command`) ou no
 * 2.x (`mcp.servers.<nome>` com `disabled`, `plugins`, `agents`, `commands`): cada escrita respeita o
 * formato que o arquivo já usa. Módulo puro.
 */

export class ConfigFormatError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "ConfigFormatError"
    }
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } }

/** Lê o JSONC; erros de sintaxe viram `ConfigFormatError` com linha/coluna. Texto vazio = `{}`. */
export function parseConfigText(text: string): Json {
    if (!text.trim()) return {}
    const errors: ParseError[] = []
    const value: unknown = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
    if (errors.length > 0) {
        const first = errors[0]!
        const before = text.slice(0, first.offset)
        const line = before.split("\n").length
        const column = first.offset - before.lastIndexOf("\n")
        throw new ConfigFormatError(`JSON inválido (${printParseErrorCode(first.error)}) na linha ${line}, coluna ${column}`)
    }
    if (!isObject(value)) throw new ConfigFormatError("A configuração precisa ser um objeto JSON")
    return value
}

/** Grava `value` em `path` (`undefined` remove). Valida o resultado. */
export function writeAt(text: string, path: JSONPath, value: unknown): string {
    const base = text.trim() ? text : "{}\n"
    const next = applyEdits(base, modify(base, path, value, FORMAT))
    parseConfigText(next)
    return next
}

// ── MCP ─────────────────────────────────────────────────────────────────────────────────────────

export type McpStyle = "v1" | "v2"

export function mcpStyle(config: Json): McpStyle {
    const mcp = config.mcp
    if (!isObject(mcp)) return "v2"
    if (isObject(mcp.servers)) return "v2"
    const legacy = Object.entries(mcp).some(([key, value]) => key !== "timeout" && isObject(value) && typeof value.type === "string")
    return legacy ? "v1" : "v2"
}

/** Entrada de MCP normalizada no formato 2.x (`disabled`). */
export interface McpEntry {
    name: string
    config: Json
    disabled: boolean
}

export function listMcpEntries(config: Json): McpEntry[] {
    const mcp = config.mcp
    if (!isObject(mcp)) return []
    const style = mcpStyle(config)
    const servers = style === "v2" ? (isObject(mcp.servers) ? mcp.servers : {}) : Object.fromEntries(Object.entries(mcp).filter(([key, value]) => key !== "timeout" && isObject(value)))
    return Object.entries(servers)
        .filter((entry): entry is [string, Json] => isObject(entry[1]))
        .map(([name, raw]) => {
            const { enabled, ...rest } = raw
            const disabled = style === "v1" ? enabled === false || raw.disabled === true : raw.disabled === true
            return { name, config: { ...rest, disabled }, disabled }
        })
}

function mcpPath(config: Json, name: string): JSONPath {
    return mcpStyle(config) === "v2" ? ["mcp", "servers", name] : ["mcp", name]
}

/** Converte a entrada normalizada (2.x) para o formato do arquivo. */
function toFileShape(style: McpStyle, entry: Json): Json {
    const { disabled, enabled: _enabled, ...rest } = entry
    void _enabled
    if (style === "v1") return { ...rest, enabled: disabled !== true }
    return { ...rest, disabled: disabled === true }
}

/** Grava (ou remove, com `undefined`) um MCP. */
export function setMcpEntry(text: string, name: string, entry: Json | undefined): string {
    const config = parseConfigText(text)
    const style = mcpStyle(config)
    return writeAt(text, mcpPath(config, name), entry === undefined ? undefined : toFileShape(style, entry))
}

/** Liga/desliga um MCP existente sem mexer no resto. */
export function setMcpDisabled(text: string, name: string, disabled: boolean): string {
    const config = parseConfigText(text)
    const style = mcpStyle(config)
    const path = mcpPath(config, name)
    if (style === "v1") return writeAt(text, [...path, "enabled"], !disabled)
    return writeAt(text, [...path, "disabled"], disabled)
}

// ── Plugins ─────────────────────────────────────────────────────────────────────────────────────

export type PluginEntry = string | { package: string; options?: Json }

export function pluginKey(config: Json): "plugins" | "plugin" {
    if (Array.isArray(config.plugins)) return "plugins"
    if (Array.isArray(config.plugin)) return "plugin"
    return "plugins"
}

export function listPluginEntries(config: Json): PluginEntry[] {
    const list = config[pluginKey(config)]
    if (!Array.isArray(list)) return []
    return list.filter((item): item is PluginEntry => typeof item === "string" || (isObject(item) && typeof item.package === "string"))
}

export const pluginSpecOf = (entry: PluginEntry): string => (typeof entry === "string" ? entry : entry.package)

export function setPluginEntries(text: string, entries: readonly PluginEntry[]): string {
    const config = parseConfigText(text)
    return writeAt(text, [pluginKey(config)], [...entries])
}

// ── Agentes e comandos definidos no JSON ───────────────────────────────────────────────────────────

export type ConfigSection = "agents" | "commands"

export function sectionKey(config: Json, section: ConfigSection): string {
    const legacy = section === "agents" ? "agent" : "command"
    if (isObject(config[section])) return section
    if (isObject(config[legacy])) return legacy
    return section
}

export function listSectionEntries(config: Json, section: ConfigSection): Record<string, Json> {
    const value = config[sectionKey(config, section)]
    if (!isObject(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, Json] => isObject(entry[1])))
}

export function setSectionEntry(text: string, section: ConfigSection, name: string, value: Json | undefined): string {
    const config = parseConfigText(text)
    return writeAt(text, [sectionKey(config, section), name], value)
}
