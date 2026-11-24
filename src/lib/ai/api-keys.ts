import { decryptSecret, isEncryptedSecret } from "@/lib/crypto/secretBox"
import { activeApiKeyOf, selectedApiKeysOf } from "@/lib/integrations/config"
import type { IntegrationId } from "@/lib/integrations/catalog"
import { loadStoredIntegration, type StoredApiKey } from "@/lib/integrations/store"
import { loggerFor } from "@/lib/logger"
import { AiProviderError } from "./errors"
import { isKeyFailureStatus, keyFailuresMessage, rotateFrom, type KeyFailure } from "./key-rotation"

/**
 * Chaves de API dos provedores de IA (SOMENTE servidor, OPE-155/OPE-179). Os clientes usam o segredo na
 * chamada e o `id` para atribuir o consumo à chave (`apiKeyId` dos logs de uso). Com várias chaves em
 * uso, cada geração (ou chamada avulsa) começa na próxima chave do rodízio e, se a chave falhar
 * (401/402/403/429), tenta a seguinte antes de devolver o erro.
 */
export interface AiProviderKey {
    id: string
    name: string
    apiKey: string
}

/** Logger sob demanda: módulos que mockam o logger sem `loggerFor` também importam este arquivo. */
const log = () => loggerFor({ module: "ai", feature: "api-keys" })

function decrypt(item: StoredApiKey | null | undefined): AiProviderKey | null {
    if (!item || !isEncryptedSecret(item.secret)) return null
    let apiKey: string
    try {
        apiKey = decryptSecret(item.secret)
    } catch {
        return null
    }
    return apiKey.trim() ? { id: item.id, name: item.name, apiKey } : null
}

/** Chave principal (Engramind, teste do provedor e "Todas" da assinatura do Go); `null` sem principal. */
export async function getPrimaryAiProviderKey(integrationId: IntegrationId): Promise<AiProviderKey | null> {
    return decrypt(activeApiKeyOf(await loadStoredIntegration(integrationId)))
}

/** Uma chave do chaveiro pelo id (em uso ou não), decifrada só no servidor; `null` se não existe ou não decifra. */
export async function getAiProviderKeyById(integrationId: IntegrationId, keyId: string): Promise<AiProviderKey | null> {
    const stored = await loadStoredIntegration(integrationId)
    return decrypt(stored?.apiKeys?.find((key) => key.id === keyId))
}

/** Chaves em uso (rodízio), decifradas; a que não decifra fica de fora (com log, sem o segredo). */
export async function getAiProviderKeyPool(integrationId: IntegrationId): Promise<AiProviderKey[]> {
    const pool: AiProviderKey[] = []
    for (const item of selectedApiKeysOf(await loadStoredIntegration(integrationId))) {
        const key = decrypt(item)
        if (key) pool.push(key)
        else log().warn({ integrationId, keyId: item.id }, "[ai] chave em uso não decifra; fora do rodízio")
    }
    return pool
}

/** Cursor do rodízio por provedor (por processo). */
const cursors = new Map<string, number>()

/** Ordem desta geração/chamada: começa na próxima chave do rodízio e avança o cursor. */
export function nextKeyOrder<T>(integrationId: string, pool: readonly T[]): T[] {
    const cursor = cursors.get(integrationId) ?? 0
    cursors.set(integrationId, cursor + 1)
    return rotateFrom(pool, cursor)
}

/** Só para testes: zera o rodízio. */
export function resetAiKeyRotation(): void {
    cursors.clear()
}

/** Ordem das chaves em uso desta geração/chamada, ou erro acionável em pt-BR (sem chave = não configurado). */
export async function requireAiProviderKeyOrder(integrationId: IntegrationId, providerName: string): Promise<AiProviderKey[]> {
    const pool = await getAiProviderKeyPool(integrationId)
    if (pool.length === 0) throw new AiProviderError(`${providerName} sem chave de API ativa: cadastre e ative uma chave em Integrações › Inteligência Artificial › ${providerName}`)
    return nextKeyOrder(integrationId, pool)
}

/** Todas as chaves tentadas falharam; `lastKeyId` é a última tentada (atribuição do registro de uso). */
export class AiKeysExhaustedError extends AiProviderError {
    constructor(
        message: string,
        readonly failures: KeyFailure[],
        readonly lastKeyId: string,
    ) {
        super(message)
        this.name = "AiKeysExhaustedError"
    }
}

