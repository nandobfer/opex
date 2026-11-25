import { z } from "zod"
import { PORTAL_ENVIRONMENT_ACTIONS } from "./constants"
import { composeContentProblem } from "./managed-compose"
import { resourceLimitsShape, swapNeedsMemory } from "./resource-limits"

/** Caminho relativo seguro (sem `..`, sem começar por `/` ou `-`). */
const SAFE_RELATIVE = /^(?![-/])(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.@+\-/]+$/
/** Caminho absoluto seguro (pasta adotada). */
const SAFE_ABSOLUTE = /^\/(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.@+\-/ ]*$/

export const MACHINES = ["server", "pc"] as const
export type Machine = (typeof MACHINES)[number]
export const MACHINE_LABELS: Record<Machine, string> = { server: "Servidor", pc: "PC" }

export const slugSchema = z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "Use de 2 a 40 letras minúsculas, números ou hífen (começando por letra ou número)")
export const projectNameSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/, "Nome do projeto do compose: letras minúsculas, números, _ ou -")
export const serviceSchema = z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/, "Nome de serviço inválido")
/** Branch, tag ou commit (sem espaços nem `..`). */
export const refSchema = z.string().trim().min(1, "Informe a ref").max(200).regex(/^(?!-)(?!.*\.\.)[A-Za-z0-9_./@+-]+$/, "Ref inválida")
export const relativeFileSchema = z.string().trim().min(1).max(300).regex(SAFE_RELATIVE, "Use um caminho relativo à pasta, sem \"..\"")
export const absoluteDirSchema = z.string().trim().min(2).max(400).regex(SAFE_ABSOLUTE, "Caminho absoluto inválido")
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/
/** Limite do campo de texto do compose (o limite real, em bytes, é conferido por `composeContentProblem`). */
const COMPOSE_INPUT_MAX_CHARS = 400_000
export const envKeySchema = z.string().trim().regex(ENV_KEY_PATTERN, "Nome de variável inválido")

export const centralSourceSchema = z.object({
    kind: z.literal("central"),
    centralId: z.string().trim().min(1, "Escolha a central"),
    ref: refSchema,
    composeFile: relativeFileSchema,
    /** Vazio = todos os serviços do compose. */
    services: z.array(serviceSchema).max(30),
    projectName: projectNameSchema,
})

export const adoptedSourceSchema = z.object({
    kind: z.literal("adopted"),
    /** Máquina onde estão os arquivos (e o projeto foi descoberto). */
    machine: z.enum(MACHINES),
    workingDir: absoluteDirSchema,
    configFiles: z.array(z.string().trim().min(1).max(400)).min(1).max(10),
    projectName: projectNameSchema,
    git: z.boolean(),
    pullOnRedeploy: z.boolean(),
})

/**
 * Compose gerenciado (OPE-191): o `docker-compose.yml` é escrito no Opex e versionado em
 * `environment_compose_versions`; os arquivos ficam no servidor, na pasta do ambiente. `composeVersion`
 * (revisão vigente) e `composeUpdatedAt` são gravados só pelo serviço de revisões: o valor que vier na
 * entrada é ignorado.
 */
export const managedSourceSchema = z.object({
    kind: z.literal("managed"),
    projectName: projectNameSchema,
    /** Vazio = todos os serviços do compose. */
    services: z.array(serviceSchema).max(30),
    composeVersion: z.number().int().min(1),
    /** ISO da gravação da revisão vigente. */
    composeUpdatedAt: z.string().optional(),
})

export const environmentSourceSchema = z.discriminatedUnion("kind", [centralSourceSchema, managedSourceSchema, adoptedSourceSchema])
export type EnvironmentSource = z.infer<typeof environmentSourceSchema>

/**
 * Variável extra. `keep` mantém o valor salvo (a tela usa quando não conseguiu ler o valor daquela
 * variável). Pelas ferramentas do Agente Opex, valor vazio também mantém o salvo; pela tela, grava vazio.
 */
export const envVarInputSchema = z.object({ key: envKeySchema, value: z.string().max(10_000), keep: z.boolean().optional() })

