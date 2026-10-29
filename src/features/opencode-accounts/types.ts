import { z } from "zod"
import type { FormField } from "@opencode/client"
import { OPENCODE_ACCOUNT_LABEL_MAX } from "./constants"

/** Contratos das contas dos providers do OpenCode (tela e API). Nenhum DTO carrega segredos. */

/** Campo de formulário de um método de login, como o OpenCode descreve (ex.: tipo de deploy do GitHub). */
export type OpencodeFormField = FormField

export type OpencodeAuthMethodDto =
    | { kind: "key"; id: "key"; label: string; fields: OpencodeFormField[] }
    | { kind: "oauth"; id: string; label: string; fields: OpencodeFormField[] }
    | { kind: "command"; id: string; label: string; command: string[] }

export interface OpencodeAccountDto {
    id: string
    label: string
    method: "key" | "oauth"
    active: boolean
    /** Mensagem do OpenCode quando a conta precisa ser autenticada de novo. */
    needsAuth: string | null
}

export interface OpencodeEnvConnectionDto {
    name: string
    needsAuth: string | null
}

export interface OpencodeAuthProviderDto {
    /** Id da integração no OpenCode (ex.: `anthropic`). */
    id: string
    name: string
    /** Providers do OpenCode que usam esta integração. */
    providers: string[]
    methods: OpencodeAuthMethodDto[]
    /** Variáveis de ambiente que o OpenCode aceita para este provider (somente leitura aqui). */
    envNames: string[]
    accounts: OpencodeAccountDto[]
    envConnections: OpencodeEnvConnectionDto[]
    activeAccountId: string | null
    connected: boolean
}

export type OpencodeLoginStatus = "pending" | "complete" | "failed" | "expired"

export interface OpencodeLoginStatusDto {
    status: OpencodeLoginStatus
    message: string | null
}

export interface OpencodeOauthAttemptDto {
    attemptId: string
    url: string
    instructions: string
    /** `code`: o usuário cola o código; `auto`: o OpenCode conclui sozinho (código de dispositivo). */
    mode: "auto" | "code"
    expiresAt: number
}

export interface OpencodeCommandAttemptDto {
    attemptId: string
    expiresAt: number
}

const formValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])
export const formAnswerInputSchema = z.record(z.string(), formValueSchema)
export type OpencodeFormAnswer = z.infer<typeof formAnswerInputSchema>

const labelSchema = z.string().trim().max(OPENCODE_ACCOUNT_LABEL_MAX, `Use até ${OPENCODE_ACCOUNT_LABEL_MAX} caracteres`).optional()

export const keyConnectSchema = z.object({
    key: z.string().trim().min(1, "Informe a chave"),
    label: labelSchema,
    answer: formAnswerInputSchema.optional(),
})
export type KeyConnectInput = z.infer<typeof keyConnectSchema>

export const oauthStartSchema = z.object({
    methodId: z.string().min(1),
    label: labelSchema,
    answer: formAnswerInputSchema.optional(),
})
export type OauthStartInput = z.infer<typeof oauthStartSchema>

export const oauthCompleteSchema = z.object({ code: z.string().trim().min(1, "Cole o código recebido") })
export type OauthCompleteInput = z.infer<typeof oauthCompleteSchema>

export const commandStartSchema = z.object({ methodId: z.string().min(1), label: labelSchema })
export type CommandStartInput = z.infer<typeof commandStartSchema>

export const renameAccountSchema = z.object({
    label: z.string().trim().min(1, "Informe o nome da conta").max(OPENCODE_ACCOUNT_LABEL_MAX, `Use até ${OPENCODE_ACCOUNT_LABEL_MAX} caracteres`),
})
export type RenameAccountInput = z.infer<typeof renameAccountSchema>
