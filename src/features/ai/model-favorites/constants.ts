import { AI_PROVIDER_IDS } from "@/lib/ai/providers"

/** Modelos de IA favoritos (estrela das buscas de modelo), compartilhados por todos os seletores. */
export const AI_MODEL_FAVORITES_UPDATED_EVENT = "ai-model-favorites-updated"
export const AI_MODEL_FAVORITES_AUDIT_ENTITY = "ModelosFavoritos"
export const AI_MODEL_FAVORITES_QUERY_KEY = ["ai-model-favorites"] as const
/** Provedores aceitos como escopo do favorito: os da IA mais o embedding local (fastembed). */
export const MODEL_FAVORITE_PROVIDERS = [...AI_PROVIDER_IDS, "local"] as const
export const MODEL_FAVORITE_ID_MAX = 300
