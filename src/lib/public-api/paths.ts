/**
 * Caminhos da documentação OpenAPI da API interna.
 *
 * Ficam em `src/lib` porque o catálogo de integrações (também em `src/lib`) usa o caminho da
 * especificação como `swaggerUrl` gerenciado da integração `internal_api`.
 */

/** Especificação OpenAPI 3.1 (JSON) dos endpoints públicos por token. */
export const PUBLIC_API_SPEC_PATH = "/api/openapi.json"

/** Página Swagger UI que carrega a especificação — é o link entregue a quem consome a API. */
export const PUBLIC_API_DOCS_PATH = "/api/docs"
