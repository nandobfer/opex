import { after } from "next/server"
import { createIntegrationsServer, type ResolvedIntegration as LibResolvedIntegration } from "@nandobfer/integracoes/server"
import { configureIaServer } from "@nandobfer/integracoes/ia/server"
import { recordAudit } from "@/lib/audit/record"
import { secretBox } from "@/lib/crypto/secretBox"
import { dbConnect } from "@/lib/db"
import { INSTANCE_ID, isPreviewInstance } from "@/lib/instance"
import { getLocalUser } from "@/lib/local-user"
import { logger } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
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

export const integrations = createIntegrationsServer<IntegrationConfigMap>({
    registry: integrationsRegistry,
    adapters: OPEX_SERVER_ADAPTERS,
    connect: async () => {
        await dbConnect()
    },
    secretBox,
    audit: (entry) => recordAudit({ ...entry, acao: entry.acao as AcaoAuditoria }),
    logger,
    realtime: { ...pusherRealtime, publishAppEvent },
    // O acesso é barrado antes pelo middleware (sessão do dono); toda ação é do usuário local.
    authorize: async () => ({ id: getLocalUser().id }),
    basePath: process.env.NEXT_PUBLIC_BASE_PATH,
    port: process.env.PORT,
    isSchedulerDisabled: isPreviewInstance,
    schedulerTickHooks: OPEX_SCHEDULER_TICK_HOOKS,
    afterResponse: (task) => after(task),
    systemActorId: getLocalUser().id,
    // Testes (Vitest): sem configuração salva, cada integração resolve pelo ambiente e pelos padrões
    // (`OPEX_INTEGRATIONS_STORE=memory`, definido no setup), sem conectar ao Mongo.
    ...(process.env.OPEX_INTEGRATIONS_STORE === "memory" ? { loadConfigs: async () => new Map() } : {}),
    instanceId: INSTANCE_ID,
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
