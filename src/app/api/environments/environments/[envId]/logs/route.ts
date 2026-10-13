import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { ownerActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(ownerActorFromRequest)

/** Logs do ambiente (histórico gravado, com cursor `after`). */
export const GET = handlers.listLogs
