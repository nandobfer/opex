import type { AiSkillDto } from "./providers"
import { matchOpencodeSkill, toOpencodeSkill, type OpencodeSkillRaw } from "./opencode-skills"

/** Intervalo entre leituras enquanto o diretório carrega as skills. */
export const SKILL_LIST_RETRY_MS = 300
/** Leituras no máximo (≈ 4 s de espera com o intervalo acima). */
export const SKILL_LIST_MAX_ATTEMPTS = 14
/** Leituras iguais e não vazias seguidas que contam como lista completa. */
export const SKILL_LIST_STABLE_READS = 4

/** O mínimo do client do OpenCode que a listagem usa (facilita o mock nos testes). */
export interface OpencodeSkillLister {
    skill: { list: (input: { location: { directory: string } }) => Promise<{ location?: { directory?: string }; data?: OpencodeSkillRaw[] }> }
}

export interface SkillListAt {
    skills: AiSkillDto[]
    /** Diretório que o OpenCode respondeu ter consultado. */
    directory: string
    attempts: number
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Skills de um diretório, esperando o OpenCode terminar de carregá-las. Um diretório "frio" (aberto
 * agora ou recarregado) responde primeiro sem nenhuma skill, depois só as nativas e só então a lista
 * completa (OPE-158). Para assim que todas as `want` aparecem; se alguma não aparece, quando a lista
 * fica igual e não vazia por `SKILL_LIST_STABLE_READS` leituras; no limite, devolve a última lida. Sem
 * `want`, nada a esperar: uma leitura só. Erro de rede é erro.
 */
export async function listOpencodeSkillsAt(client: OpencodeSkillLister, directory: string, options: { want?: readonly string[]; wait?: (ms: number) => Promise<void> } = {}): Promise<SkillListAt> {
    const want = (options.want ?? []).filter((item) => item.trim())
    const wait = options.wait ?? sleep
    let last: SkillListAt = { skills: [], directory, attempts: 0 }
    let previous: string | null = null
    let sameReads = 0
    for (let attempt = 1; attempt <= SKILL_LIST_MAX_ATTEMPTS; attempt++) {
        const result = await client.skill.list({ location: { directory } })
        const skills = (result.data ?? []).map(toOpencodeSkill)
        last = { skills, directory: result.location?.directory || directory, attempts: attempt }
        if (!want.length || want.every((item) => matchOpencodeSkill(item, skills))) return last
        const signature = skills.map((skill) => skill.id).join("\n")
        sameReads = skills.length && signature === previous ? sameReads + 1 : 1
        previous = signature
        if (skills.length && sameReads >= SKILL_LIST_STABLE_READS) return last
        if (attempt < SKILL_LIST_MAX_ATTEMPTS) await wait(SKILL_LIST_RETRY_MS)
    }
    return last
}
