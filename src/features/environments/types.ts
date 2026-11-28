import type { ContainerPortDto } from "./container-ports"
import type { ResourceLimits } from "./resource-limits"
import type { BuilderAction, ComposeOverrides, EnvironmentLimits, ServiceValues, EnvironmentSource, EnvironmentsBuilder, EnvironmentsSettings, Machine } from "./schemas"

export type DeployStatus = "running" | "success" | "failed"
export type DeployKind = "deploy" | "move" | "delete"

export interface ServiceStatusDto {
    service: string
    container: string
    state: string
    status: string
    ports: string
    /** Portas que o container escuta, onde estão publicadas e como abrem no navegador (OPE-211). */
    listen: ContainerPortDto[]
    cpu: string | null
    memory: string | null
    /** Versão do `package.json` do app no container (`null` = sem o arquivo ou parado). */
    version: string | null
    /** Limites aplicados no container (`docker inspect`; `null` = não lidos). */
    limits: ResourceLimitsDto | null
}

export interface EnvironmentDeploySummaryDto {
    id: string
    kind: DeployKind
    status: DeployStatus
    ref: string | null
    commit: string | null
    buildOn: Machine
    runOn: Machine
    error: string | null
    startedAt: string
    finishedAt: string | null
    /** Duração (`null` enquanto em andamento). */
    durationMs: number | null
    version: string | null
    skipBuild: boolean
    /** Retomado depois de o app reiniciar no meio do deploy. */
    resumed: boolean
    /** Compose gerenciado: revisão gravada por este deploy. */
    composeVersion: number | null
}

/** Uma revisão do compose gerenciado na lista (sem o conteúdo). */
export interface ComposeRevisionSummaryDto {
    version: number
    authorId: string
    note: string | null
    createdAt: string
    /** Tamanho em bytes. */
    size: number
    /** Último deploy com sucesso desta revisão. */
    deployedAt: string | null
}

export interface ComposeRevisionDto extends ComposeRevisionSummaryDto {
    content: string
}

/** Compose gerenciado de um ambiente: a vigente (com o conteúdo) e o histórico. */
export interface EnvironmentComposeDto {
    current: ComposeRevisionDto | null
    revisions: ComposeRevisionSummaryDto[]
    /** Revisão implantada (último deploy com sucesso). */
    deployedVersion: number | null
}

/** Valores das variáveis extras para o formulário do dono (`null` = não foi possível ler aquele valor). */
export interface EnvironmentEnvValuesDto {
    items: { key: string; value: string | null }[]
}

export interface EnvironmentDto {
    id: string
    name: string
    slug: string
    source: EnvironmentSource
    /** Só os nomes das variáveis extras (os valores ficam cifrados no servidor). */
    envKeys: string[]
    ports: number[]
    healthUrl: string | null
    buildOn: Machine
    runOn: Machine
    /** Limites de recursos salvos (valem no próximo deploy; sem configuração = sem limite). */
    limits: EnvironmentLimits
    /** Os limites já foram configurados (mesmo vazios); `false` = o Editar mostra os aplicados no host. */
    limitsConfigured: boolean
    /** Limites do último deploy com sucesso (`null` = nenhum deploy desde a OPE-193). */
    deployedLimits: EnvironmentLimits | null
    /** Ajustes dos serviços do compose salvos (OPE-211; valem no próximo deploy; `null` = nunca configurado). */
    composeOverrides: ComposeOverrides | null
    /** Ajustes do último deploy com sucesso (`null` = nenhum deploy desde a OPE-211 ou sem ajustes). */
    deployedComposeOverrides: ComposeOverrides | null
    /** Onde está no ar (último deploy com sucesso); `null` = nunca implantado. */
    deployedOn: { buildOn: Machine; runOn: Machine } | null
    /** Versão do código do último deploy com sucesso. */
    deployedVersion: string | null
    /** Compose gerenciado: revisão implantada (`null` = nunca, ou outra origem). */
    deployedComposeVersion: number | null
    lastDeploy: EnvironmentDeploySummaryDto | null
    /** Serviços em execução (snapshot na hora da consulta). */
    services: ServiceStatusDto[]
    createdAt: string
    updatedAt: string
}

export interface UnmanagedProjectDto {
    machine: Machine
    projectName: string
    workingDir: string | null
    configFiles: string[]
    git: boolean
    containers: number
    running: number
}

export interface EnvironmentsListDto {
    items: EnvironmentDto[]
    unmanaged: UnmanagedProjectDto[]
    /** Túnel do Builder Machine aberto (o PC está alcançável). */
    pcAvailable: boolean
    pcReason: string | null
    /** CPUs e memória de cada máquina (`null` = não lidas). */
    hosts: Record<Machine, HostCapacityDto | null>
    /** Host dos links das portas (Configurações; `null` = o endereço com que a tela foi aberta). */
    portLinkHost: string | null
    checkedAt: string
}

