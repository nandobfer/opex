import type { AdversarialSettings } from "./schemas"

/**
 * A mesa desta central passa pelo Agente Adversário ao fim da implementação? Agente ativo e a central
 * no escopo (todas ou as escolhidas). Regra pura, compartilhada pelo servidor (`adversaryApplies`) e
 * pela etapa inicial da mesa (seção "Agente Adversário" do popover de modelos — OPE-187).
 */
export function adversaryAppliesTo(settings: Pick<AdversarialSettings, "enabled" | "scope">, centralId: string): boolean {
    return settings.enabled && (settings.scope.all || settings.scope.centralIds.includes(centralId))
}
