
import { getIntegrationConfig } from "@/lib/integrations/config"
import { fail, warnResult, type IntegrationTester } from "@/features/integrations/testers/types"
import { EVOLUTION_INTEGRATION_ID, connectionStateOf, EVOLUTION_STATE_LABELS } from "../constants"
import { evolution, EvolutionError, type EvolutionTarget } from "./client"

/**
 * Teste da Evolution API: `GET /` (alcance e versão) + `GET /instance/fetchInstances` (chave válida).
 * Amarelo: instância padrão inexistente ou desconectada, ou webhook do Opex não registrado nela.
 */
export const testEvolution: IntegrationTester = async ({ emit, signal }) => {
    const config = await getIntegrationConfig(EVOLUTION_INTEGRATION_ID)
    const baseUrl = config.internalUrl?.trim().replace(/\/+$/, "")
    if (!baseUrl) fail("Sem URL interna: configure a aba Geral")
    if (!config.apiKey) fail("Sem chave global: configure a aba Geral")
    const target: EvolutionTarget = { baseUrl, apiKey: config.apiKey }

    emit("step", `GET ${baseUrl}/`)
    const info = await evolution.info({ target, signal }).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
    emit("success", `Evolution API ${info.version ?? "(versão não informada)"} no ar`)

    emit("step", "GET /instance/fetchInstances")
    let instances: Awaited<ReturnType<typeof evolution.fetchInstances>>
    try {
        instances = await evolution.fetchInstances({ target, signal })
    } catch (error) {
        if (error instanceof EvolutionError && error.code === "UNAUTHORIZED") fail("Chave global recusada pela Evolution API")
        fail(error instanceof Error ? error.message : String(error))
    }
    emit("success", `Chave válida (${instances.length} instância(s))`)

    const warnings: string[] = []
    const name = config.defaultInstance?.trim()
    if (!name) warnings.push("nenhuma instância padrão escolhida")
    else {
        const instance = instances.find((item) => item.name === name)
        if (!instance) warnings.push(`a instância "${name}" não existe na Evolution`)
        else {
            const state = connectionStateOf(instance.connectionStatus)
            emit("info", `Instância ${name}: ${EVOLUTION_STATE_LABELS[state]}`)
            if (state !== "connected") warnings.push(`a instância "${name}" está ${EVOLUTION_STATE_LABELS[state].toLowerCase()}`)
            const webhook = await evolution.findWebhook(name, { target, signal }).catch(() => null)
            if (!webhook?.enabled || (config.webhookUrl && webhook.url !== config.webhookUrl)) warnings.push("webhook do Opex não registrado na instância")
        }
    }
    const version = info.version ? `Evolution API ${info.version}` : "Evolution API no ar"
    return warnings.length > 0 ? warnResult(`${version}, mas ${warnings.join("; ")}`) : `${version}, chave válida e instância conectada`
}
