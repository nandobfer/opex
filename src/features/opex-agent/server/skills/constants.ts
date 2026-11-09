/** Cache da árvore do GitHub na verificação de "Com atualização" (10 min, igual às skills do OpenCode). */
export const OPEX_SKILL_VERSION_CACHE_MS = 10 * 60_000

/** Limite técnico do documento no MongoDB (16 MiB) menos uma folga para os metadados. */
export const OPEX_SKILL_MAX_DOC_BYTES = 16 * 1024 * 1024 - 64 * 1024
