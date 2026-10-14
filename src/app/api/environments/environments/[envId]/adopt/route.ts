import { createEnvironmentHandlers } from "@/features/environments/server/route-handlers"
import { ownerActorFromRequest } from "@/features/environments/server/request-actor"

const handlers = createEnvironmentHandlers(ownerActorFromRequest)

/** Adota o projeto Compose existente (não reinicia nem recria containers). */
export const POST = handlers.adoptCompose
