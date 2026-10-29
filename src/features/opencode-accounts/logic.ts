import { z } from "zod"
import type { CredentialEntry, IntegrationInfo, ProviderInfo } from "@opencode/client"
import { OPENCODE_METHOD_KIND_LABELS } from "./constants"
import type { OpencodeAccountDto, OpencodeAuthMethodDto, OpencodeAuthProviderDto, OpencodeFormAnswer, OpencodeFormField } from "./types"

/** Regras puras das contas dos providers do OpenCode: junção das listas, formulários dos métodos e OAuth. */

type AnswerValue = OpencodeFormAnswer[string]

function toMethods(integration: IntegrationInfo): { methods: OpencodeAuthMethodDto[]; envNames: string[] } {
    const methods: OpencodeAuthMethodDto[] = []
    const envNames: string[] = []
    // O servidor pode trazer tipos de método que esta versão do cliente não conhece: são ignorados.
    for (const method of integration.methods ?? []) {
        if (method.type === "key") methods.push({ kind: "key", id: "key", label: method.label ?? OPENCODE_METHOD_KIND_LABELS.key, fields: [...(method.form ?? [])] })
        else if (method.type === "oauth") methods.push({ kind: "oauth", id: method.id, label: method.label ?? method.id, fields: [...(method.form ?? [])] })
        else if (method.type === "command") methods.push({ kind: "command", id: method.id, label: method.label ?? method.id, command: [...(method.command ?? [])] })
        else if (method.type === "env" && Array.isArray(method.names)) envNames.push(...method.names)
    }
    return { methods, envNames }
}

/** Conta sem o valor da credencial: `key`, `refresh` e `access` nunca saem do servidor. */
function toAccount(credential: CredentialEntry, needsAuth: string | null): OpencodeAccountDto {
    return { id: credential.id, label: credential.label, method: credential.value.type, active: credential.active, needsAuth }
}

/**
 * Junta integrações, credenciais e providers do OpenCode numa linha por provider, conectados
 * primeiro e depois por nome. Credenciais de integração que o OpenCode não listou viram uma linha
 * própria (ainda dá para selecionar, renomear ou remover).
 */
export function mergeAuthProviders(integrations: readonly IntegrationInfo[], credentials: readonly CredentialEntry[], providers: readonly ProviderInfo[]): OpencodeAuthProviderDto[] {
    const byIntegration = new Map<string, CredentialEntry[]>()
    for (const credential of credentials) byIntegration.set(credential.integrationID, [...(byIntegration.get(credential.integrationID) ?? []), credential])

    const rows = integrations.map((integration): OpencodeAuthProviderDto => {
        const needsAuth = new Map<string, string>()
        const envConnections: OpencodeAuthProviderDto["envConnections"] = []
        for (const connection of integration.connections ?? []) {
            const message = connection.status?.status === "needs_auth" ? connection.status.message : null
            if (connection.type === "env") envConnections.push({ name: connection.name, needsAuth: message })
            else if (message) needsAuth.set(connection.id, message)
        }
        const accounts = (byIntegration.get(integration.id) ?? []).map((credential) => toAccount(credential, needsAuth.get(credential.id) ?? null))
        byIntegration.delete(integration.id)
        const { methods, envNames } = toMethods(integration)
        return {
            id: integration.id,
            name: integration.name,
            providers: providers.filter((provider) => provider.integrationID === integration.id).map((provider) => provider.name),
            methods,
            envNames,
            accounts,
            envConnections,
            activeAccountId: accounts.find((account) => account.active)?.id ?? null,
            connected: accounts.length > 0 || envConnections.length > 0,
        }
    })

    for (const [integrationId, orphans] of byIntegration) {
        const accounts = orphans.map((credential) => toAccount(credential, null))
        rows.push({ id: integrationId, name: integrationId, providers: [], methods: [], envNames: [], accounts, envConnections: [], activeAccountId: accounts.find((account) => account.active)?.id ?? null, connected: true })
    }

    return rows.sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
}

function matches(field: OpencodeFormField, answer: OpencodeFormAnswer): boolean {
    if (field.type === "external" || !field.when) return true
    return field.when.every((rule) => {
        const equal = answer[rule.key] === rule.value
        return rule.op === "eq" ? equal : !equal
    })
}

/** Campos que valem para a resposta atual (condições `when` atendidas), incluindo os ocultos. */
export function activeFormFields(fields: readonly OpencodeFormField[], answer: OpencodeFormAnswer): OpencodeFormField[] {
    return fields.filter((field) => matches(field, answer))
}

/** Campos que o usuário preenche ou vê (sem os ocultos). */
export function visibleFormFields(fields: readonly OpencodeFormField[], answer: OpencodeFormAnswer): OpencodeFormField[] {
    return activeFormFields(fields, answer).filter((field) => field.type === "external" || !field.hidden)
}

