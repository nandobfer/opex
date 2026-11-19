import { z } from "zod"
import {
    PLUGIN_API_VERSION,
    PLUGIN_ENVIRONMENT_FILES,
    PLUGIN_ID_PATTERN,
    PLUGIN_IGNORED_PREFIXES,
    PLUGIN_MAX_FILE_BYTES,
    PLUGIN_MAX_FILES,
    PLUGIN_MAX_TOTAL_BYTES,
    PLUGIN_NAME_PATTERN,
    PLUGIN_ROUTE_METHODS,
    PLUGIN_SCOPES,
    PLUGIN_SERVICES,
    PLUGIN_SLOTS,
    PLUGIN_SLOTS_BY_SCOPE,
    isPluginNavSlot,
    type PluginScope,
} from "./constants"

/**
 * Manifesto do plugin (`plugin.json` na raiz das fontes). Módulo PURO.
 *
 * O manifesto é o contrato: o kernel recusa registrar rota, ferramenta ou cron não declarados aqui,
 * e o carregador do navegador só monta os slots e páginas listados.
 */

export const PLUGIN_MANIFEST_FILE = "plugin.json"

const pagePath = z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/, "Caminho de página inválido (use minúsculas, números, - e /)")
const exportName = z.string().trim().regex(/^[A-Za-z_$][\w$]*$/, "Nome de exportação inválido")
const pluginName = z.string().trim().regex(PLUGIN_NAME_PATTERN, "Use minúsculas, números e _ (2 a 40 caracteres, começando por letra)")

export const pluginManifestSchema = z.object({
    id: z.string().trim().regex(PLUGIN_ID_PATTERN, "Id do plugin inválido (minúsculas, números e -, 2 a 40 caracteres)"),
    name: z.string().trim().min(1, "Informe o nome do plugin").max(80),
    description: z.string().trim().max(500).default(""),
    apiVersion: z.string().trim().regex(/^\d+\.\d+$/, "apiVersion deve ter o formato MAJOR.MINOR (ex.: 1.0)"),
    scope: z.enum(PLUGIN_SCOPES),
    entries: z
        .object({
            server: z.string().trim().min(1).optional(),
            client: z.string().trim().min(1).optional(),
        })
        .default({}),
    slots: z
        .array(
            z.object({
                slot: z.enum(PLUGIN_SLOTS),
                export: exportName,
                title: z.string().trim().max(80).optional(),
                order: z.number().int().min(0).max(1000).default(100),
            }),
        )
        .default([]),
    pages: z.array(z.object({ path: pagePath, title: z.string().trim().min(1).max(80), export: exportName })).default([]),
    nav: z.array(z.object({ label: z.string().trim().min(1).max(40), page: pagePath, icon: z.string().trim().min(1).max(60).default("Puzzle") })).default([]),
    routes: z.array(z.object({ method: z.enum(PLUGIN_ROUTE_METHODS), path: z.string().trim().regex(/^\/[A-Za-z0-9\-_/:]*$/, "Rota inválida (ex.: /itens/:id)") })).default([]),
    tools: z.array(pluginName).default([]),
    crons: z.array(pluginName).default([]),
    services: z.array(z.enum(PLUGIN_SERVICES)).default([]),
})

export type PluginManifest = z.infer<typeof pluginManifestSchema>
export type PluginManifestInput = z.input<typeof pluginManifestSchema>

export interface PluginSourceFile {
    path: string
    content: string
}

export const pluginSourceFileSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .regex(/^(?!\/)(?!.*\.\.)[\w\-./@]+$/, "Caminho de arquivo inválido"),
    content: z.string().max(PLUGIN_MAX_FILE_BYTES, "Arquivo maior que o limite de 256 KB"),
})

/** Remove os arquivos do ambiente local (node_modules, SDK exportado, git) e normaliza os caminhos. */
export function normalizePluginFiles(files: PluginSourceFile[]): PluginSourceFile[] {
    const byPath = new Map<string, string>()
    for (const file of files) {
        const path = file.path.replace(/^\.\//, "").trim()
        if (!path || PLUGIN_IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix) || path === prefix.slice(0, -1))) continue
        if ((PLUGIN_ENVIRONMENT_FILES as readonly string[]).includes(path)) continue
        byPath.set(path, file.content)
    }
    return [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => ({ path, content }))
}

/** Arquivos de teste do plugin (Vitest). */
export const isPluginTestFile = (path: string) => /\.test\.(ts|tsx)$/.test(path)

export type ManifestParseResult = { ok: true; manifest: PluginManifest } | { ok: false; issues: string[] }

