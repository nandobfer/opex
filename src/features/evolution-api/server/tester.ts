
import { getIntegrationConfig } from "@/lib/integrations/config"
import { fail, warnResult, type IntegrationTester } from "@/features/integrations/testers/types"
import { EVOLUTION_INTEGRATION_ID, connectionStateOf, EVOLUTION_STATE_LABELS } from "../constants"
import { evolution, EvolutionError, type EvolutionTarget } from "./client"

/**
 * Teste da Evolution API: `GET /instance/fetchInstances` (alcance e chave válida, rota local da Evolution) e, à parte,
 * `GET /` só para a versão. O `GET /` da 2.3.8 consulta `web.whatsapp.com` a cada chamada (sem timeout): quando essa
 * consulta externa demora, ele trava sem que a Evolution esteja fora do ar. Por isso a versão tem timeout curto e a
 * falha dela não muda o resultado. Amarelo: instância padrão inexistente ou desconectada, ou webhook do Opex não
 * registrado nela.
 */
/** Prazo da leitura da versão (`GET /`), que depende de uma consulta externa da Evolution. */
export const VERSION_TIMEOUT_MS = 5_000

export const testEvolution: IntegrationTester = async ({ emit, signal }) => {
    const config = await getIntegrationConfig(EVOLUTION_INTEGRATION_ID)
    const baseUrl = config.internalUrl?.trim().replace(/\/+$/, "")
    if (!baseUrl) fail("Sem URL interna: configure a aba Geral")
    if (!config.apiKey) fail("Sem chave global: configure a aba Geral")
    const target: EvolutionTarget = { baseUrl, apiKey: config.apiKey }

    emit("step", `GET ${baseUrl}/instance/fetchInstances`)
    let instances: Awaited<ReturnType<typeof evolution.fetchInstances>>
    try {
        instances = await evolution.fetchInstances({ target, signal })
    } catch (error) {
        if (error instanceof EvolutionError && error.code === "UNAUTHORIZED") fail("Chave global recusada pela Evolution API")
        fail(error instanceof Error ? error.message : String(error))
    }
    emit("success", `Evolution API no ar e chave válida (${instances.length} instância(s))`)

    emit("step", "GET / (versão)")
    const info = await evolution.info({ target, signal, timeoutMs: VERSION_TIMEOUT_MS }).catch(() => null)
    if (info?.version) emit("info", `Versão ${info.version}`)
    else emit("info", "Versão indisponível agora (a Evolution consulta o WhatsApp Web para informá-la)")

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
    const version = info?.version ? `Evolution API ${info.version}` : "Evolution API no ar"
    return warnings.length > 0 ? warnResult(`${version}, mas ${warnings.join("; ")}`) : `${version}, chave válida e instância conectada`
}
