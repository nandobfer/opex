import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { ownerActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(ownerActorFromRequest)

/** Lê o `.env` real do host (valores sensíveis nunca são devolvidos). */
export const GET = handlers.getEnvFile
/** Aplica alterações no `.env` real do host (segredos só pelo dono). */
export const PUT = handlers.updateEnvFile
