import type { OpexToolMetaDto } from "@/features/opex-agent/tool-tree"

/** Token de sistema da API interna como a tela mostra (nunca o valor). */
export interface ApiTokenDto {
    id: string
    nome: string
    /** Começo visível do token (ex.: `mt_sys_AbCdEfGh`) para reconhecê-lo. */
    prefixo: string
    criadoEm: string
    ultimoUsoEm: string | null
    /** Escopos concedidos (vazio no token legado). */
    escopos: string[]
    /** Token antigo, sem escopo gravado: só as rotas livres (`whoami`). */
    legado: boolean
    expiraEm: string | null
    expirado: boolean
}

/** Resposta da geração: o valor (`token`) só existe nesta resposta. */
export interface CreatedApiTokenDto {
    token: string
    item: ApiTokenDto
}

/** Rota pública por token com o escopo que ela exige (`null` = qualquer token válido). */
export interface ApiScopeRouteDto {
    method: string
    path: string
    scope: string | null
    summary: string
}

/** Catálogo de escopos para o formulário (`GET /api/integrations/internal_api/scopes`). */
export interface ApiTokenScopeCatalogDto {
    routes: ApiScopeRouteDto[]
    groups: { id: string; label: string; description: string }[]
    /** Ferramentas do MCP do dono que um token pode receber. */
    tools: OpexToolMetaDto[]
}
