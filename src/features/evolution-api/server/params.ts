import { DomainError } from "@/lib/api/route"
import { instanceNameSchema } from "../schemas"

/** Nome da instância vindo da URL (validado). */
export function instanceParam(raw: string): string {
    const parsed = instanceNameSchema.safeParse(decodeURIComponent(raw))
    if (!parsed.success) throw new DomainError(400, "Nome de instância inválido", "EVOLUTION_INVALID_INSTANCE")
    return parsed.data
}
