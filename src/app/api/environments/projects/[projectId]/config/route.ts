import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { ownerActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(ownerActorFromRequest)

/** Atualiza a configuração de execução do repositório (segredos só pelo dono). */
export const PUT = handlers.updateRepoConfig
