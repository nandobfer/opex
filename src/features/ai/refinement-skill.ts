import type { AiSkillDto } from "@/lib/ai/providers"
import { matchOpencodeSkill } from "@/lib/ai/opencode-skills"
import type { RefinementSkillStateDto } from "./types"

/** Onde a lista foi lida (diretório da sessão), para o motivo citar o que foi consultado. */
export interface RefinementSkillLookup {
    directory: string
}

/**
 * Situação da skill escolhida como instruções do Agente Refinador (módulo puro). `skills === null`
 * significa que o OpenCode não pôde ser consultado. Fora de `ok`, o refinamento usa as instruções de
 * texto (fallback) e a mensagem explica o motivo. A skill é casada por id ou nome (`matchOpencodeSkill`);
 * com `lookup`, o `not_found` cita o diretório consultado e as skills encontradas nele.
 */
export function resolveRefinementSkill(skillId: string | null, skills: readonly AiSkillDto[] | null, lookup?: RefinementSkillLookup): RefinementSkillStateDto & { skill: AiSkillDto | null } {
    if (skills === null) return { status: "unavailable", name: null, skill: null, message: "Não foi possível consultar as skills do OpenCode agora: enquanto isso, o refinamento usa as instruções de texto." }
    const skill = matchOpencodeSkill(skillId, skills)
    if (!skill) return { status: "not_found", name: null, skill: null, message: notFoundMessage(skillId ?? "", skills, lookup) }
    if (skill.empty) return { status: "empty", name: skill.name, skill, message: `A skill "${skill.name}" está vazia no OpenCode: o refinamento usa as instruções de texto.` }
    return { status: "ok", name: skill.name, skill, message: null }
}

function notFoundMessage(skillId: string, skills: readonly AiSkillDto[], lookup?: RefinementSkillLookup): string {
    if (!lookup) return `A skill "${skillId}" não está instalada no OpenCode: o refinamento usa as instruções de texto até você escolher outra.`
    const found = skills.length ? `Skills encontradas: ${skills.map((item) => item.id).join(", ")}.` : "Nenhuma skill encontrada."
    return `A skill "${skillId}" não foi encontrada no OpenCode para o diretório da sessão (${lookup.directory}): o refinamento usa as instruções de texto. ${found}`
}