/** Lê e valida o `plugin.json` das fontes, com as regras por escopo (`pluginManifestIssues`). */
export function parsePluginManifest(files: PluginSourceFile[]): ManifestParseResult {
    const file = files.find((candidate) => candidate.path === PLUGIN_MANIFEST_FILE)
    if (!file) return { ok: false, issues: [`Arquivo ${PLUGIN_MANIFEST_FILE} não encontrado na raiz do plugin`] }
    let raw: unknown
    try {
        raw = JSON.parse(file.content)
    } catch {
        return { ok: false, issues: [`${PLUGIN_MANIFEST_FILE} não é um JSON válido`] }
    }
    const parsed = pluginManifestSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || PLUGIN_MANIFEST_FILE}: ${issue.message}`) }
    const issues = pluginManifestIssues(parsed.data, files)
    return issues.length ? { ok: false, issues } : { ok: true, manifest: parsed.data }
}

/**
 * Regras do manifesto que dependem do escopo e das fontes. Plugin de cliente é SÓ interface: sem
 * entrada de servidor, rotas, crons, ferramentas, serviços nem pasta `server/`.
 */
export function pluginManifestIssues(manifest: PluginManifest, files: PluginSourceFile[]): string[] {
    const issues: string[] = []
    const paths = new Set(files.map((file) => file.path))
    const totalBytes = files.reduce((sum, file) => sum + file.content.length, 0)
    if (files.length > PLUGIN_MAX_FILES) issues.push(`O plugin tem ${files.length} arquivos (máximo ${PLUGIN_MAX_FILES})`)
    if (totalBytes > PLUGIN_MAX_TOTAL_BYTES) issues.push("As fontes passam do limite de 2 MB")
    // Cada arquivo: caminho no padrão e até 256 KB (o mesmo schema das fontes).
    for (const file of files) {
        const checked = pluginSourceFileSchema.safeParse(file)
        if (!checked.success) issues.push(`${file.path}: ${[...new Set(checked.error.issues.map((issue) => issue.message))].join("; ")}`)
    }

    if (manifest.scope === "client") {
        const forbidden: string[] = []
        if (manifest.entries.server) forbidden.push("entries.server")
        if (manifest.routes.length) forbidden.push("routes")
        if (manifest.crons.length) forbidden.push("crons")
        if (manifest.tools.length) forbidden.push("tools")
        if (manifest.services.length) forbidden.push("services")
        if ([...paths].some((path) => path.startsWith("server/"))) forbidden.push("pasta server/")
        if (forbidden.length) issues.push(`Plugin de cliente é só interface; remova: ${forbidden.join(", ")}`)
    }

    const allowedSlots = PLUGIN_SLOTS_BY_SCOPE[manifest.scope]
    for (const slot of manifest.slots) {
        if (!allowedSlots.includes(slot.slot)) issues.push(`O slot "${slot.slot}" não existe no escopo ${manifest.scope === "owner" ? "do dono" : "do cliente"} (válidos: ${allowedSlots.filter((s) => !isPluginNavSlot(s)).join(", ")})`)
        if (isPluginNavSlot(slot.slot)) issues.push(`Use a lista "nav" do manifesto para o menu (${slot.slot}), não um slot`)
    }

    const uiDeclared = manifest.slots.length > 0 || manifest.pages.length > 0
    if (uiDeclared && !manifest.entries.client) issues.push("Slots e páginas exigem entries.client")
    if (!manifest.entries.client && !manifest.entries.server) issues.push("Declare ao menos uma entrada (entries.client ou entries.server)")
    if (manifest.entries.client && !paths.has(manifest.entries.client)) issues.push(`Entrada do cliente não encontrada: ${manifest.entries.client}`)
    if (manifest.entries.server && !paths.has(manifest.entries.server)) issues.push(`Entrada do servidor não encontrada: ${manifest.entries.server}`)
    if (!manifest.entries.server && (manifest.routes.length || manifest.tools.length || manifest.crons.length)) issues.push("Rotas, ferramentas e crons exigem entries.server")

    const pages = new Set(manifest.pages.map((page) => page.path))
    if (pages.size !== manifest.pages.length) issues.push("Há páginas com o mesmo caminho")
    for (const item of manifest.nav) if (!pages.has(item.page)) issues.push(`O item de menu "${item.label}" aponta para a página inexistente "${item.page}"`)
    const duplicated = (list: string[]) => list.filter((value, index) => list.indexOf(value) !== index)
    for (const name of duplicated(manifest.tools)) issues.push(`Ferramenta declarada duas vezes: ${name}`)
    for (const name of duplicated(manifest.crons)) issues.push(`Cron declarado duas vezes: ${name}`)
    for (const route of duplicated(manifest.routes.map((r) => `${r.method} ${r.path}`))) issues.push(`Rota declarada duas vezes: ${route}`)

    const compat = checkPluginApiVersion(manifest.apiVersion)
    if (!compat.ok) issues.push(compat.message)
    return issues
}

export type ApiVersionCheck = { ok: true; warning: string | null } | { ok: false; message: string }

/** Compatibilidade do plugin com o SDK do núcleo: major diferente recusa; minor maior avisa. */
export function checkPluginApiVersion(pluginVersion: string, kernelVersion: string = PLUGIN_API_VERSION): ApiVersionCheck {
    const [pMajor, pMinor] = pluginVersion.split(".").map(Number)
    const [kMajor, kMinor] = kernelVersion.split(".").map(Number)
    if (!Number.isInteger(pMajor) || !Number.isInteger(pMinor)) return { ok: false, message: `apiVersion inválida: ${pluginVersion}` }
    if (pMajor !== kMajor) return { ok: false, message: `Plugin incompatível com a versão do núcleo (plugin ${pluginVersion}, núcleo ${kernelVersion})` }
    if (pMinor > kMinor) return { ok: true, warning: `O plugin pede o SDK ${pluginVersion}, mais novo que o do núcleo (${kernelVersion}); recursos novos podem faltar` }
    return { ok: true, warning: null }
}

/** O escopo do manifesto bate com o do plugin cadastrado. */
export function manifestScopeIssue(manifest: PluginManifest, expected: { id: string; scope: PluginScope }): string | null {
    if (manifest.id !== expected.id) return `O id do manifesto (${manifest.id}) difere do plugin (${expected.id})`
    if (manifest.scope !== expected.scope) return `O escopo do manifesto (${manifest.scope}) difere do plugin (${expected.scope})`
    return null
}
