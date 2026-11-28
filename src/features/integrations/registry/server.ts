import type { IntegrationServerAdapter } from "@nandobfer/integracoes/server"
import { pusherServer } from "@nandobfer/integracoes/pusher/server"
import { smtpServer } from "@nandobfer/integracoes/smtp/server"
import { storageS3Server } from "@nandobfer/integracoes/storage-s3/server"
import { gotenbergServer } from "@nandobfer/integracoes/gotenberg/server"
import { aiCostServerAdapters, aiServerAdapters } from "@nandobfer/integracoes/ia/server"
import { cronsAdapter, OPEX_SCHEDULER_TICK_HOOKS } from "../adapters/crons.server"
import { githubAdapter } from "../adapters/github.server"
import { internalApiAdapter } from "../adapters/internal-api.server"
import { orcamentosAdapter } from "../adapters/orcamentos.server"
import { builderMachineAdapter, engramindAdapter, evolutionAdapter } from "../adapters/opex.server"

/**
 * Partes de servidor das integrações do Opex (testes, rotas, rotinas e ganchos), ligadas às
 * definições de `definitions.ts` pelo `id`. Consumido só por `src/lib/integrations/runtime.ts`.
 */
export const OPEX_SERVER_ADAPTERS: readonly IntegrationServerAdapter[] = [
    pusherServer(),
    internalApiAdapter,
    cronsAdapter,
    githubAdapter,
    ...aiServerAdapters(),
    orcamentosAdapter,
    smtpServer(),
    storageS3Server(),
    builderMachineAdapter,
    engramindAdapter,
    evolutionAdapter,
    ...aiCostServerAdapters(),
    gotenbergServer(),
] as IntegrationServerAdapter[]

export { OPEX_SCHEDULER_TICK_HOOKS }
