import { describe, expect, it } from "vitest"
import type { CredentialEntry, IntegrationInfo, ProviderInfo } from "@opencode/client"
import { addAccountFormSchema } from "@/features/opencode-accounts/form-schema"
import { activeFormFields, cleanFormAnswer, defaultFormAnswer, formAnswerSchema, mergeAuthProviders, usesLocalCallback, visibleFormFields } from "@/features/opencode-accounts/logic"
import type { OpencodeFormField } from "@/features/opencode-accounts/types"

const integrations = [
    { id: "zeta", name: "Zeta AI", methods: [{ type: "key" }], connections: [] },
    {
        id: "anthropic",
        name: "Anthropic",
        methods: [{ type: "key" }, { type: "env", names: ["ANTHROPIC_API_KEY"] }, { id: "claude-max", type: "oauth", label: "Claude Pro/Max" }, { id: "aws", type: "external", label: "Desconhecido" }],
        connections: [
            { type: "credential", id: "cred_a", label: "Pessoal", method: "key" },
            { type: "credential", id: "cred_b", label: "Trabalho", method: "oauth", status: { status: "needs_auth", message: "Token expirado" } },
        ],
    },
    { id: "openai", name: "OpenAI", methods: [{ type: "env", names: ["OPENAI_API_KEY"] }], connections: [{ type: "env", name: "OPENAI_API_KEY" }] },
] as unknown as IntegrationInfo[]

const credentials: CredentialEntry[] = [
    { id: "cred_a", integrationID: "anthropic", label: "Pessoal", active: false, value: { type: "key", key: "sk-ant-SEGREDO" } },
    { id: "cred_b", integrationID: "anthropic", label: "Trabalho", active: true, value: { type: "oauth", methodID: "claude-max", refresh: "REFRESH-SEGREDO", access: "ACCESS-SEGREDO", expires: 1 } },
    { id: "cred_x", integrationID: "removido", label: "Antiga", active: true, value: { type: "key", key: "sk-ORFAO" } },
]

const providers = [{ id: "anthropic", integrationID: "anthropic", name: "Anthropic", activation: "enabled", package: "x" }] as ProviderInfo[]

describe("mergeAuthProviders", () => {
    const rows = mergeAuthProviders(integrations, credentials, providers)

    it("lista conectados primeiro, por nome, e marca a conta em uso", () => {
        expect(rows.map((row) => row.id)).toEqual(["anthropic", "openai", "removido", "zeta"])
        const anthropic = rows[0]!
        expect(anthropic.activeAccountId).toBe("cred_b")
        expect(anthropic.providers).toEqual(["Anthropic"])
        expect(anthropic.envNames).toEqual(["ANTHROPIC_API_KEY"])
        expect(anthropic.methods.map((method) => `${method.kind}:${method.id}`)).toEqual(["key:key", "oauth:claude-max"])
        expect(anthropic.accounts.find((account) => account.id === "cred_b")?.needsAuth).toBe("Token expirado")
        expect(rows.find((row) => row.id === "zeta")?.connected).toBe(false)
    })

    it("nunca devolve chave nem tokens das credenciais", () => {
        const json = JSON.stringify(rows)
        for (const secret of ["sk-ant-SEGREDO", "REFRESH-SEGREDO", "ACCESS-SEGREDO", "sk-ORFAO"]) expect(json).not.toContain(secret)
        expect(Object.keys(rows[0]!.accounts[0]!).sort()).toEqual(["active", "id", "label", "method", "needsAuth"])
    })

    it("separa a conexão por variável de ambiente e mantém credenciais órfãs", () => {
        const openai = rows.find((row) => row.id === "openai")!
        expect(openai.connected).toBe(true)
        expect(openai.envConnections).toEqual([{ name: "OPENAI_API_KEY", needsAuth: null }])
        expect(openai.accounts).toEqual([])
        expect(rows.find((row) => row.id === "removido")).toMatchObject({ connected: true, methods: [], activeAccountId: "cred_x" })
    })
})

