import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { clientActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(clientActorFromRequest)

export const GET = handlers.getEnvironment
export const PATCH = handlers.updateEnvironment
export const DELETE = handlers.deleteEnvironment
