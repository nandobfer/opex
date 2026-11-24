import { getIntegrationDef } from "@/lib/integrations/catalog"
import { getIntegration, isIntegrationConfigured } from "@/lib/integrations/config"
import { listAnthropicModels } from "@/lib/ai/anthropic"
import { getAiProviderKeyPool, type AiProviderKey } from "@/lib/ai/api-keys"
import { clearAiCatalogCache, listAiAgents, listAiModels } from "@/lib/ai/catalog"
import { listDeepseekModels } from "@/lib/ai/deepseek"
import { AiProviderError } from "@/lib/ai/errors"
import { listGeminiModels } from "@/lib/ai/gemini"
import { listJevModels } from "@/lib/ai/jev"
import { getOpencodeInfo } from "@/lib/ai/opencode"
import { verifyOpencodeGoKey } from "@/lib/ai/opencode-go"
import { listOpenaiModels } from "@/lib/ai/openai"
import { AI_PROVIDERS, getAiProvider } from "@/lib/ai/providers"
import { describeFetchError, fail, stepSignal, warnResult, type IntegrationTester, type TestEmit } from "@/features/integrations/testers/types"
import type { AiApiKeyProviderId } from "../api-keys"

/** Testes de conexão dos provedores de IA e do hub "Inteligência Artificial". */

function failFrom(error: unknown): never {
    fail(error instanceof AiProviderError ? error.message : describeFetchError(error))
}

/** Conferência de UMA chave, sem rodízio (lista os modelos com ela; no Go, a conferência sem gerar). */
const KEY_CHECKS: Record<AiApiKeyProviderId, (signal: AbortSignal | undefined, key: AiProviderKey) => Promise<unknown>> = {
    gemini: listGeminiModels,
    anthropic: listAnthropicModels,
    openai: listOpenaiModels,
    deepseek: listDeepseekModels,
    jev: listJevModels,
    "opencode-go": verifyOpencodeGoKey,
}

/**
 * Com mais de uma chave em uso (OPE-179), confere cada uma: a chave quebrada aparece no status do
 * provedor, mesmo com o rodízio cobrindo a falha. Devolve o aviso (ou `null` se todas foram aceitas).
 */
export async function checkEachKey(provider: AiApiKeyProviderId, emit: TestEmit, signal: AbortSignal): Promise<string | null> {
    const pool = await getAiProviderKeyPool(getAiProvider(provider).integrationId)
    if (pool.length < 2) return null
    const failures: string[] = []
    for (const key of pool) {
        emit("step", `Conferindo a chave “${key.name}”`)
        try {
            await KEY_CHECKS[provider](stepSignal(signal, 20_000), key)
            emit("success", `Chave “${key.name}” aceita`)
        } catch (error) {
            const message = error instanceof AiProviderError ? error.message : describeFetchError(error)
            failures.push(`“${key.name}” (${message})`)
            emit("error", `Chave “${key.name}”: ${message}`)
        }
    }
    if (failures.length === 0) return null
    return `${pool.length - failures.length} de ${pool.length} chaves aceitas; falhou: ${failures.join(", ")}`
}

export const testOpencode: IntegrationTester = async ({ emit, signal }) => {
    const resolved = await getIntegration("ai_opencode")
    if (!resolved.values.baseUrl) fail("Sem URL do servidor: informe o endereço do opencode serve")
    if (!resolved.values.password) emit("warn", "Sem senha: o opencode serve 2.x exige autenticação Basic em todas as rotas")
    clearAiCatalogCache()

    emit("step", `GET ${resolved.values.baseUrl}/api/info`)
    const info = await getOpencodeInfo(stepSignal(signal, 15_000)).catch(failFrom)
    emit("success", `OpenCode ${info.version}`)

    emit("step", "GET /api/model")
    const models = await listAiModels("opencode", { fresh: true, signal: stepSignal(signal, 20_000) }).catch(failFrom)
    const providers = new Set(models.map((model) => model.group)).size
    emit(models.length ? "success" : "warn", `${models.length} modelo(s) de ${providers} provedor(es)`)

    emit("step", "GET /api/agent")
    const agents = await listAiAgents({ fresh: true, signal: stepSignal(signal, 15_000) }).catch(failFrom)
    emit("info", `Agentes: ${agents.map((agent) => agent.id).join(", ") || "nenhum"}`)

    if (!models.length) return warnResult("Conectado, mas sem modelos habilitados: conecte um provedor no OpenCode")
    return `OpenCode ${info.version} com ${models.length} modelo(s)`
}

export const testGemini: IntegrationTester = async ({ emit, signal }) => {
    const resolved = await getIntegration("ai_gemini")
    if (!resolved.values.apiKey) fail("Sem chave de API ativa: cadastre e ative uma chave do Google AI Studio em Chaves de API")
    clearAiCatalogCache()
    emit("step", "GET /v1beta/models")
    const models = await listAiModels("gemini", { fresh: true, signal: stepSignal(signal, 20_000) }).catch(failFrom)
    emit(models.length ? "success" : "warn", `${models.length} modelo(s) de texto disponível(is)`)
    const keyWarning = await checkEachKey("gemini", emit, signal)
    if (keyWarning) return warnResult(keyWarning)
    if (!models.length) return warnResult("API key válida, mas nenhum modelo de texto disponível")
    return `API key válida; ${models.length} modelo(s)`
}

