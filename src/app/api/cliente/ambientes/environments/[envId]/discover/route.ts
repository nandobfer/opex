import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { clientActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(clientActorFromRequest)

/** Descobre o projeto Compose já em execução no host que corresponde ao ambiente. */
export const GET = handlers.discoverCompose
