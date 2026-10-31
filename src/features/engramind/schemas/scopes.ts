import { z } from "zod"
import { combinationOf, ENGRAMIND_SCOPES } from "../constants"

/** Escopos de um token ou acesso de assinatura: só `read`, `read+write`, `read+delete` ou `read+write+delete`. */
export const scopesSchema = z
    .array(z.enum(ENGRAMIND_SCOPES))
    .min(1, "Escolha os escopos")
    .max(3)
    .refine((scopes) => combinationOf(scopes) !== null, "Combinações aceitas: read, read+write, read+delete ou read+write+delete (write e delete exigem read)")
