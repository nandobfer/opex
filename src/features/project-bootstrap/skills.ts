import { matchOpencodeSkill } from "@nandobfer/integracoes/modules/integrations/ia/ai/opencode-skills"

/**
 * Skills do OpenCode do host usadas pelo Agente de Bootstrap (módulo puro). A seleção guarda o id ou o
 * nome; a sessão libera só as encontradas e ativa cada uma uma única vez.
 */

export interface HostSkill {
    id: string
    name: string
}

export interface SkillResolution {
    found: HostSkill[]
    /** Escolhidas que não estão instaladas no host. */
    missing: string[]
}

export function resolveSkills(hostSkills: readonly HostSkill[], wanted: readonly string[]): SkillResolution {
    const found: HostSkill[] = []
    const missing: string[] = []
    for (const name of wanted) {
        const skill = matchOpencodeSkill(name, hostSkills)
        if (!skill) missing.push(name)
        else if (!found.some((item) => item.id === skill.id)) found.push({ id: skill.id, name: skill.name })
    }
    return { found, missing }
}

export const missingSkillsMessage = (missing: readonly string[]) =>
    missing.length === 1
        ? `A skill "${missing[0]}" não está instalada no OpenCode do host: instale-a em Integrações › Inteligência Artificial › OpenCode › Skills ou tire-a da seleção do Agente de Bootstrap.`
        : `As skills ${missing.map((name) => `"${name}"`).join(", ")} não estão instaladas no OpenCode do host: instale-as em Integrações › Inteligência Artificial › OpenCode › Skills ou tire-as da seleção do Agente de Bootstrap.`

/**
 * Skills da sessão pelo modo do bootstrap: sem ambiente, as que só valem com ambiente saem (não são exigidas,
 * ativadas nem liberadas). Com ambiente, todas as escolhidas.
 */
export function sessionSkills(skills: readonly string[], environmentSkills: readonly string[], withEnvironment: boolean): string[] {
    if (withEnvironment) return [...skills]
    const onlyWithEnvironment = new Set(environmentSkills.map((name) => name.toLowerCase()))
    return skills.filter((name) => !onlyWithEnvironment.has(name.toLowerCase()))
}

/** Skills ainda não ativadas nesta sessão (outra sessão começa do zero). */
export function skillsToActivate(active: { sessionId: string; ids: readonly string[] } | null, sessionId: string, wanted: readonly HostSkill[]): HostSkill[] {
    const done = active?.sessionId === sessionId ? new Set(active.ids) : new Set<string>()
    return wanted.filter((skill) => !done.has(skill.id))
}
