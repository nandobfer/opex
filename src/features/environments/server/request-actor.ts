import type { NextRequest } from "next/server"
import { requireAdminSession, requireClientActor } from "@/features/auth/server/context"
import { fromClientActor, ownerActor, type EnvironmentActor } from "./actor"

/**
 * Resolve o **ator** do módulo Ambientes a partir da requisição: o dono (sessão `admin`) ou o
 * usuário de cliente (sessão `client`, com o cliente selecionado). Usado pelas rotas do dono e do
 * portal, que compartilham os mesmos handlers.
 */

export type EnvironmentActorResolver = (req: NextRequest) => Promise<EnvironmentActor>

export const ownerActorFromRequest: EnvironmentActorResolver = async (req) => {
    await requireAdminSession(req)
    return ownerActor()
}

export const clientActorFromRequest: EnvironmentActorResolver = async (req) => {
    return fromClientActor(await requireClientActor(req))
}
