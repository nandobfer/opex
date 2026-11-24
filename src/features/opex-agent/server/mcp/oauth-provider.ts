import { randomBytes } from "node:crypto"
import type { OAuthAuthorizationServerInformation, OAuthClientInformation, OAuthClientMetadata, OAuthClientProvider, OAuthTokens } from "@ai-sdk/mcp"
import { encryptSecret } from "@/lib/crypto/secretBox"
import type { IOpexMcpOauth, IOpexMcpOauthPending } from "@/lib/db/models/Opex"
import { OPEX_MCP_OAUTH_PENDING_MS } from "../../mcp"
import { hashState, openJson, openText, patchMcpOauth, sealJson } from "./oauth-store"

/**
 * `OAuthClientProvider` da `@ai-sdk/mcp` guardado no subdocumento `oauth` do MCP (OPE-176).
 *
 * Modos:
 * - `start`: botão Autorizar — ignora os tokens atuais (nova autorização), grava o pedido (state +
 *   verificador PKCE) e captura a URL do provedor em vez de redirecionar;
 * - `callback`: retorno do provedor — usa o pedido lido no retorno (state e verificador) para trocar o
 *   código pelo token;
 * - `headless`: turno do agente, teste e ação confirmada — usa e renova os tokens; se o servidor pedir
 *   login, marca "precisa autorizar" e falha com `OpexMcpAuthRequiredError` (nunca redireciona).
 */

export type McpOauthProviderMode = "start" | "callback" | "headless"

/** O MCP precisa de uma nova autorização pelo dono (sem token válido). */
export class OpexMcpAuthRequiredError extends Error {
    constructor(message = "Autorização OAuth necessária: clique em Autorizar no cadastro do MCP.") {
        super(message)
        this.name = "OpexMcpAuthRequiredError"
    }
}

/** O provedor concedeu menos escopos que os pedidos (o token é descartado). */
export class OpexMcpOauthScopeError extends Error {
    constructor(
        readonly missing: string[],
        readonly tokens: OAuthTokens,
    ) {
        super(`O provedor não concedeu as permissões ${missing.join(", ")}. Autorize de novo e marque essas permissões: o MCP precisa delas.`)
        this.name = "OpexMcpOauthScopeError"
    }
}

/** Cliente registrado (registro dinâmico) e o endereço de retorno para o qual foi registrado. */
export interface StoredMcpClient {
    info: OAuthClientInformation
    redirectUri: string
    dynamic: boolean
}

export interface OpexMcpOauthProvider extends OAuthClientProvider {
    /** URL do provedor capturada no modo `start`. */
    readonly authorizationUrl: URL | null
    /** Tokens recebidos que não chegaram a ser gravados (escopo insuficiente: para revogar). */
    readonly rejectedTokens: OAuthTokens | null
}

export interface McpOauthProviderOptions {
    mode: McpOauthProviderMode
    /** Endereço público de retorno (`start`/`callback`); no `headless`, o do cliente salvo. */
    redirectUri?: string
    actorId?: string
    /** Pedido lido no retorno (`callback`). */
    pending?: IOpexMcpOauthPending
}

/** Escopos pedidos que não vieram no `scope` do token (sem `scope` na resposta = todos concedidos). */
export function missingScopes(requested: string, granted: string | undefined): string[] {
    const wanted = requested.split(/\s+/).filter(Boolean)
    if (!wanted.length || granted === undefined) return []
    const got = new Set(granted.split(/\s+/).filter(Boolean))
    return wanted.filter((scope) => !got.has(scope))
}

const random = () => randomBytes(32).toString("base64url")

