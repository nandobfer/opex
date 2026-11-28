import { z } from "zod"
import { PORTAL_ENVIRONMENT_ACTIONS } from "./constants"
import { composeContentProblem } from "./managed-compose"
import { overrideYamlKeys, overrideYamlProblem } from "./override-yaml"
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

// --- Serviços do compose (OPE-211) -----------------------------------------------------------------

/** Referência de imagem (sem espaços nem aspas; `${VAR}` é interpolado pelo compose). */
export const imageSchema = z.string().trim().min(1, "Informe a imagem").max(255).regex(/^[^\s"'`]+$/, "Imagem inválida (sem espaços nem aspas)")
/** `command`/`entrypoint` na forma exec: um argumento por item. */
const argsSchema = z.array(z.string().max(4000)).max(100)
export const composeKeyValueSchema = z.object({ key: z.string().trim().min(1, "Informe o nome").max(200).regex(/^[^\s=]+$/, "Nome sem espaços nem ="), value: z.string().max(10_000) })
export type ComposeKeyValue = z.infer<typeof composeKeyValueSchema>
export const PORT_PROTOCOLS = ["tcp", "udp"] as const
export const portOverrideSchema = z.object({
    target: z.number().int().min(1, "Porta de 1 a 65535").max(65535, "Porta de 1 a 65535"),
    /** Porta (ou intervalo `8000-8010`) publicada no host; vazio = sem publicar (só na rede do compose). `${VAR}` é interpolado. */
    published: z
        .string()
        .trim()
        .max(200)
        .regex(/^((\d{1,5}(-\d{1,5})?)|(\$\{[^}\s]+\}))?$/, "Porta publicada: número, intervalo (8000-8010) ou ${VARIAVEL}"),
    protocol: z.enum(PORT_PROTOCOLS),
    /** IP do host (vazio = todos). */
    hostIp: z.string().trim().max(64).regex(/^[0-9a-fA-F.:[\]]*$/, "IP inválido"),
})
export type PortOverride = z.infer<typeof portOverrideSchema>
export const VOLUME_TYPES = ["bind", "volume", "tmpfs"] as const
export type VolumeType = (typeof VOLUME_TYPES)[number]
export const volumeOverrideSchema = z
    .object({
        type: z.enum(VOLUME_TYPES),
        /** Caminho (bind, relativo à pasta do compose) ou nome do volume; vazio = volume anônimo/tmpfs. */
        source: z.string().trim().max(400).regex(/^[^\n\r]*$/),
        target: z.string().trim().min(1, "Informe o destino").max(400).regex(/^(\/|\$\{)/, "O destino é um caminho absoluto no container (ou ${VARIAVEL})"),
        readOnly: z.boolean(),
    })
    .superRefine((value, ctx) => {
        if (value.type === "bind" && !value.source) ctx.addIssue({ code: "custom", path: ["source"], message: "Informe o caminho da máquina" })
        if (value.type === "volume" && value.source && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value.source)) ctx.addIssue({ code: "custom", path: ["source"], message: "Nome de volume inválido" })
    })
export type VolumeOverride = z.infer<typeof volumeOverrideSchema>
export const RESTART_POLICIES = ["no", "always", "on-failure", "unless-stopped"] as const
export type RestartPolicy = (typeof RESTART_POLICIES)[number]
/** Duração do compose (`30s`, `1m30s`, `500ms`); vazio = padrão. */
const durationSchema = z.string().trim().regex(/^((\d+(\.\d+)?)(us|ms|s|m|h))*$/, "Duração como 30s, 1m30s ou 500ms")
export const HEALTHCHECK_MODES = ["disable", "shell", "exec"] as const
export type HealthcheckMode = (typeof HEALTHCHECK_MODES)[number]
export const healthcheckOverrideSchema = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("disable") }),
    z.object({
        mode: z.enum(["shell", "exec"]),
        /** Shell: um item (o comando); exec: um argumento por item. */
        test: z.array(z.string().max(4000)).min(1, "Informe o comando").max(50),
        interval: durationSchema,
        timeout: durationSchema,
        startPeriod: durationSchema,
        retries: z.number().int().min(0).max(1000).nullable(),
    }),
])
export type HealthcheckOverride = z.infer<typeof healthcheckOverrideSchema>
export const DEPENDS_CONDITIONS = ["service_started", "service_healthy", "service_completed_successfully"] as const
export type DependsCondition = (typeof DEPENDS_CONDITIONS)[number]
export const dependsOnSchema = z.object({ service: serviceSchema, condition: z.enum(DEPENDS_CONDITIONS), restart: z.boolean() })
export type DependsOn = z.infer<typeof dependsOnSchema>

