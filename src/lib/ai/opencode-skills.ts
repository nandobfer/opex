import type { AiSkillDto } from "./providers"

/** Skill como vem do servidor OpenCode (`GET /api/skill`, `client.skill.list`). */
export interface OpencodeSkillRaw {
    id: string
    name?: string
    description?: string
    path?: string
    content?: string
}

/** Converte a skill do OpenCode no DTO do Opex (módulo puro): o conteúdo não sai do servidor. */
export function toOpencodeSkill(raw: OpencodeSkillRaw): AiSkillDto {
    return { id: raw.id, name: raw.name || raw.id, description: raw.description?.trim() || null, path: raw.path ?? "", empty: !raw.content?.trim() }
}

/** Chave de comparação de uma skill: sem espaços nas pontas, minúsculas e só o último segmento de um id qualificado (`a/b`, `a:b`). */
export function normalizeSkillKey(value: string): string {
    const key = value.trim().toLowerCase()
    const parts = key.split(/[/:]/).filter(Boolean)
    return parts.length ? parts[parts.length - 1] : key
}

/**
 * Casa a skill escolhida (id salvo ou nome) com a lista do OpenCode (módulo puro). Ordem: `id` exato,
 * `name` exato e, por fim, `id`/`name` normalizados (`normalizeSkillKey`). Mais de um candidato no
 * passo normalizado não casa nada, para nunca ativar a skill errada.
 */
export function matchOpencodeSkill<T extends { id: string; name: string }>(wanted: string | null | undefined, skills: readonly T[]): T | null {
    if (!wanted?.trim()) return null
    const exactId = skills.find((skill) => skill.id === wanted)
    if (exactId) return exactId
    const exactName = skills.filter((skill) => skill.name === wanted)
    if (exactName.length === 1) return exactName[0]
    const key = normalizeSkillKey(wanted)
    const loose = skills.filter((skill) => normalizeSkillKey(skill.id) === key || normalizeSkillKey(skill.name) === key)
    return loose.length === 1 ? loose[0] : null
}
