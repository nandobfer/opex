import { after } from "next/server"
import { createIntegrationsServer, createSecretBox, extendPersistence, type IntegrationsLogger, type SecretBox, type ResolvedIntegration as LibResolvedIntegration } from "@nandobfer/integracoes/server"
import { configureIaServer } from "@nandobfer/integracoes/ia/server"
import * as appSecretBox from "@/lib/crypto/secretBox"
import { dbConnect, recordAudit } from "@/lib/db"
import * as instance from "@/lib/instance"
import { getLocalUser } from "@/lib/local-user"
import * as appLogger from "@/lib/logger"
import * as appChannels from "@/lib/pusher/channels"
import { pusherRealtime } from "@nandobfer/integracoes/pusher/server"
import type { AcaoAuditoria } from "@/lib/db/models/AuditLog"
import { integrationsRegistry, type IntegrationId } from "@/features/integrations/registry/definitions"
import { OPEX_SERVER_ADAPTERS, OPEX_SCHEDULER_TICK_HOOKS } from "@/features/integrations/registry/server"
import type { IntegrationConfigMap } from "@/features/integrations/registry/config-map"

/**
 * Instância da central de integrações (`@nandobfer/integracoes`) no servidor do Opex — chamada UMA vez
 * por processo, no primeiro import. Injeta os serviços centrais do app: banco, cofre
 * (`INTEGRATIONS_ENCRYPTION_KEY`), auditoria, Pino, Pusher, o dono como ator e a guarda da prévia
 * (agendador desligado com `OPEX_PREVIEW`).
 */

/** Cofre do app; sem ele (módulo parcial nos testes), um cofre sem chave (fail-closed). */
const fallbackBox = createSecretBox({ key: () => undefined })
function box(): SecretBox {
    return readOptional(() => appSecretBox.secretBox) ?? fallbackBox
}

/** Lê um valor do app sem derrubar a central quando ele falta (módulo parcial nos testes). */
function readOptional<T>(read: () => T): T | undefined {
    try {
        return read()
    } catch {
        return undefined
    }
}

/**
 * Logger Pino do app para a central, lido a cada chamada (o módulo `@/lib/logger` pode ser trocado
 * nos testes; um logger ausente não derruba a operação).
 */
function centralLogger(): IntegrationsLogger {
    const call = (level: keyof IntegrationsLogger) => (obj: unknown, msg?: string) => {
        try {
            const target = appLogger.logger as unknown as IntegrationsLogger
            ;(target[level] ?? target.info).call(target, obj, msg)
        } catch {
            // sem logger (teste com `@/lib/logger` parcial): segue sem registrar
        }
    }
    return { info: call("info"), warn: call("warn"), error: call("error"), debug: call("debug") }
}

/**
 * Testes (Vitest): sem configuração salva nem provedores customizados — cada integração resolve pelo
 * ambiente e pelos padrões (`OPEX_INTEGRATIONS_STORE=memory`, definido no setup), sem tocar no Mongo.
 */
const MEMORY_STORE = process.env.OPEX_INTEGRATIONS_STORE === "memory"

export const integrations = createIntegrationsServer<IntegrationConfigMap>({
    registry: integrationsRegistry,
    adapters: MEMORY_STORE ? OPEX_SERVER_ADAPTERS.map((adapter) => (adapter.dynamicChildren ? { ...adapter, dynamicChildren: async () => [] } : adapter)) : OPEX_SERVER_ADAPTERS,
    connect: async () => {
        await dbConnect()
    },
    // Lidos a cada chamada: o cofre e os eventos do app são os mesmos módulos que o resto do Opex usa.
    secretBox: {
        isConfigured: () => box().isConfigured(),
        fingerprint: () => box().fingerprint(),
        deriveSubkey: (purpose) => box().deriveSubkey(purpose),
        encrypt: (plain) => box().encrypt(plain),
        decrypt: (encrypted) => box().decrypt(encrypted),
    },
    audit: (entry) => recordAudit({ ...entry, acao: entry.acao as AcaoAuditoria }),
    logger: centralLogger(),
    realtime: { ...pusherRealtime, publishAppEvent: (event, payload) => appChannels.publishAppEvent(event as never, payload as never) },
    // O acesso é barrado antes pelo middleware (sessão do dono); toda ação é do usuário local.
    authorize: async () => ({ id: getLocalUser().id }),
    basePath: process.env.NEXT_PUBLIC_BASE_PATH,
    port: process.env.PORT,
    isSchedulerDisabled: () => readOptional(() => instance.isPreviewInstance()) === true,
    schedulerTickHooks: OPEX_SCHEDULER_TICK_HOOKS,
    afterResponse: (task) => after(task),
    systemActorId: getLocalUser().id,
    // Persistência: o adaptador Mongoose da biblioteca (padrão, carregado sob demanda), nas coleções de sempre.
    // Nos testes, a leitura das configurações volta vazia e o resto delega ao adaptador (que os testes simulam).
    ...(MEMORY_STORE ? { persistence: extendPersistence({ configs: { list: async () => [] } }) } : {}),
    instanceId: readOptional(() => instance.INSTANCE_ID),
})

configureIaServer({
    async onPrimaryKeyChanged(provider, integrationId) {
        const { AI_API_KEY_ENGRAMIND_PROVIDERS } = await import("@/features/integrations/registry/definitions")
        if (!(AI_API_KEY_ENGRAMIND_PROVIDERS as readonly string[]).includes(provider)) return
        const { syncEngramindProviderKey } = await import("@/features/engramind/server/ai-source")
        await syncEngramindProviderKey(integrationId as Parameters<typeof syncEngramindProviderKey>[0])
    },
})

export type ResolvedIntegration<Id extends IntegrationId = IntegrationId> = LibResolvedIntegration<IntegrationConfigMap[Id]> & { id: Id }

/** Configuração resolvida (banco → ambiente → padrão), tipada pelo mapa do Opex. */
export const getIntegration = <Id extends IntegrationId>(id: Id) => integrations.getIntegration(id) as Promise<ResolvedIntegration<Id>>

/** Só os valores resolvidos. */
export const getIntegrationConfig = <Id extends IntegrationId>(id: Id): Promise<IntegrationConfigMap[Id]> => integrations.getIntegrationConfig(id)
