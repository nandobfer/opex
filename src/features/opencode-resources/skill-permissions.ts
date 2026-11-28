import { matchOpencodeSkill } from "@nandobfer/integracoes/modules/integrations/ia/ai/opencode-skills"

/** Regra de permissão de uma sessão do OpenCode (a última que casa vence). */
export interface SessionPermissionRule {
    action: string
    resource: string
    effect: "allow" | "deny" | "ask"
}

/**
 * Skills liberadas numa sessão do OpenCode (módulo puro; agentes rotineiros e Agente de Bootstrap): nega
 * todas (`skill` + `*`, inclusive nativas, de projeto e as que surgirem) e libera só as selecionadas que
 * existem no host. Seleção por id ou nome (`matchOpencodeSkill`); a regra usa sempre o id do OpenCode.
 */
export function skillPermissionRules(hostSkills: readonly { id: string; name: string }[], allowed: readonly string[]): { rules: SessionPermissionRule[]; missing: string[] } {
    const rules: SessionPermissionRule[] = [{ action: "skill", resource: "*", effect: "deny" }]
    const granted = new Set<string>()
    const missing: string[] = []
    for (const name of allowed) {
        const skill = matchOpencodeSkill(name, hostSkills)
        if (!skill) {
            missing.push(name)
            continue
        }
        if (granted.has(skill.id)) continue
        granted.add(skill.id)
        rules.push({ action: "skill", resource: skill.id, effect: "allow" })
    }
    return { rules, missing }
}
