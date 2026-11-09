/** Cache da árvore do GitHub na verificação de "Com atualização" (10 min, igual às skills do OpenCode). */
export const OPEX_SKILL_VERSION_CACHE_MS = 10 * 60_000

/** Falha do GitHub na verificação fica memorizada por 1 min (a lista não espera o timeout a cada leitura). */
export const OPEX_SKILL_VERSION_FAILURE_CACHE_MS = 60_000

/** Quanto a lista espera a verificação de versão antes de responder "não verificado" (segue em segundo plano). */
export const OPEX_SKILL_VERSION_BUDGET_MS = 4_000

/** Limite técnico do documento no MongoDB (16 MiB) menos uma folga para os metadados. */
export const OPEX_SKILL_MAX_DOC_BYTES = 16 * 1024 * 1024 - 64 * 1024