/** Provedores diretos por API key: o teste lista os modelos de texto. */
const API_KEY_INTEGRATIONS = { anthropic: "ai_anthropic", openai: "ai_openai", deepseek: "ai_deepseek" } as const

function apiKeyModelsTester(providerId: keyof typeof API_KEY_INTEGRATIONS, keyHint: string, endpoint: string): IntegrationTester {
    return async ({ emit, signal }) => {
        const resolved = await getIntegration(API_KEY_INTEGRATIONS[providerId])
        if (!resolved.values.apiKey) fail(`Sem chave de API ativa: cadastre e ative uma chave ${keyHint} em Chaves de API`)
        clearAiCatalogCache()
        emit("step", `GET ${endpoint}`)
        const models = await listAiModels(providerId, { fresh: true, signal: stepSignal(signal, 20_000) }).catch(failFrom)
        emit(models.length ? "success" : "warn", `${models.length} modelo(s) de texto disponível(is)`)
        const keyWarning = await checkEachKey(providerId, emit, signal)
        if (keyWarning) return warnResult(keyWarning)
        if (!models.length) return warnResult("API key válida, mas nenhum modelo de texto disponível")
        return `API key válida; ${models.length} modelo(s)`
    }
}

export const testAnthropic = apiKeyModelsTester("anthropic", "do Claude Console", "/v1/models")
export const testOpenai = apiKeyModelsTester("openai", "da plataforma OpenAI", "/v1/models")
export const testDeepseek = apiKeyModelsTester("deepseek", "da plataforma DeepSeek", "/models")

/** OpenCode Go: a lista de modelos é pública, então o teste também confere a chave (sem gerar nada). */
export const testOpencodeGo: IntegrationTester = async ({ emit, signal }) => {
    const resolved = await getIntegration("ai_opencode_go")
    if (!resolved.values.apiKey) fail("Sem chave de API ativa: cadastre e ative uma chave oc_sk_… do OpenCode Go em Chaves de API")
    clearAiCatalogCache()
    emit("step", "GET /openai/v1/models")
    const models = await listAiModels("opencode-go", { fresh: true, signal: stepSignal(signal, 20_000) }).catch(failFrom)
    emit(models.length ? "success" : "warn", `${models.length} modelo(s) disponível(is) no Go`)
    emit("step", "POST /openai/v1/chat/completions (conferência da chave, sem gerar)")
    await verifyOpencodeGoKey(stepSignal(signal, 20_000)).catch(failFrom)
    emit("success", "Chave aceita pelo OpenCode Go")
    const keyWarning = await checkEachKey("opencode-go", emit, signal)
    if (keyWarning) return warnResult(keyWarning)
    if (!models.length) return warnResult("Chave aceita, mas o Go não listou modelos")
    return `Chave aceita; ${models.length} modelo(s)`
}

export const testJev: IntegrationTester = async ({ emit, signal }) => {
    const resolved = await getIntegration("ai_jev")
    if (!resolved.values.apiKey) fail("Sem chave de API ativa: cadastre e ative uma chave da TypeSafe em Chaves de API")
    clearAiCatalogCache()
    emit("step", "GET /v1/models")
    const models = await listAiModels("jev", { fresh: true, signal: stepSignal(signal, 20_000) }).catch(failFrom)
    emit(models.length ? "success" : "warn", `${models.length} modelo(s) disponível(is)`)
    const keyWarning = await checkEachKey("jev", emit, signal)
    if (keyWarning) return warnResult(keyWarning)
    if (!models.length) return warnResult("API key válida, mas nenhum modelo disponível")
    return `API key válida; ${models.length} modelo(s)`
}

/** Hub: testa cada provedor configurado (gravando o status de cada um) e resume. */
export const testAiHub: IntegrationTester = async ({ emit, signal }) => {
    const { runIntegrationTest } = await import("@/features/integrations/services/integration-test-runner")
    let configured = 0
    let connected = 0
    for (const provider of AI_PROVIDERS) {
        const resolved = await getIntegration(provider.integrationId)
        if (!isIntegrationConfigured(getIntegrationDef(provider.integrationId), resolved)) {
            emit("info", `${provider.name}: não configurado`)
            continue
        }
        configured++
        emit("step", `Testando ${provider.name}`)
        const result = await runIntegrationTest(provider.integrationId, {
            source: "manual",
            signal,
            emit: (level, message) => emit(level, `  ${provider.name}: ${message}`),
        })
        if (result.ok) connected++
        emit(result.ok ? "success" : "error", `${provider.name}: ${result.message}`)
    }
    if (configured === 0) fail("Nenhum provedor configurado: configure ao menos um provedor na aba Provedores")
    if (connected === 0) fail("Nenhum provedor de IA conectado")
    if (connected < configured) return warnResult(`${connected} de ${configured} provedor(es) conectado(s)`)
    return `${connected} provedor(es) de IA conectado(s)`
}
