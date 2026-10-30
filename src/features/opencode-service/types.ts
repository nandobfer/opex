import type { OpencodeServiceAction } from "./constants"
import type { OpencodeUpdateInfo } from "./logic"

export type OpencodeServiceState = "running" | "stopped" | "unreachable" | "unknown"

export interface OpencodeServiceOperationDto {
    id: string
    action: OpencodeServiceAction
    status: "running" | "succeeded" | "failed" | "interrupted"
    fromVersion: string | null
    toVersion: string | null
    output: string
    error: string | null
    origin: "ui" | "opex-agent"
    startedAt: string
    finishedAt: string | null
}

export interface OpencodeServiceStatusDto {
    state: OpencodeServiceState
    /** Motivo quando não está no ar (mensagem do OpenCode/SSH). */
    reason: string | null
    baseUrl: string | null
    version: string | null
    pid: number | null
    port: number | null
    uptimeSeconds: number | null
    ssh: { configured: boolean; trusted: boolean; host: string | null; port: number; user: string | null; fingerprint: string | null; bin: string | null }
    update: OpencodeUpdateInfo | null
    operation: OpencodeServiceOperationDto | null
    /** Execuções que um parar/reiniciar/atualizar interrompe. */
    impact: { workbenches: number; refinements: number }
    checkedAt: string
}

export interface OpencodeLogsDto {
    lines: string
    source: "ssh" | "opencode"
}
