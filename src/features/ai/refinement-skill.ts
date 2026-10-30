import type { AiSkillDto } from "@/lib/ai/providers"
import type { RefinementSkillStateDto } from "./types"

/**
 * Situação da skill escolhida como instruções do Agente Refinador (módulo puro). `skills === null`
 * significa que o OpenCode não pôde ser consultado. Fora de `ok`, o refinamento usa as instruções de
 * texto (fallback) e a mensagem explica o motivo.
 */
export function resolveRefinementSkill(skillId: string | null, skills: readonly AiSkillDto[] | null): RefinementSkillStateDto & { skill: AiSkillDto | null } {
    if (skills === null) return { status: "unavailable", name: null, skill: null, message: "Não foi possível consultar as skills do OpenCode agora: enquanto isso, o refinamento usa as instruções de texto." }
    const skill = skillId ? (skills.find((item) => item.id === skillId) ?? null) : null
    if (!skill) return { status: "not_found", name: null, skill: null, message: `A skill "${skillId ?? ""}" não está instalada no OpenCode: o refinamento usa as instruções de texto até você escolher outra.` }
    if (skill.empty) return { status: "empty", name: skill.name, skill, message: `A skill "${skill.name}" está vazia no OpenCode: o refinamento usa as instruções de texto.` }
    return { status: "ok", name: skill.name, skill, message: null }
}
