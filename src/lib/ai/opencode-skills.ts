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