/** "Ler compose" do formulário: os serviços e os limites declarados no compose (sem o override do app). */
export interface ComposeServicesDto {
    services: {
        name: string
        hasBuild: boolean
        declared: ResourceLimitsDto
        /** Forma dos limites no compose (`mem_limit`/`cpus` ou `deploy.resources`), para a prévia do override. */
        limitStyle: { memory: "service" | "deploy"; cpus: "service" | "deploy" }
        values: ServiceValues
        unreadable: { ports: string[]; volumes: string[] }
    }[]
}

export interface HostCapacityDto {
    cpus: number
    memoryGb: number
}

export interface EnvironmentDeployDto extends EnvironmentDeploySummaryDto {
    environmentId: string
    log: string
}

/** Linha do NDJSON do log ao vivo. */
export type DeployEvent = { type: "log"; text: string } | { type: "status"; status: DeployStatus; error: string | null }

/**
 * Primeira linha do stream de um deploy em andamento (só o stream envia, não o hub): início absoluto e
 * a duração estimada pelos deploys anteriores do ambiente (`null` sem histórico). Reenviada a cada conexão.
 * `serverNow` é o instante do servidor ao enviar: a tela corrige o próprio relógio pela diferença.
 */
export type DeployMetaEvent = { type: "meta"; startedAt: string; serverNow: string; estimateMs: number | null; sampleSize: number; initial: boolean }

/** Linhas que o stream do log entrega ao cliente. */
export type DeployStreamEvent = DeployEvent | DeployMetaEvent

export interface EnvironmentsSettingsDto {
    settings: EnvironmentsSettings
    isDefault: boolean
}

export interface RegistryStatusDto {
    running: boolean
    port: number
    detail: string
}

/** Limites aplicados de fato num container (lidos do `docker inspect`). */
export type ResourceLimitsDto = ResourceLimits
/** Limites aplicados de fato no container do builder. */
export type BuilderLimitsDto = ResourceLimitsDto

/**
 * Estado da linha "Builder do servidor": `missing` = o builder não existe; `unmanageable` = driver sem
 * container (ex.: `docker`), sem limites; `unknown` = o Docker não respondeu.
 */
export type BuilderStatus = "running" | "stopped" | "missing" | "unmanageable" | "unknown"

export interface BuilderLastActionDto {
    action: BuilderAction | "configure" | "pending"
    ok: boolean
    message: string
    at: string
}

export interface EnvironmentsBuilderDto {
    /** Configuração salva (`null` = ainda não gerenciado pelo Opex). */
    config: EnvironmentsBuilder | null
    /** Nome configurado ou, sem configuração, o builder atual do host. */
    name: string | null
    managed: boolean
    status: BuilderStatus
    driver: string | null
    container: string | null
    /** O builder existe no buildx, mas o container dele foi removido (Levantar usaria as opções antigas). */
    containerMissing: boolean
    /** É o builder atual do host (as prévias das mesas também o usam). */
    isHostDefault: boolean
    applied: BuilderLimitsDto | null
    /** Os limites salvos diferem dos aplicados no container. */
    limitsDiffer: boolean
    flags: string[]
    /** Flags do BuildKit que o Opex não recria (se perdem numa recriação). */
    unknownFlags: string[]
    usage: { cpuPercent: number; memoryUsage: string; memoryPercent: number } | null
    host: { cpus: number; memoryGb: number } | null
    /** Valores para "Gerenciar" (lidos do host). */
    suggested: EnvironmentsBuilder
    /** Recriação com `--keep-state` adiada até o build em andamento terminar. */
    pending: { requestedAt: string; reason: string } | null
    lastAction: BuilderLastActionDto | null
    buildRunning: boolean
    /** Falha ao ler o Docker do servidor. */
    error: string | null
    checkedAt: string
}

/** Resposta das ações e do salvar: o estado novo e o que aconteceu (texto do toast). */
export interface BuilderResultDto {
    builder: EnvironmentsBuilderDto
    message: string
}

/**
 * Ambiente visto no **portal do cliente** (só os de central cujo repositório está vinculado ao
 * cliente). Sem variáveis, máquinas, caminhos, CPU/RAM, limites nem log: o estado e, por serviço, as
 * portas que ele escuta (OPE-211).
 */
export interface PortalEnvironmentDto {
    id: string
    name: string
    slug: string
    /** Ref (branch/tag) que o ambiente implanta. */
    ref: string
    health: "running" | "partial" | "stopped" | "never"
    /** Versão do código no ar (último deploy com sucesso). */
    deployedVersion: string | null
    services: { service: string; state: string; status: string; version: string | null; listen: ContainerPortDto[] }[]
    /** Host dos links das portas (`null` = o endereço com que a tela foi aberta). */
    portLinkHost: string | null
    lastDeploy: { status: DeployStatus; startedAt: string; finishedAt: string | null; durationMs: number | null; version: string | null } | null
    /** Há um deploy em andamento (as ações ficam bloqueadas). */
    deploying: boolean
}
