import { z } from "zod"
import {
    DEFAULT_COMPOSE_FILE,
    DEFAULT_ENV_FILE,
    DEFAULT_HEALTHCHECK_PATH,
    DEFAULT_HEALTHCHECK_TIMEOUT_MS,
    DEFAULT_SSH_PORT,
    MAX_ENV_FILE_BYTES,
    MAX_ENV_VARS,
    MAX_HEALTHCHECK_TIMEOUT_MS,
    MIN_HEALTHCHECK_TIMEOUT_MS,
} from "./constants"

/**
 * Schemas Zod do módulo Ambientes. São a fonte única dos contratos (mesmo schema no formulário e
 * na API). Segredos nunca trafegam como campo público: entram por `secretInputSchema` e a API só
 * devolve a situação (`configured`/`unreadable`).
 */

export const environmentModeSchema = z.enum(["local", "remote"])
export const sshAuthMethodSchema = z.enum(["key", "password"])

/** Operação sobre um segredo: `set` substitui o valor; `clear` remove. Ausente = mantém. */
export const secretInputSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("set"), value: z.string().min(1, "Informe um valor").max(20_000) }),
    z.object({ action: z.literal("clear") }),
])
export type SecretInput = z.infer<typeof secretInputSchema>

export const environmentRepoSecretsSchema = z.object({
    sshPassword: secretInputSchema.optional(),
    sshPrivateKey: secretInputSchema.optional(),
    sshPassphrase: secretInputSchema.optional(),
})
export type EnvironmentRepoSecretsInput = z.infer<typeof environmentRepoSecretsSchema>

/** Campos públicos da configuração do repositório (o cliente nunca recebe nem envia segredos). */
export const environmentRepoUpdateSchema = z.object({
    mode: environmentModeSchema.default("local"),
    host: z.string().trim().max(255).default(""),
    sshPort: z.number().int().min(1).max(65_535).default(DEFAULT_SSH_PORT),
    sshUser: z.string().trim().max(128).default(""),
    authMethod: sshAuthMethodSchema.default("key"),
    sshKeyPath: z.string().trim().max(500).default(""),
    cdWorkflow: z.string().trim().max(200).default(""),
    repositoryDirectory: z.string().trim().max(500).default(""),
    secrets: environmentRepoSecretsSchema.optional(),
})
export type EnvironmentRepoUpdateFormInput = z.input<typeof environmentRepoUpdateSchema>

const RESOURCES_DEFAULT = { cpus: null as number | null, memoryMb: null as number | null }
export const environmentResourcesSchema = z.object({
    cpus: z.number().min(0).max(128).nullable().default(null),
    memoryMb: z.number().int().min(0).max(1_048_576).nullable().default(null),
})

const HEALTHCHECK_DEFAULT = { enabled: true, path: DEFAULT_HEALTHCHECK_PATH, timeoutMs: DEFAULT_HEALTHCHECK_TIMEOUT_MS }
export const environmentHealthcheckSchema = z.object({
    enabled: z.boolean().default(true),
    path: z.string().trim().max(500).default(DEFAULT_HEALTHCHECK_PATH),
    timeoutMs: z.number().int().min(MIN_HEALTHCHECK_TIMEOUT_MS).max(MAX_HEALTHCHECK_TIMEOUT_MS).default(DEFAULT_HEALTHCHECK_TIMEOUT_MS),
})

const DB_VERSION_SOURCE_DEFAULT = { kind: "file" as const, value: "" }
export const databaseVersionSourceSchema = z.object({
    kind: z.enum(["file", "command", "none"]).default("file"),
    /** Caminho do arquivo (kind = file) ou comando (kind = command) dentro do repositório. */
    value: z.string().trim().max(500).default(""),
})

/** Nome do projeto Compose: vazio = derivado do Opex; preenchido = projeto adotado no host. */
export const composeProjectNameSchema = z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Nome de projeto inválido")
    .or(z.literal(""))
    .default("")

/** Caminho relativo do `.env` dentro do diretório do repositório. */
export const envFilePathSchema = z
    .string()
    .trim()
    .max(300)
    .refine((value) => !value.startsWith("/") && !value.split("/").includes(".."), "Use um caminho relativo, sem '..'")
    .default(DEFAULT_ENV_FILE)

