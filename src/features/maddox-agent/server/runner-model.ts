import type { MaddoxAgentSettings } from "../schemas"

/** Escolha do modelo de um turno do Agente Maddox (módulo puro). */
/** Modelo do turno: o da sessão (se ainda estiver no catálogo) ou o padrão da configuração. */
export function resolveTurnModel(
    settings: Pick<MaddoxAgentSettings, "main">,
    override: { model: string; variant: string | null } | null | undefined,
    catalog: readonly { id: string; variants: string[] }[] | null,
): { model: string | null; variant: string | null; fellBack: boolean } {
    if (override?.model) {
        const found = catalog ? catalog.find((item) => item.id === override.model) : { id: override.model, variants: override.variant ? [override.variant] : [] }
        if (found) return { model: override.model, variant: override.variant && found.variants.includes(override.variant) ? override.variant : null, fellBack: false }
        return { model: settings.main.model, variant: settings.main.variant, fellBack: true }
    }
    return { model: settings.main.model, variant: settings.main.variant, fellBack: false }
}