/** Limites de um serviço (modo "Por serviço"); serviço sem linha fica sem limite. */
export const serviceLimitsSchema = z.object({ service: serviceSchema, ...resourceLimitsShape }).superRefine((value, ctx) => swapNeedsMemory(value, ctx))
export type ServiceLimits = z.infer<typeof serviceLimitsSchema>

/**
 * Limites de recursos do ambiente (OPE-193), aplicados no deploy pelo override: `shared` = os mesmos
 * valores para cada serviço; `service` = uma linha por serviço. Vazio = sem limite.
 */
export const environmentLimitsSchema = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("shared"), ...resourceLimitsShape }).superRefine((value, ctx) => swapNeedsMemory(value, ctx)),
    z
        .object({ mode: z.literal("service"), services: z.array(serviceLimitsSchema).max(30) })
        .superRefine((value, ctx) => {
            const names = value.services.map((item) => item.service)
            if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", path: ["services"], message: "Serviços repetidos" })
        }),
])
export type EnvironmentLimits = z.infer<typeof environmentLimitsSchema>
export const LIMIT_MODES = ["shared", "service"] as const
export type LimitMode = (typeof LIMIT_MODES)[number]
export const DEFAULT_ENVIRONMENT_LIMITS: EnvironmentLimits = { mode: "shared", memoryGb: null, cpus: null, swapGb: null }

export const environmentInputSchema = z
    .object({
        name: z.string().trim().min(2, "Informe o nome").max(80),
        slug: slugSchema,
        source: environmentSourceSchema,
        env: z.array(envVarInputSchema).max(100),
        ports: z.array(z.number().int().min(1024, "Porta mínima 1024").max(65535, "Porta máxima 65535")).max(20),
        healthUrl: z.union([z.url("URL de saúde inválida").max(300), z.literal("")]),
        buildOn: z.enum(MACHINES),
        runOn: z.enum(MACHINES),
        /** YAML do compose gerenciado: só na criação (vira a v1); depois, pelas revisões. */
        compose: z.string().max(COMPOSE_INPUT_MAX_CHARS).optional(),
        /** `null` = nunca configurado (o Editar mostra os aplicados no host); objeto vazio = configurado sem limite. */
        limits: environmentLimitsSchema.nullable(),
    })
    .superRefine((value, ctx) => {
        const keys = value.env.map((item) => item.key)
        if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["env"], message: "Variáveis repetidas" })
        if (new Set(value.ports).size !== value.ports.length) ctx.addIssue({ code: "custom", path: ["ports"], message: "Portas repetidas" })
        const problem = placementProblem(value.source, value.buildOn, value.runOn)
        if (problem) ctx.addIssue({ code: "custom", path: ["buildOn"], message: problem })
    })
export type EnvironmentInput = z.infer<typeof environmentInputSchema>

/**
 * Criação (POST e formulário Novo): a origem gerenciada exige o compose válido — decisão do dono na
 * OPE-191: o ambiente gerenciado sempre nasce com a v1.
 */
export const environmentCreateSchema = environmentInputSchema.superRefine((value, ctx) => {
    if (value.source.kind !== "managed") return
    const problem = composeContentProblem(value.compose ?? "")
    if (problem) ctx.addIssue({ code: "custom", path: ["compose"], message: problem.message })
})

/** Corpo de `PUT /api/environments/[id]/compose` (nova revisão). */
export const composeSaveSchema = z.object({
    content: z.string().max(COMPOSE_INPUT_MAX_CHARS, "O compose é grande demais"),
    note: z.string().trim().max(200, "Nota com até 200 caracteres").optional(),
})
export type ComposeSaveInput = z.infer<typeof composeSaveSchema>

/** Corpo de `POST /api/environments/[id]/compose/restore`. */
export const composeRestoreSchema = z.object({ version: z.number().int().min(1) })

/**
 * Corpo de `POST /api/environments/compose-services` ("Ler compose" do formulário). `environmentId` só no
 * compose gerenciado: os serviços vêm da revisão vigente guardada em `environment_compose_versions`.
 */
export const composeServicesInputSchema = z.object({ source: environmentSourceSchema, environmentId: z.string().trim().min(1).optional() })
export type ComposeServicesInput = z.infer<typeof composeServicesInputSchema>

