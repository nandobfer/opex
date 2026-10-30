/**
 * Comandos de shell executados no host do OpenCode (pelo `shell` da API dele) para os recursos.
 * Funções puras: todo valor variável passa por `quote` — nunca texto livre do usuário ou do modelo.
 */

export const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

const dirname = (path: string) => path.replace(/\/+$/, "").replace(/\/[^/]*$/, "") || "/"

export const homeCommand = () => `printf '%s' "$HOME"`

/** Caminhos dos arquivos `.md` (sem subpastas) de cada diretório que existir, um por linha. */
export function listMarkdownFilesCommand(dirs: readonly string[]): string {
    return `for d in ${dirs.map(quote).join(" ")}; do [ -d "$d" ] || continue; find "$d" -maxdepth 1 -type f -name '*.md' 2>/dev/null; done; true`
}

/** Pastas de skill (com `SKILL.md`) em cada raiz que existir, uma por linha. */
export function listSkillDirsCommand(roots: readonly string[]): string {
    return `for d in ${roots.map(quote).join(" ")}; do [ -d "$d" ] || continue; find -L "$d" -mindepth 2 -maxdepth 2 -type f -name SKILL.md 2>/dev/null; done; true`
}

/** Outros arquivos da pasta de uma skill (até 100). */
export function listSkillFilesCommand(dir: string): string {
    return `cd ${quote(dir)} 2>/dev/null && find -L . -type f ! -name SKILL.md 2>/dev/null | sed 's|^\\./||' | sort | head -n 100; true`
}

/** Move `from` para `to` (falha se o destino já existir). */
export function moveCommand(from: string, to: string): string {
    return `[ -e ${quote(from)} ] || [ -L ${quote(from)} ] || { echo 'origem inexistente' >&2; exit 3; }; [ ! -e ${quote(to)} ] || { echo 'destino já existe' >&2; exit 4; }; mkdir -p ${quote(dirname(to))} && mv ${quote(from)} ${quote(to)}`
}

export function removeCommand(path: string): string {
    return `rm -rf -- ${quote(path)}`
}

/** Backup: `tar.gz` com caminhos absolutos só dos que existem (vazio quando nenhum existe). */
export function backupCommand(archive: string, paths: readonly string[]): string {
    const list = paths.map(quote).join(" ")
    return `mkdir -p ${quote(dirname(archive))} && set -- && for p in ${list || "''"}; do [ -n "$p" ] && { [ -e "$p" ] || [ -L "$p" ]; } && set -- "$@" "$p"; done; if [ $# -gt 0 ]; then tar -czPf ${quote(archive)} -- "$@"; else tar -czPf ${quote(archive)} --files-from /dev/null; fi && chmod 600 ${quote(archive)} && wc -c < ${quote(archive)}`
}

/** Restaura: apaga o que não existia no backup e extrai o arquivo. */
export function restoreCommand(archive: string, absent: readonly string[]): string {
    const removals = absent.map((path) => `rm -rf -- ${quote(path)}`).join(" && ")
    return `[ -f ${quote(archive)} ] || { echo 'backup inexistente' >&2; exit 3; }; ${removals ? `${removals} && ` : ""}tar -xzPf ${quote(archive)}`
}

export function removeFilesCommand(paths: readonly string[]): string {
    return paths.length ? `rm -f -- ${paths.map(quote).join(" ")}` : "true"
}

const inDir = (directory: string | null, command: string) => (directory ? `cd ${quote(directory)} && ${command}` : command)

/** `npx skills add` (global `-g`; projeto: no diretório). */
export function skillsAddCommand(source: string, skills: readonly string[], directory: string | null): string {
    const selection = skills.length ? skills.map((skill) => `-s ${quote(skill)}`).join(" ") : `--skill '*'`
    return inDir(directory, `npx -y skills add ${quote(source)} ${selection} ${directory ? "" : "-g "}-y`)
}

export function skillsUpdateCommand(names: readonly string[], directory: string | null): string {
    return inDir(directory, `npx -y skills update ${names.map(quote).join(" ")} ${directory ? "-p" : "-g"} -y`)
}

export function skillsRemoveCommand(name: string, directory: string | null): string {
    return inDir(directory, `npx -y skills remove ${quote(name)} ${directory ? "" : "-g "}-y`)
}

/**
 * Lista as ferramentas de um MCP pelo inspector (arquivo de configuração temporário, apagado no fim).
 * A saída é reduzida no host a uma linha JSON `[{ n, d }]` (nome e descrição) — o inputSchema fica de fora.
 */
export function mcpToolsCommand(configFile: string, server: string): string {
    const out = `${configFile}.out`
    const reduce = `const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log("OPEX_TOOLS "+JSON.stringify((d.tools||[]).map(t=>({n:t.name,d:String(t.description||"").slice(0,300)}))))`
    return `chmod 600 ${quote(configFile)} 2>/dev/null; MCP_INSPECTOR_SECRET_STORE=memory npx -y @modelcontextprotocol/inspector --cli --config ${quote(configFile)} --server ${quote(server)} --method tools/list > ${quote(out)}; rc=$?; rm -f ${quote(configFile)}; if [ $rc -eq 0 ]; then node -e ${quote(reduce)} ${quote(out)}; rc=$?; else tail -c 1500 ${quote(out)}; fi; rm -f ${quote(out)}; exit $rc`
}

/** Linha `OPEX_TOOLS [...]` da saída do `mcpToolsCommand`. */
export function parseMcpToolsOutput(output: string): { name: string; description: string | null }[] | null {
    const line = output.split("\n").find((item) => item.startsWith("OPEX_TOOLS "))
    if (!line) return null
    try {
        const list = JSON.parse(line.slice("OPEX_TOOLS ".length)) as { n?: unknown; d?: unknown }[]
        return list.filter((item) => typeof item.n === "string").map((item) => ({ name: String(item.n), description: typeof item.d === "string" && item.d ? item.d : null }))
    } catch {
        return null
    }
}
