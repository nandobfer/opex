import { formAnswerSchema } from "./logic"
import { commandStartSchema, keyConnectSchema, oauthStartSchema, type OpencodeAuthMethodDto, type OpencodeFormAnswer } from "./types"

/** Valores do formulário "Adicionar conta" (o mesmo para os três tipos de método). */
export interface AddAccountFormValues {
    label?: string
    key?: string
    answer: OpencodeFormAnswer
}

/**
 * Schema do formulário "Adicionar conta" de um método: o corpo da API (`keyConnectSchema`,
 * `oauthStartSchema`, `commandStartSchema`) com a resposta validada pelo formulário que o OpenCode
 * descreve para o método.
 */
export function addAccountFormSchema(method: OpencodeAuthMethodDto) {
    if (method.kind === "key") return keyConnectSchema.extend({ answer: formAnswerSchema(method.fields) })
    if (method.kind === "oauth") return oauthStartSchema.omit({ methodId: true }).extend({ answer: formAnswerSchema(method.fields) })
    return commandStartSchema.omit({ methodId: true }).extend({ answer: formAnswerSchema([]) })
}
