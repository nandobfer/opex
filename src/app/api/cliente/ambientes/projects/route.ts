import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { clientActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(clientActorFromRequest)

/** Repositórios vinculados ao cliente. */
export const GET = handlers.listProjects
