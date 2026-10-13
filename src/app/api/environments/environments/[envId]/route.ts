import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { ownerActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(ownerActorFromRequest)

/** Ambiente (leitura, edição e exclusão). */
export const GET = handlers.getEnvironment
export const PATCH = handlers.updateEnvironment
export const DELETE = handlers.deleteEnvironment
