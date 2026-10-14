import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { clientActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(clientActorFromRequest)

/** Lê o `.env` real do host (valores sensíveis nunca são devolvidos). */
export const GET = handlers.getEnvFile
/** Aplica alterações no `.env` real (variáveis sensíveis só pelo dono). */
export const PUT = handlers.updateEnvFile
