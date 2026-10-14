import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { ownerActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(ownerActorFromRequest)

/** Branches reais do repositório (seletor com busca da branch do ambiente e do CI/CD). */
export const GET = handlers.listBranches
