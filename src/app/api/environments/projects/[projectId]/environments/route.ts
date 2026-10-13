import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { ownerActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(ownerActorFromRequest)

/** Ambientes do repositório. */
export const GET = handlers.listEnvironments
export const POST = handlers.createEnvironment
