import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { clientActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(clientActorFromRequest)

/** Adota o projeto Compose existente (não reinicia nem recria containers). */
export const POST = handlers.adoptCompose
