/** Versões instaladas x disponíveis (npm, GitHub) — módulo puro. */

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export interface Semver {
    major: number
    minor: number
    patch: number
    pre: string | null
}

export function parseSemver(value: string | null | undefined): Semver | null {
    const match = SEMVER.exec((value ?? "").trim())
    if (!match) return null
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ?? null }
}

/** Negativo se `a < b`, positivo se `a > b`. Inválidas ficam por último. */
export function compareSemver(a: string, b: string): number {
    const x = parseSemver(a)
    const y = parseSemver(b)
    if (!x || !y) return x ? 1 : y ? -1 : 0
    if (x.major !== y.major) return x.major - y.major
    if (x.minor !== y.minor) return x.minor - y.minor
    if (x.patch !== y.patch) return x.patch - y.patch
    if (x.pre === y.pre) return 0
    if (!x.pre) return 1
    if (!y.pre) return -1
    return x.pre.localeCompare(y.pre, "en", { numeric: true })
}

/** Maior versão estável (sem pré-lançamento), opcionalmente limitada a uma major. */
export function latestStable(versions: readonly string[], major?: number): string | null {
    const stable = versions.filter((version) => {
        const parsed = parseSemver(version)
        return parsed && !parsed.pre && (major === undefined || parsed.major === major)
    })
    return stable.sort(compareSemver).at(-1) ?? null
}

export const isNewer = (candidate: string | null, current: string | null) => Boolean(candidate && current && parseSemver(candidate) && parseSemver(current) && compareSemver(candidate, current) > 0)

/** Especificador npm: `nome`, `nome@versão`, `@escopo/nome@tag`. `null` para `github:`/URL/caminho. */
export function parseNpmSpec(spec: string): { name: string; range: string | null } | null {
    const value = spec.trim()
    if (!value || /^(github:|git\+|https?:|file:|\.|\/)/.test(value) || /^[^@/]+\/[^/]+$/.test(value)) return null
    const at = value.lastIndexOf("@")
    if (at > 0) return { name: value.slice(0, at), range: value.slice(at + 1) || null }
    return { name: value, range: null }
}

const RUNNERS = new Set(["npx", "bunx", "pnpx", "pnpm", "bun", "yarn"])

/** Pacote npm executado por um MCP local (`npx -y pacote@versão ...`). */
export function mcpPackageOf(command: readonly string[]): { index: number; name: string; range: string | null } | null {
    const bin = command[0]?.split("/").at(-1) ?? ""
    if (!RUNNERS.has(bin)) return null
    for (let index = 1; index < command.length; index++) {
        const arg = command[index]!
        if (arg.startsWith("-") || arg === "dlx" || arg === "x" || arg === "exec") continue
        const spec = parseNpmSpec(arg)
        return spec ? { index, ...spec } : null
    }
    return null
}

/** Fixa a versão do pacote no comando do MCP. */
export function pinMcpPackage(command: readonly string[], version: string): string[] {
    const pkg = mcpPackageOf(command)
    if (!pkg) return [...command]
    const next = [...command]
    next[pkg.index] = `${pkg.name}@${version}`
    return next
}

/** Versão exata (não range/tag). */
export const isExactVersion = (range: string | null) => Boolean(range && parseSemver(range))

/** Nome de MCP derivado do pacote (`@org/server-foo` → `server-foo`). */
export function mcpNameFromSource(source: string): string {
    let base = source.trim().replace(/^github:/, "").replace(/#.*$/, "")
    const at = base.indexOf("@", base.startsWith("@") ? 1 : 0)
    if (at > 0) base = base.slice(0, at)
    const last = base.split("/").at(-1) ?? base
    return last.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-._]+|-+$/g, "").slice(0, 64) || "mcp"
}

/** Comando de um MCP instalado de pacote npm ou repositório. */
export function mcpCommandForSource(source: string, version: string | null): string[] {
    if (source.startsWith("github:")) return ["npx", "-y", source]
    const spec = parseNpmSpec(source)
    if (!spec) return ["npx", "-y", source]
    return ["npx", "-y", version ? `${spec.name}@${version}` : source]
}
