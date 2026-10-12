/**
 * Anexos das tarefas: limites, eventos e caminhos. Módulo PURO (cliente e servidor).
 *
 * O contrato do conteúdo (URL estável, tipo de exibição e referência em Markdown) fica em
 * `@/lib/attachments`; aqui vivem as regras da feature.
 */

/** Tamanho máximo por arquivo (100 MB). Validado no navegador e na confirmação do servidor. */
export const ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024
/** Teto do corpo da reserva de upload (evita pedidos absurdos). */
export const ATTACHMENT_MAX_NAME_LENGTH = 300
/** Uploads simultâneos na fila do navegador (a quantidade de arquivos não tem limite). */
export const ATTACHMENT_UPLOAD_CONCURRENCY = 3
/** Validade da URL assinada de upload. */
export const ATTACHMENT_UPLOAD_URL_TTL_SECONDS = 15 * 60
/** Uploads temporários abandonados (nunca vinculados) somem depois disto. */
export const ATTACHMENT_PENDING_TTL_MS = 24 * 60 * 60 * 1000
/** Máximo de anexos vinculados de uma vez (criação da tarefa/aprovação do rascunho). */
export const ATTACHMENT_MAX_LINK = 200

/** Prefixo das rotas de anexos (dono e portal). */
export const ATTACHMENTS_API_PATH = "/api/attachments"
/** Entidade de auditoria dos anexos. */
export const ATTACHMENT_AUDIT_ENTITY = "AnexoTarefa"

/** Mime usado quando o navegador não informa um tipo. */
export const ATTACHMENT_FALLBACK_MIME = "application/octet-stream"