/** Dados de um serviço do compose; `null` em cada campo = o do compose (Personalizar desligado). */
export const serviceValuesShape = {
    image: imageSchema.nullable(),
    command: argsSchema.nullable(),
    entrypoint: argsSchema.nullable(),
    environment: z.array(composeKeyValueSchema).max(200).nullable(),
    labels: z.array(composeKeyValueSchema).max(100).nullable(),
    ports: z.array(portOverrideSchema).max(50).nullable(),
    volumes: z.array(volumeOverrideSchema).max(50).nullable(),
    restart: z.enum(RESTART_POLICIES).nullable(),
    healthcheck: healthcheckOverrideSchema.nullable(),
    dependsOn: z.array(dependsOnSchema).max(30).nullable(),
}
export type ServiceValues = { [K in keyof typeof serviceValuesShape]: z.infer<(typeof serviceValuesShape)[K]> }
export type ServiceField = keyof ServiceValues

const repeated = (values: string[]) => values.find((value, index) => values.indexOf(value) !== index)

export const serviceOverrideSchema = z.object({ service: serviceSchema, ...serviceValuesShape }).superRefine((value, ctx) => {
    const env = repeated((value.environment ?? []).map((item) => item.key))
    if (env) ctx.addIssue({ code: "custom", path: ["environment"], message: `Variável repetida: ${env}` })
    const labels = (value.labels ?? []).map((item) => item.key)
    const label = repeated(labels)
    if (label) ctx.addIssue({ code: "custom", path: ["labels"], message: `Label repetido: ${label}` })
    const reserved = labels.find((key) => key.startsWith("com.docker.compose."))
    if (reserved) ctx.addIssue({ code: "custom", path: ["labels"], message: `Labels com.docker.compose.* são do compose (o Opex usa para achar os projetos): ${reserved}` })
    const target = repeated((value.volumes ?? []).map((item) => item.target))
    if (target) ctx.addIssue({ code: "custom", path: ["volumes"], message: `Destino repetido: ${target}` })
    const port = repeated((value.ports ?? []).filter((item) => item.published).map((item) => `${item.hostIp}:${item.published}/${item.protocol}`))
    if (port) ctx.addIssue({ code: "custom", path: ["ports"], message: `Porta publicada repetida: ${port}` })
    const deps = (value.dependsOn ?? []).map((item) => item.service)
    const dep = repeated(deps)
    if (dep) ctx.addIssue({ code: "custom", path: ["dependsOn"], message: `Dependência repetida: ${dep}` })
    if (deps.includes(value.service)) ctx.addIssue({ code: "custom", path: ["dependsOn"], message: "O serviço não pode depender dele mesmo" })
})
export type ServiceOverride = z.infer<typeof serviceOverrideSchema>

/** Campo do formulário → chave do compose. */
export const SERVICE_FIELD_KEYS: Record<ServiceField, string> = { image: "image", command: "command", entrypoint: "entrypoint", environment: "environment", labels: "labels", ports: "ports", volumes: "volumes", restart: "restart", healthcheck: "healthcheck", dependsOn: "depends_on" }
export const SERVICE_FIELDS = Object.keys(SERVICE_FIELD_KEYS) as ServiceField[]

/**
 * Ajustes dos serviços do compose (OPE-211), aplicados no deploy pelo override: o bloco guiado por
 * serviço e o YAML avançado (o conteúdo do bloco `services:`).
 */
export const composeOverridesSchema = z
    .object({ services: z.array(serviceOverrideSchema).max(30), yaml: z.string().max(70_000, "O YAML avançado passa de 64 KB") })
    .superRefine((value, ctx) => {
        const service = repeated(value.services.map((item) => item.service))
        if (service) ctx.addIssue({ code: "custom", path: ["services"], message: `Serviço repetido: ${service}` })
        const problem = overrideYamlProblem(value.yaml)
        if (problem) {
            ctx.addIssue({ code: "custom", path: ["yaml"], message: problem.message })
            return
        }
        const yamlKeys = overrideYamlKeys(value.yaml)
        for (const item of value.services) {
            const keys = yamlKeys[item.service] ?? []
            const clash = SERVICE_FIELDS.find((field) => item[field] !== null && keys.includes(SERVICE_FIELD_KEYS[field]))
            if (clash) ctx.addIssue({ code: "custom", path: ["yaml"], message: `${item.service}.${SERVICE_FIELD_KEYS[clash]} está no bloco guiado e no YAML avançado: deixe em um só` })
        }
    })
export type ComposeOverrides = z.infer<typeof composeOverridesSchema>
export const EMPTY_COMPOSE_OVERRIDES: ComposeOverrides = { services: [], yaml: "" }

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
        /** Ajustes dos serviços do compose (OPE-211); `null` = nunca configurado. */
        composeOverrides: composeOverridesSchema.nullable(),
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
    /** Host dos links das portas dos containers (OPE-211); vazio = o endereço com que a tela foi aberta. */
    portLinkHost: z
        .string()
        .trim()
        .max(200)
        .regex(/^[A-Za-z0-9.-]*$/, "Informe só o host (ex.: 192.168.0.64)"),
})
export type EnvironmentsSettings = z.infer<typeof environmentsSettingsSchema>

export const DEFAULT_ENVIRONMENTS_SETTINGS: EnvironmentsSettings = { baseDir: "opex-envs", registryPort: 5050, keepTags: 5, portLinkHost: "" }

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
