import { z } from "zod"

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Identificador inválido")
const path = z
    .string()
    .trim()
    .min(1, "Informe o diretório absoluto")
    .max(500)
    .regex(/^\/(?!.*(?:^|\/)\.\.(?:\/|$))[^\n\r\0]*$/, "Use um caminho absoluto sem ..")
const slug = z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use letras minúsculas, números e hífen")
export const environmentSettingsSchema = z
    .object({
        enabled: z.boolean(),
        agent: z.string().trim().max(100).nullable(),
        model: z.string().trim().max(200).nullable(),
        variant: z.string().trim().max(100).nullable(),
        skill: z
            .string()
            .trim()
            .max(100)
            .regex(/^[\w.-]*$/, "Skill inválida"),
        instructions: z.string().max(8000),
        sessionDirectory: path,
        accessDirectory: path,
        timeoutMinutes: z.number().int().min(1).max(240),
    })
    .strict()
/** Chaves de versões anteriores da configuração (entrega por HTTP), descartadas ao carregar. */
const LEGACY_ENVIRONMENT_SETTINGS_KEYS = ["agentBaseUrl", "accessTokenTtlMinutes"] as const
/** Configuração salva: chaves legadas não podem invalidar (e desligar) o módulo. */
export const storedEnvironmentSettingsSchema = z.preprocess((input) => {
    if (!input || typeof input !== "object") return input
    const clean: Record<string, unknown> = { ...(input as Record<string, unknown>) }
    for (const key of LEGACY_ENVIRONMENT_SETTINGS_KEYS) delete clean[key]
    return clean
}, environmentSettingsSchema)
export const DEFAULT_ENVIRONMENT_SETTINGS = {
    enabled: false,
    agent: null,
    model: null,
    variant: null,
    skill: "",
    instructions: "",
    sessionDirectory: "/tmp",
    accessDirectory: "/tmp/opex-environments",
    timeoutMinutes: 60,
} satisfies z.infer<typeof environmentSettingsSchema>

export const repoConfigSchema = z
    .object({
        mode: z.enum(["local", "remote"]),
        host: z.string().trim().max(253),
        port: z.number().int().min(1).max(65535),
        username: z.string().trim().max(100),
        auth: z.enum(["key", "password"]),
        hostKey: z.string().trim().max(2000),
        workflow: z.string().trim().max(200),
    })
    .strict()
    .superRefine((value, ctx) => {
        if (value.mode === "remote")
            for (const name of ["host", "username", "hostKey"] as const) {
                if (!value[name])
                    ctx.addIssue({ code: "custom", path: [name], message: "Obrigatório no acesso remoto" })
            }
    })
export const DEFAULT_REPO_CONFIG = {
    mode: "local",
    host: "",
    port: 22,
    username: "",
    auth: "key",
    hostKey: "",
    workflow: "",
} satisfies z.infer<typeof repoConfigSchema>
export const secretInputSchema = z
    .object({
        password: z.string().min(1).max(16000).optional(),
        privateKey: z.string().min(1).max(32000).optional(),
        passphrase: z.string().max(16000).optional(),
    })
    .strict()

export const environmentSchema = z
    .object({
        name: z.string().trim().min(1, "Informe o nome").max(100),
        slug,
        branch: z
            .string()
            .trim()
            .min(1)
            .max(200)
            .regex(/^[\w./-]+$/, "Branch inválida"),
        directory: path,
        composeFile: z
            .string()
            .trim()
            .min(1)
            .max(300)
            .regex(/^[\w./-]+$/, "Arquivo inválido")
            .refine((v) => !v.split("/").includes("..") && !v.startsWith("/"), "Use arquivo relativo ao repositório"),
        services: z.array(z.string().regex(/^[\w-]+$/)).max(50),
        port: z.number().int().min(1).max(65535).nullable(),
        cpus: z.number().positive().max(128).nullable(),
        memoryMb: z.number().int().min(64).max(1048576).nullable(),
        variables: z
            .array(
                z
                    .object({
                        name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
                        value: z.string().max(16000),
                        secret: z.boolean(),
                    })
                    .strict(),
            )
            .max(100),
        healthcheck: z
            .string()
            .trim()
            .max(500)
            .refine((v) => !v || /^https?:\/\//.test(v), "Use uma URL http ou https"),
        healthcheckTimeout: z.number().int().min(1).max(600),
    })
    .strict()
    .superRefine((v, ctx) => {
        if (new Set(v.variables.map((x) => x.name)).size !== v.variables.length)
            ctx.addIssue({ code: "custom", path: ["variables"], message: "Variáveis duplicadas" })
    })
export const DEFAULT_ENVIRONMENT = {
    name: "",
    slug: "",
    branch: "main",
    directory: "/srv/",
    composeFile: "docker-compose.yml",
    services: [],
    port: null,
    cpus: null,
    memoryMb: null,
    variables: [],
    healthcheck: "",
    healthcheckTimeout: 60,
} satisfies z.infer<typeof environmentSchema>

export const operationInputSchema = z
    .object({
        kind: z.enum(["inspect", "publish", "restore"]),
        method: z.enum(["host", "cd"]),
        confirmation: z.literal(true),
        riskConfirmed: z.boolean(),
        imageId: objectIdSchema.optional(),
        expectedRevision: z.number().int().nonnegative(),
        requestId: z.string().uuid(),
    })
    .strict()

export const agentResultSchema = z
    .object({
        verified: z.boolean(),
        healthy: z.boolean(),
        quiescent: z.boolean(),
        dbVersion: z.string().max(200).nullable(),
        databaseCertain: z.boolean(),
        evidence: z.array(z.string().max(2000)).min(1).max(100),
        migrations: z.array(z.string().max(1000)).max(100),
        images: z
            .array(
                z.object({
                    service: z.string().max(100),
                    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
                    builtAt: z.string().datetime().nullable(),
                    tag: z.string().max(300),
                    version: z.string().max(200),
                }),
            )
            .max(50),
        compose: z
            .array(
                z.object({
                    service: z.string().max(100),
                    image: z.string().max(300),
                    ports: z.array(z.string().max(100)),
                    volumes: z.array(z.string().max(300)),
                    variables: z.array(z.string().max(100)),
                }),
            )
            .max(50),
    })
    .strict()
export const agentCheckpointSchema = z
    .object({
        stage: z.string().max(100),
        dbVersion: z.string().max(200).nullable(),
        databaseCertain: z.boolean(),
        migrations: z.array(z.string().max(1000)).max(100),
        evidence: z.array(z.string().max(2000)).min(1).max(100),
    })
    .strict()
/** Resposta do turno curto do agente que identifica a versão do banco. */
export const dbEvidenceSchema = z
    .object({
        dbVersion: z.string().max(200).nullable(),
        databaseCertain: z.boolean(),
        migrations: z.array(z.string().max(1000)).max(100),
        evidence: z.array(z.string().max(2000)).max(100),
    })
    .strict()
export type DbEvidence = z.infer<typeof dbEvidenceSchema>
export type EnvironmentInput = z.infer<typeof environmentSchema>
export type RepoConfigInput = z.infer<typeof repoConfigSchema>
export type EnvironmentSettings = z.infer<typeof environmentSettingsSchema>
export type OperationInput = z.infer<typeof operationInputSchema>
export type AgentResult = z.infer<typeof agentResultSchema>