const finite = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined)

/** Valores iniciais do formulário de um método (padrões do OpenCode; texto vazio; booleano falso). */
export function defaultFormAnswer(fields: readonly OpencodeFormField[]): OpencodeFormAnswer {
    const answer: OpencodeFormAnswer = {}
    for (const field of fields) {
        if (field.type === "string") answer[field.key] = field.default ?? ""
        else if (field.type === "boolean") answer[field.key] = field.default ?? false
        else if (field.type === "multiselect") answer[field.key] = [...(field.default ?? [])]
        else if (field.type === "number" || field.type === "integer") {
            const value = finite(field.default)
            if (value !== undefined) answer[field.key] = value
        }
    }
    return answer
}

const isEmpty = (value: AnswerValue | undefined) => value === undefined || value === "" || (Array.isArray(value) && value.length === 0)

/** Resposta enviada ao OpenCode: só campos ativos e preenchidos (ocultos levam o padrão). */
export function cleanFormAnswer(fields: readonly OpencodeFormField[], answer: OpencodeFormAnswer): OpencodeFormAnswer | undefined {
    const result: OpencodeFormAnswer = {}
    for (const field of activeFormFields(fields, answer)) {
        if (field.type === "external") continue
        const value = answer[field.key]
        if (isEmpty(value)) continue
        result[field.key] = typeof value === "string" ? value.trim() : (value as AnswerValue)
    }
    return Object.keys(result).length > 0 ? result : undefined
}

function fieldError(field: OpencodeFormField, value: AnswerValue | undefined): string | null {
    if (field.type === "external") return null
    if (isEmpty(value)) return field.required ? "Campo obrigatório" : null
    switch (field.type) {
        case "string": {
            if (typeof value !== "string") return "Valor inválido"
            const text = value.trim()
            if (field.options && field.options.length > 0 && !field.custom && !field.options.some((option) => option.value === text)) return "Escolha uma das opções"
            if (field.minLength !== undefined && text.length < field.minLength) return `Use ao menos ${field.minLength} caracteres`
            if (field.maxLength !== undefined && text.length > field.maxLength) return `Use até ${field.maxLength} caracteres`
            if (field.pattern) {
                try {
                    if (!new RegExp(field.pattern).test(text)) return "Formato inválido"
                } catch {
                    return null
                }
            }
            return null
        }
        case "number":
        case "integer": {
            if (typeof value !== "number" || !Number.isFinite(value)) return "Informe um número"
            if (field.type === "integer" && !Number.isInteger(value)) return "Informe um número inteiro"
            const minimum = finite(field.minimum)
            const maximum = finite(field.maximum)
            if (minimum !== undefined && value < minimum) return `O mínimo é ${minimum}`
            if (maximum !== undefined && value > maximum) return `O máximo é ${maximum}`
            return null
        }
        case "boolean":
            return typeof value === "boolean" ? null : "Valor inválido"
        case "multiselect": {
            if (!Array.isArray(value)) return "Valor inválido"
            if (!field.custom && value.some((item) => !field.options.some((option) => option.value === item))) return "Escolha uma das opções"
            if (field.minItems !== undefined && value.length < field.minItems) return `Escolha ao menos ${field.minItems}`
            if (field.maxItems !== undefined && value.length > field.maxItems) return `Escolha até ${field.maxItems}`
            return null
        }
    }
}

/** Schema Zod da resposta de um método, a partir do formulário que o OpenCode descreve (tela e servidor). */
export function formAnswerSchema(fields: readonly OpencodeFormField[]) {
    return z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).superRefine((answer, ctx) => {
        for (const field of activeFormFields(fields, answer)) {
            const message = fieldError(field, answer[field.key])
            if (message) ctx.addIssue({ code: "custom", path: [field.key], message })
        }
    })
}

const LOCAL_HOST = /(?:^|[/@.:=])(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?=[:/?#&]|$)/i

function safeDecode(text: string): string {
    try {
        return decodeURIComponent(text)
    } catch {
        return text
    }
}

/**
 * O login conclui por um callback na máquina do OpenCode (`localhost` na própria URL ou no
 * `redirect_uri`)? Pelo navegador de outra máquina esse redirecionamento não chega, então o app não
 * oferece esse login. Fluxos de código de dispositivo (ex.: github.com/login/device) passam.
 */
export function usesLocalCallback(url: string): boolean {
    const decoded = safeDecode(safeDecode(url))
    try {
        const parsed = new URL(decoded)
        if (LOCAL_HOST.test(`//${parsed.hostname}`)) return true
        for (const value of parsed.searchParams.values()) if (LOCAL_HOST.test(value)) return true
    } catch {
        return LOCAL_HOST.test(decoded)
    }
    return false
}
