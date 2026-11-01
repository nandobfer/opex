import type { SubscriptionMode } from "../../network/types"

export const SUBSCRIPTION_MODE_LABEL: Record<SubscriptionMode, string> = {
    inject: "inject: entra no contexto",
    search: "search: só por busca",
    manage: "manage: gerencia o canal",
}