const githubFields: OpencodeFormField[] = [
    { key: "deploymentType", title: "Tipo", required: true, type: "string", options: [{ value: "github.com", label: "GitHub.com" }, { value: "enterprise", label: "Enterprise" }] },
    { key: "enterpriseUrl", title: "URL", required: true, when: [{ key: "deploymentType", op: "eq", value: "enterprise" }], type: "string" },
    { key: "server", hidden: true, type: "string", default: "https://opencode.ai/console" },
    { key: "tier", type: "integer", minimum: 1, maximum: 3 },
]

describe("formulário dos métodos", () => {
    it("aplica as condições when e esconde os campos ocultos", () => {
        expect(visibleFormFields(githubFields, { deploymentType: "github.com" }).map((field) => field.key)).toEqual(["deploymentType", "tier"])
        expect(visibleFormFields(githubFields, { deploymentType: "enterprise" }).map((field) => field.key)).toEqual(["deploymentType", "enterpriseUrl", "tier"])
        expect(activeFormFields(githubFields, { deploymentType: "github.com" }).map((field) => field.key)).toContain("server")
        const neq: OpencodeFormField[] = [{ key: "a", type: "string", when: [{ key: "b", op: "neq", value: "x" }] }]
        expect(visibleFormFields(neq, { b: "x" })).toEqual([])
    })

    it("valida obrigatórios, opções e limites só dos campos ativos", () => {
        const schema = formAnswerSchema(githubFields)
        expect(schema.safeParse({ deploymentType: "github.com" }).success).toBe(true)
        const missing = schema.safeParse({ deploymentType: "enterprise", enterpriseUrl: "" })
        expect(missing.success).toBe(false)
        expect(missing.error?.issues[0]).toMatchObject({ path: ["enterpriseUrl"], message: "Campo obrigatório" })
        expect(schema.safeParse({ deploymentType: "outro" }).error?.issues[0]?.message).toBe("Escolha uma das opções")
        expect(schema.safeParse({ deploymentType: "github.com", tier: 5 }).error?.issues[0]?.message).toBe("O máximo é 3")
        expect(schema.safeParse({ deploymentType: "github.com", tier: 1.5 }).error?.issues[0]?.message).toBe("Informe um número inteiro")
    })

    it("parte dos padrões e envia só os campos ativos preenchidos", () => {
        const initial = defaultFormAnswer(githubFields)
        expect(initial).toEqual({ deploymentType: "", enterpriseUrl: "", server: "https://opencode.ai/console" })
        expect(cleanFormAnswer(githubFields, { ...initial, deploymentType: "github.com", enterpriseUrl: "sobrou.ghe.com" })).toEqual({ deploymentType: "github.com", server: "https://opencode.ai/console" })
        expect(cleanFormAnswer([], {})).toBeUndefined()
    })

    it("o formulário de chave exige a chave e valida os campos do método", () => {
        const schema = addAccountFormSchema({ kind: "key", id: "key", label: "Chave", fields: [] })
        expect(schema.safeParse({ key: " ", answer: {} }).success).toBe(false)
        expect(schema.safeParse({ key: "sk-1", label: "Pessoal", answer: {} }).success).toBe(true)
        const oauth = addAccountFormSchema({ kind: "oauth", id: "device", label: "GitHub", fields: githubFields })
        expect(oauth.safeParse({ answer: { deploymentType: "enterprise" } }).success).toBe(false)
    })
})

describe("usesLocalCallback", () => {
    it("bloqueia o retorno em localhost e libera código de dispositivo", () => {
        expect(usesLocalCallback("https://auth.openai.com/oauth/authorize?response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback")).toBe(true)
        expect(usesLocalCallback("http://127.0.0.1:4999/oauth/start")).toBe(true)
        expect(usesLocalCallback("https://github.com/login/device")).toBe(false)
        expect(usesLocalCallback("https://auth.openai.com/codex/device")).toBe(false)
        expect(usesLocalCallback("https://example.com/?next=https://localhost.example.com/x")).toBe(false)
    })
})
