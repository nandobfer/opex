import { urlFilterCodecs, type UrlFilterSchema } from "@/hooks/useUrlFilters"

/** Serviço escolhido na lista de Serviços do compose, na URL (`?servico=`), para voltar a ele. */
export const SERVICE_PARAM_DEFAULTS = { servico: "" }
export const SERVICE_PARAM_SCHEMA: UrlFilterSchema<typeof SERVICE_PARAM_DEFAULTS> = { servico: urlFilterCodecs.string() }