export function createMcpOauthProvider(id: string, initial: IOpexMcpOauth, options: McpOauthProviderOptions): OpexMcpOauthProvider {
    const state: IOpexMcpOauth = { ...initial }
    const mode = options.mode
    const storedClient = () => openJson<StoredMcpClient>(state.client)
    const redirectUri = options.redirectUri ?? storedClient()?.redirectUri ?? ""
    const clientSecret = () => (state.clientId ? openText(state.clientSecret) : null)
    let pending: IOpexMcpOauthPending | null = options.pending ?? null
    let memoryVerifier: string | null = null
    let authorizationUrl: URL | null = null
    let rejectedTokens: OAuthTokens | null = null

    const provider: OpexMcpOauthProvider = {
        get authorizationUrl() {
            return authorizationUrl
        },
        get rejectedTokens() {
            return rejectedTokens
        },
        get redirectUrl() {
            return redirectUri
        },
        get clientMetadata(): OAuthClientMetadata {
            return {
                client_name: "Opex",
                redirect_uris: [redirectUri],
                grant_types: ["authorization_code", "refresh_token"],
                response_types: ["code"],
                token_endpoint_auth_method: clientSecret() ? "client_secret_post" : "none",
                ...(state.scope ? { scope: state.scope } : {}),
            }
        },
        clientInformation() {
            if (state.clientId) {
                const secret = clientSecret()
                return { client_id: state.clientId, ...(secret ? { client_secret: secret } : {}) }
            }
            return storedClient()?.info
        },
        isClientInformationDynamicallyRegistered() {
            return !state.clientId && storedClient()?.dynamic === true
        },
        async saveClientInformation(info) {
            if (state.clientId) return
            const sealed = sealJson({ info, redirectUri, dynamic: true } satisfies StoredMcpClient)
            state.client = sealed
            await patchMcpOauth(id, { client: sealed })
        },
        authorizationServerInformation() {
            return state.server ?? undefined
        },
        async saveAuthorizationServerInformation(info: OAuthAuthorizationServerInformation) {
            const server = { ...(state.server ?? {}), ...info, revocationEndpoint: state.server?.revocationEndpoint ?? null }
            state.server = server
            await patchMcpOauth(id, { server })
        },
        tokens() {
            if (mode === "start") return undefined
            return openJson<OAuthTokens>(state.tokens) ?? undefined
        },
        async saveTokens(tokens) {
            if (mode !== "headless") {
                const missing = missingScopes(state.scope, tokens.scope)
                if (missing.length) {
                    rejectedTokens = tokens
                    throw new OpexMcpOauthScopeError(missing, tokens)
                }
            }
            const sealed = sealJson(tokens)
            const expiresAt = typeof tokens.expires_in === "number" ? new Date(Date.now() + tokens.expires_in * 1000) : null
            const version = state.tokenVersion ?? 0
            state.tokens = sealed
            state.expiresAt = expiresAt
            state.tokenVersion = version + 1
            // Gravação condicional: se outra conexão renovou antes, o token dela fica no banco.
            await patchMcpOauth(
                id,
                { tokens: sealed, expiresAt, status: "authorized", lastError: null, ...(mode === "callback" ? { authorizedAt: new Date(), pending: null } : {}) },
                { filter: { "oauth.tokenVersion": version }, incTokenVersion: true },
            )
        },
        async redirectToAuthorization(url) {
            if (mode === "start") {
                authorizationUrl = url
                return
            }
            await patchMcpOauth(id, { status: "needs_auth", lastError: null })
            throw new OpexMcpAuthRequiredError()
        },
        state() {
            return random()
        },
        async saveState(value) {
            if (mode !== "start") return
            pending = {
                stateHash: hashState(value).toString("hex"),
                state: encryptSecret(value),
                codeVerifier: null,
                redirectUri,
                expiresAt: new Date(Date.now() + OPEX_MCP_OAUTH_PENDING_MS),
                actorId: options.actorId ?? "",
            }
            await patchMcpOauth(id, { pending })
        },
        storedState() {
            if (mode !== "callback") return undefined
            return pending ? (openText(pending.state) ?? undefined) : undefined
        },
        async saveCodeVerifier(verifier) {
            memoryVerifier = verifier
            if (mode !== "start" || !pending) return
            pending = { ...pending, codeVerifier: encryptSecret(verifier) }
            await patchMcpOauth(id, { pending })
        },
        codeVerifier() {
            const verifier = pending?.codeVerifier ? openText(pending.codeVerifier) : memoryVerifier
            if (!verifier) throw new OpexMcpAuthRequiredError("O pedido de autorização expirou: clique em Autorizar de novo.")
            return verifier
        },
        async invalidateCredentials(scope, context) {
            const current = openJson<OAuthTokens>(state.tokens)
            if (scope === "verifier") {
                memoryVerifier = null
                return
            }
            if (scope === "client" || scope === "all") {
                if (!state.clientId) {
                    state.client = null
                    await patchMcpOauth(id, { client: null })
                }
            }
            if (scope === "tokens" || scope === "all") {
                // Só apaga a geração indicada (uma renovação concorrente pode ter gravado outra).
                if (context?.tokens && current && context.tokens.access_token !== current.access_token) return
                const version = state.tokenVersion ?? 0
                state.tokens = null
                state.expiresAt = null
                await patchMcpOauth(id, { tokens: null, expiresAt: null, status: "needs_auth" }, { filter: { "oauth.tokenVersion": version } })
            }
        },
    }
    return provider
}
