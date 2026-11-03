import { FinanceService } from "@/lib/db/models/FinanceService"
import { logger } from "@/lib/logger"

/**
 * OPE-125: a data do serviço (`serviceDate`, sem hora) era gravada à **meia-noite UTC**, que em
 * America/Sao_Paulo é o dia anterior — o serviço aparecia um dia antes e saía do 1º dia do período.
 * Agora ela é gravada ao **meio-dia UTC** (`serviceDateFromInput`); esta migração move os registros
 * antigos (exatamente 00:00:00.000 UTC, o único valor que o código anterior gravava) para o meio-dia
 * do mesmo dia. Idempotente: depois de movido, o registro não atende mais o filtro.
 */

/** Meia-noite → meio-dia UTC (mesma hora de `SERVICE_DATE_UTC_HOUR`, em `src/features/services/logic.ts`). */
const SHIFT_MS = 12 * 60 * 60 * 1000

/** Registros com `serviceDate` exatamente à meia-noite UTC. */
export const MIDNIGHT_UTC_SERVICE_FILTER = {
    $expr: {
        $and: [
            { $eq: [{ $hour: "$serviceDate" }, 0] },
            { $eq: [{ $minute: "$serviceDate" }, 0] },
            { $eq: [{ $second: "$serviceDate" }, 0] },
            { $eq: [{ $millisecond: "$serviceDate" }, 0] },
        ],
    },
}

/** Pipeline de atualização: mesmo dia, meio-dia UTC. */
export const SERVICE_DATE_TO_NOON_UPDATE = [{ $set: { serviceDate: { $add: ["$serviceDate", SHIFT_MS] } } }]

export async function normalizeServiceDates(): Promise<void> {
    const result = await FinanceService.updateMany(MIDNIGHT_UTC_SERVICE_FILTER, SERVICE_DATE_TO_NOON_UPDATE, { updatePipeline: true })
    if (result.modifiedCount > 0) logger.warn({ modified: result.modifiedCount }, "[migration] datas de serviços movidas para o meio-dia UTC")
}
