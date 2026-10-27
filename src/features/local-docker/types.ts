import type { LocalDockerMachineAction, LocalDockerOverrideMode, LocalDockerSettings } from "./schemas"

/** Chave do servidor: a tela nunca recebe a chave, só se existe, a origem e a impressão digital. */
export interface LocalDockerKeyDto {
    configured: boolean
    source: "generated" | "imported" | null
    fingerprint: string | null
}

export interface LocalDockerPrepareDto {
    ok: boolean
    trigger: "manual" | "save"
    steps: LocalDockerStepDto[]
    at: string
}

export interface LocalDockerSettingsDto {
    settings: LocalDockerSettings
    isDefault: boolean
    key: LocalDockerKeyDto
    /** Último preparo do Docker do PC (`null` = nunca preparado). */
    lastPrepare: LocalDockerPrepareDto | null
    updatedAt: string | null
}

export interface LocalDockerMachineInfo {
    version: string
    name: string
    cpus: number
    memoryBytes: number
}

/** Prévia publicada no PC (o servidor repassa a porta pelo túnel). */
export interface LocalDockerPreviewDto {
    workbenchId: string
    composeProject: string
    port: number
    /** O túnel estava fechado na limpeza: os containers saem quando ele reabrir. */
    pendingTeardown: boolean
}

export interface LocalDockerStatusDto {
    /** O SSH do PC responde (pelo túnel de controle ou pelo IP). */
    reachable: boolean
    /** Conexão mestra do túnel (Docker + portas) aberta. */
    tunnelOpen: boolean
    /** O usuário pediu o túnel aberto (a rotina tenta reabrir se ele cair). */
    wantOpen: boolean
    /** Docker do PC pelo túnel; `null` = túnel fechado ou Docker sem resposta. */
    machine: LocalDockerMachineInfo | null
    /** As prévias novas vão para o PC agora (túnel aberto e chave global ligada). */
    routesToLocal: boolean
    previews: LocalDockerPreviewDto[]
    error: string | null
    checkedAt: string
}

export interface LocalDockerStepDto {
    label: string
    ok: boolean
    detail: string
}

export interface LocalDockerMachineResultDto {
    action: LocalDockerMachineAction
    ok: boolean
    steps: LocalDockerStepDto[]
}

export interface LocalDockerOverrideDto {
    centralId: string
    mode: LocalDockerOverrideMode
}

export type LocalDockerContainerKind = "preview" | "alias" | "builder"

export interface LocalDockerContainerStatsDto {
    cpuPercent: number
    memoryUsage: string
    memoryPercent: number
}

export interface LocalDockerContainerDto {
    name: string
    kind: LocalDockerContainerKind
    /** `running`, `exited`, `created`... (estado do Docker). */
    state: string
    status: string
    image: string
    ports: string
    stats: LocalDockerContainerStatsDto | null
    /** Prévia: projeto do compose, serviço, mesa e porta repassada. */
    composeProject: string | null
    service: string | null
    workbenchId: string | null
    taskCode: string | null
    port: number | null
    /** Apelido: nome de rede e destino no servidor. */
    alias: string | null
    target: string | null
}

export interface LocalDockerContainersDto {
    /** `false` = túnel fechado ou Docker do PC sem resposta (`reason` diz qual). */
    available: boolean
    reason: string | null
    previews: LocalDockerContainerDto[]
    environment: LocalDockerContainerDto[]
    checkedAt: string
}
