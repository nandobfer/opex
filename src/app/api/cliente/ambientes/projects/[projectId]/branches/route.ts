import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { clientActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(clientActorFromRequest)

/** Branches reais do repositório vinculado (seletor com busca). */
export const GET = handlers.listBranches
