import { GLOBAL_SCOPE } from "./constants"

/**
 * Onde cada tipo de recurso mora no host, por escopo. Global = configuração do usuário
 * (`~/.config/opencode`, `~/.agents/skills`); projeto = diretório da central (`<dir>/.opencode`,
 * `<dir>/.agents/skills`). Módulo puro.
 */

export interface ScopePaths {
    scope: string
    /** Diretório do projeto (`null` no global). */
    directory: string | null
    configDir: string
    /** Arquivos de configuração aceitos, em ordem de preferência (o primeiro que existir é o usado). */
    configFiles: string[]
    agentDirs: string[]
    commandDirs: string[]
    skillRoots: string[]
    /** Onde nascem os itens criados à mão. */
    newAgentDir: string
    newCommandDir: string
    newSkillRoot: string
    /** Lock da CLI `skills` (origem e hash das skills instaladas de repositório). */
    skillLockFile: string
}

const trim = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path)

export function scopePaths(home: string, scope: string, directory: string | null): ScopePaths {
    const h = trim(home)
    if (scope === GLOBAL_SCOPE || !directory) {
        const configDir = `${h}/.config/opencode`
        return {
            scope: GLOBAL_SCOPE,
            directory: null,
            configDir,
            configFiles: [`${configDir}/opencode.jsonc`, `${configDir}/opencode.json`],
            agentDirs: [`${configDir}/agents`, `${configDir}/agent`],
            commandDirs: [`${configDir}/commands`, `${configDir}/command`],
            skillRoots: [`${h}/.agents/skills`, `${configDir}/skills`, `${configDir}/skill`, `${h}/.claude/skills`],
            newAgentDir: `${configDir}/agents`,
            newCommandDir: `${configDir}/commands`,
            newSkillRoot: `${h}/.agents/skills`,
            skillLockFile: `${h}/.agents/.skill-lock.json`,
        }
    }
    const d = trim(directory)
    const configDir = `${d}/.opencode`
    return {
        scope,
        directory: d,
        configDir,
        configFiles: [`${d}/opencode.jsonc`, `${d}/opencode.json`, `${configDir}/opencode.jsonc`, `${configDir}/opencode.json`],
        agentDirs: [`${configDir}/agents`, `${configDir}/agent`],
        commandDirs: [`${configDir}/commands`, `${configDir}/command`],
        skillRoots: [`${d}/.agents/skills`, `${configDir}/skills`, `${configDir}/skill`, `${d}/.claude/skills`],
        newAgentDir: `${configDir}/agents`,
        newCommandDir: `${configDir}/commands`,
        newSkillRoot: `${d}/.agents/skills`,
        skillLockFile: `${d}/skills-lock.json`,
    }
}

export const isInside = (path: string, roots: readonly string[]) => roots.some((root) => path === root || path.startsWith(`${trim(root)}/`))

export const baseName = (path: string) => trim(path).split("/").at(-1) ?? path
export const dirName = (path: string) => trim(path).replace(/\/[^/]*$/, "") || "/"
export const stripMd = (file: string) => file.replace(/\.md$/i, "")

/** Lock da CLI `skills` (`{ skills: { nome: { source, skillPath, skillFolderHash } } }`). */
export interface SkillLockEntry {
    source: string
    sourceUrl: string | null
    skillPath: string | null
    hash: string | null
}

export function parseSkillLock(text: string | null): Record<string, SkillLockEntry> {
    if (!text) return {}
    try {
        const data = JSON.parse(text) as { skills?: Record<string, Record<string, unknown>> }
        const out: Record<string, SkillLockEntry> = {}
        for (const [name, raw] of Object.entries(data.skills ?? {})) {
            if (!raw || typeof raw.source !== "string") continue
            out[name] = {
                source: raw.source,
                sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : null,
                skillPath: typeof raw.skillPath === "string" ? raw.skillPath : null,
                hash: typeof raw.skillFolderHash === "string" ? raw.skillFolderHash : typeof raw.computedHash === "string" ? raw.computedHash : null,
            }
        }
        return out
    } catch {
        return {}
    }
}

/** Pasta da skill dentro do repositório (`skills/x/SKILL.md` → `skills/x`; `SKILL.md` → raiz ""). */
export const skillRepoFolder = (skillPath: string | null) => (skillPath ? skillPath.replace(/\/?SKILL\.md$/i, "") : "")