/** Combinação de máquinas impossível para a origem (puro; `null` = ok). */
export function placementProblem(source: Pick<EnvironmentSource, "kind"> & { machine?: Machine }, buildOn: Machine, runOn: Machine): string | null {
    if (source.kind === "adopted" && source.machine === "pc" && (buildOn !== "pc" || runOn !== "pc")) return "Projeto adotado do PC: os arquivos estão no PC, então o build e a execução ficam no PC."
    return null
}

export const ENVIRONMENT_ACTIONS = ["deploy", "up", "down", "restart", "logs", "move"] as const
export type EnvironmentAction = (typeof ENVIRONMENT_ACTIONS)[number]
export const environmentActionSchema = z.discriminatedUnion("action", [
    /** `ref` vazio = a ref salva (última da branch). */
    z.object({ action: z.literal("deploy"), ref: z.union([refSchema, z.literal("")]).optional() }),
    z.object({ action: z.literal("up") }),
    z.object({ action: z.literal("down") }),
    z.object({ action: z.literal("restart") }),
    z.object({ action: z.literal("logs") }),
    z.object({ action: z.literal("move"), buildOn: z.enum(MACHINES), runOn: z.enum(MACHINES) }),
])
export type EnvironmentActionInput = z.infer<typeof environmentActionSchema>

export const environmentsSettingsSchema = z.object({
    /** Pasta base no servidor, relativa ao `$HOME` do host do OpenCode. */
    baseDir: relativeFileSchema,
    registryPort: z.number().int().min(1024).max(65535),
    keepTags: z.number().int().min(1, "Mantenha ao menos 1").max(50),
})
export type EnvironmentsSettings = z.infer<typeof environmentsSettingsSchema>

export const DEFAULT_ENVIRONMENTS_SETTINGS: EnvironmentsSettings = { baseDir: "opex-envs", registryPort: 5050, keepTags: 5 }

/** Nome do builder do buildx (entra em comandos: só caracteres seguros). */
export const builderNameSchema = z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/, "Nome do builder: letras, números, _, . ou - (começando por letra ou número)")

/**
 * Builder do buildx do servidor (linha "Builder do servidor" em Ambientes). Limites vazios = sem limite;
 * `swapGb` é o swap além da RAM (vazio = padrão do Docker, 0 = sem swap) e exige a RAM.
 */
export const environmentsBuilderSchema = z
    .object({
        name: builderNameSchema,
        ...resourceLimitsShape,
        /** Builder atual do host (`--use`): as prévias das mesas também o usam. */
        useAsDefault: z.boolean(),
        /** `--allow-insecure-entitlement=network.host` no BuildKit. */
        allowNetworkHost: z.boolean(),
    })
    .superRefine((value, ctx) => swapNeedsMemory(value, ctx))
export type EnvironmentsBuilder = z.infer<typeof environmentsBuilderSchema>

export const BUILDER_ACTIONS = ["create", "start", "stop", "recreate", "delete"] as const
export type BuilderAction = (typeof BUILDER_ACTIONS)[number]
/** `confirm`: Apagar (perde o cache). `force`: derrubar/apagar com um build em andamento (ele falha). */
export const builderActionSchema = z.object({ action: z.enum(BUILDER_ACTIONS, { message: "Ação inválida" }), confirm: z.boolean().optional(), force: z.boolean().optional() })
export type BuilderActionInput = z.infer<typeof builderActionSchema>

export const adoptInputSchema = z.object({
    machine: z.enum(MACHINES),
    projectName: projectNameSchema,
    name: z.string().trim().min(2).max(80),
    slug: slugSchema,
})
export type AdoptInput = z.infer<typeof adoptInputSchema>

/** Corpo de `POST /api/cliente/ambientes/[id]/actions` (portal): sem ref, máquina nem opções. */
export const portalEnvironmentActionSchema = z.object({ action: z.enum(PORTAL_ENVIRONMENT_ACTIONS, { message: "Ação inválida" }) })
export type PortalEnvironmentActionInput = z.infer<typeof portalEnvironmentActionSchema>