export const environmentSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome").max(120),
    /** Vazio = derivado do nome. */
    slug: z.string().trim().max(120).optional(),
    branch: z.string().trim().min(1, "Informe a branch").max(255).default("main"),
    hostDirectory: z.string().trim().max(500).default(""),
    composeFile: z.string().trim().min(1, "Informe o arquivo do compose").max(500).default(DEFAULT_COMPOSE_FILE),
    composeService: z.string().trim().max(120).default(""),
    composeProject: composeProjectNameSchema,
    envFile: envFilePathSchema,
    publishedPort: z.number().int().min(1).max(65_535).nullable().default(null),
    resources: environmentResourcesSchema.default(RESOURCES_DEFAULT),
    healthcheck: environmentHealthcheckSchema.default(HEALTHCHECK_DEFAULT),
    dbVersionSource: databaseVersionSourceSchema.default(DB_VERSION_SOURCE_DEFAULT),
})
export type EnvironmentFormInput = z.input<typeof environmentSchema>

export const publishInputSchema = z.object({
    method: z.enum(["local", "cd"]).default("local"),
})
export type PublishFormInput = z.input<typeof publishInputSchema>

export const restoreInputSchema = z.object({
    /** `id` imutável da imagem escolhida (não a tag, que pode mudar). */
    imageId: z.string().trim().min(1).max(200),
    /** Confirmação explícita para imagens do CD ou de schema desconhecido. */
    confirmUnverified: z.boolean().default(false),
})
export type RestoreFormInput = z.input<typeof restoreInputSchema>

/** Alteração de uma variável do `.env`: `value: null` remove a chave. */
export const hostEnvChangeSchema = z.object({
    key: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Nome da variável inválido").max(128),
    value: z.string().max(8_000).nullable(),
})

export const hostEnvFileInputSchema = z.object({
    /** Revisão do arquivo lida na tela (evita sobrescrever edição externa). */
    revision: z.string().trim().max(64).optional(),
    changes: z.array(hostEnvChangeSchema).min(1, "Nada para salvar").max(MAX_ENV_VARS),
})
export type HostEnvFileInputForm = z.input<typeof hostEnvFileInputSchema>

/** Corpo bruto máximo aceito no PUT do `.env` (proteção antes do parse). */
export const MAX_ENV_FILE_INPUT_BYTES = MAX_ENV_FILE_BYTES

export const environmentStatusSchema = z.object({
    containers: z
        .array(
            z.object({
                name: z.string(),
                service: z.string().nullable(),
                state: z.string(),
                status: z.string(),
                image: z.string().nullable(),
                health: z.string().nullable().default(null),
            }),
        )
        .default([]),
    running: z.boolean().default(false),
    /** Ao menos um container rodando e ao menos um parado. */
    partial: z.boolean().default(false),
    /** O host respondeu à consulta. */
    reachable: z.boolean().default(false),
    error: z.string().nullable().default(null),
    checkedAt: z.string().nullable().default(null),
})

export const operationStepDtoSchema = z.object({
    id: z.string(),
    label: z.string(),
    status: z.enum(["pending", "running", "done", "failed", "skipped"]),
    message: z.string().nullable(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
})

export const operationDtoSchema = z.object({
    id: z.string(),
    environmentId: z.string(),
    type: z.enum(["publish", "restore"]),
    method: z.enum(["local", "cd"]).nullable(),
    status: z.enum(["queued", "running", "done", "failed", "cancelled"]),
    queuePosition: z.number().nullable().default(null),
    steps: z.array(operationStepDtoSchema).default([]),
    message: z.string().nullable().default(null),
    runUrl: z.string().nullable().default(null),
    startedAt: z.string().nullable().default(null),
    finishedAt: z.string().nullable().default(null),
    createdAt: z.string(),
})

export const imageDtoSchema = z.object({
    /** Id imutável da imagem (`sha256:…`). */
    id: z.string(),
    tag: z.string().nullable(),
    dbVersion: z.string().nullable(),
    builtAt: z.string().nullable(),
    origin: z.enum(["opex", "cd", "unknown"]),
    service: z.string().nullable(),
    commitSha: z.string().nullable(),
})

/** Projeto Compose descoberto no host (adoção). */
export const composeProjectCandidateSchema = z.object({
    project: z.string(),
    workingDir: z.string().nullable(),
    configFiles: z.array(z.string()).default([]),
    services: z.array(z.string()).default([]),
    running: z.boolean().default(false),
})

/** Lista de IDs de projeto que o ator pode ver (cliente: só os vinculados). */
export const projectIdsQuerySchema = z.object({
    projectId: z.string().trim().min(1).max(64).optional(),
})