/**
 * Tenta as chaves na ordem. Com uma chave só, a resposta volta sem alteração (comportamento de antes
 * do rodízio). Com várias, falha de chave cancela o corpo e passa para a próxima; todas falhando lança
 * `AiKeysExhaustedError` com a lista. Erro que não é da chave (5xx, rede, abort) não troca de chave.
 */
async function attemptKeys(order: readonly AiProviderKey[], label: string, call: (key: AiProviderKey) => Promise<Response>): Promise<{ response: Response; key: AiProviderKey }> {
    const failures: KeyFailure[] = []
    for (const key of order) {
        const response = await call(key)
        if (order.length === 1 || !isKeyFailureStatus(response.status)) return { response, key }
        failures.push({ name: key.name, status: response.status })
        log().warn({ label, keyId: key.id, status: response.status }, "[ai] chave falhou; tentando a próxima do rodízio")
        await response.body?.cancel().catch(() => undefined)
    }
    throw new AiKeysExhaustedError(keyFailuresMessage(label, failures), failures, order[order.length - 1]!.id)
}

/**
 * Chamada direta (listar modelos, JEV, catálogo do Go) com troca de chave em falha. `keys` fixa as
 * chaves (ex.: conferir uma chave só no teste); sem ele, usa a próxima ordem do rodízio.
 */
export async function fetchWithKeyFailover(
    integrationId: IntegrationId,
    label: string,
    call: (key: AiProviderKey) => Promise<Response>,
    options: { keys?: readonly AiProviderKey[] } = {},
): Promise<{ response: Response; key: AiProviderKey }> {
    const order = options.keys?.length ? options.keys : await requireAiProviderKeyOrder(integrationId, label)
    return attemptKeys(order, label, call)
}

/** Corpo que pode ser reenviado a outra chave (as SDKs mandam JSON em string). */
function isReplayable(body: BodyInit | null | undefined): boolean {
    return body == null || typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || body instanceof URLSearchParams
}

function swapSecret(headers: Headers, from: string, to: string): void {
    if (from === to) return
    const touched: [string, string][] = []
    headers.forEach((value, name) => {
        if (value.includes(from)) touched.push([name, value.split(from).join(to)])
    })
    for (const [name, value] of touched) headers.set(name, value)
}

export interface KeyFailoverFetch {
    /** `fetch` para a SDK da AI SDK. */
    fetch: typeof fetch
    /** Segredo com que a SDK é criada (a primeira chave da ordem); o `fetch` troca pelo da tentativa. */
    initialApiKey: string
    /** Chave atual da geração: a que respondeu por último (o consumo é atribuído a ela). */
    current: () => AiProviderKey
}

/**
 * `fetch` das SDKs com rodízio e troca de chave: a SDK põe o segredo inicial no cabeçalho dela
 * (`Authorization: Bearer`, `x-api-key`, `x-goog-api-key`) e cada tentativa troca esse segredo, em
 * todos os cabeçalhos, pelo da chave da vez (`applyKey` acrescenta cabeçalhos próprios, como o Go). A
 * chave que respondeu fica fixa para os próximos passos do turno.
 */
export function createKeyFailoverFetch(options: { order: readonly AiProviderKey[]; label: string; baseFetch?: typeof fetch; applyKey?: (headers: Headers, key: AiProviderKey) => void }): KeyFailoverFetch {
    const { order, label } = options
    if (order.length === 0) throw new AiProviderError(`${label} sem chave de API ativa`)
    const initial = order[0]!
    let current = initial
    const fetchImpl: typeof fetch = async (input, init) => {
        const replayable = !(input instanceof Request) && isReplayable(init?.body)
        const attempts = replayable ? [current, ...order.filter((key) => key.id !== current.id)] : [current]
        const { response, key } = await attemptKeys(attempts, label, (key) => {
            const headers = new Headers(init?.headers)
            swapSecret(headers, initial.apiKey, key.apiKey)
            options.applyKey?.(headers, key)
            return (options.baseFetch ?? globalThis.fetch)(input, { ...init, headers })
        })
        current = key
        return response
    }
    return { fetch: fetchImpl, initialApiKey: initial.apiKey, current: () => current }
}
