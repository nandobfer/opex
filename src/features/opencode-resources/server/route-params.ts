import { DomainError } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { OPENCODE_RESOURCE_KINDS, type OpencodeResourceKind } from "../constants"
import type { ResourceActor } from "./service"
import { parseResourceId } from "./service"

/** Parâmetros das rotas `/api/ai/providers/opencode/resources/[kind]/...`. */

export function kindParam(kind: string): OpencodeResourceKind {
    if (!(OPENCODE_RESOURCE_KINDS as readonly string[]).includes(kind)) throw new DomainError(404, "Tipo de recurso desconhecido", "OPENCODE_RESOURCE_KIND_NOT_FOUND")
    return kind as OpencodeResourceKind
}

/** O id precisa ser do tipo da URL. */
export function idParam(kind: string, id: string): string {
    const key = parseResourceId(id)
    if (key.kind !== kindParam(kind)) throw new DomainError(400, "O id não é deste tipo de recurso", "OPENCODE_RESOURCE_ID_INVALID")
    return id
}

export const uiActor = (): ResourceActor => ({ id: getLocalUser().id, origin: "ui" })
