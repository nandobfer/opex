import type { CronJobConfig } from "@nandobfer/integracoes"
import type { AiIntegrationConfigMap } from "@nandobfer/integracoes/ia"
import type { GotenbergValues } from "@nandobfer/integracoes/gotenberg"
import type { PusherValues } from "@nandobfer/integracoes/pusher"

/**
 * Valores resolvidos de cada integração do Opex (`getIntegrationConfig("github")` tipado). Campos
 * privados também aparecem aqui — só no servidor; nunca serialize para o cliente.
 */
export interface IntegrationConfigMap extends Omit<AiIntegrationConfigMap, "ai_opencode"> {
    [id: string]: Record<string, unknown>
    pusher: PusherValues
    internal_api: Record<string, never>
    crons: { schedulerEnabled: boolean; internalBaseUrl?: string; jobs: CronJobConfig[]; cronSecret?: string }
    github: { apiUrl: string; commentOnCreate: boolean; token?: string }
    ai_opencode: { baseUrl?: string; directory?: string; quotaRefreshReason?: string; sshHost?: string; sshPort: number; sshUser?: string; opencodeBin?: string; sshHostFingerprint?: string; password?: string; sshPrivateKey?: string }
    orcamentos: Record<string, never>
    smtp: { host?: string; port: number; user?: string; from?: string; password?: string }
    storage_s3: {
        endpoint?: string
        publicEndpoint?: string
        region: string
        bucket: string
        signedUrlExpiresSeconds: number
        accessKey?: string
        secretKey?: string
    }
    /** Builder Machine: ativação e a chave privada colada pelo usuário (a configuração fica nas coleções `local_docker_*`). */
    builder_machine: { active: boolean; sshPrivateKey?: string }
    engramind: { baseUrl?: string; opexPublicUrl?: string; environmentId?: string; memoryExportScript?: string; adminToken?: string; webhookSecret?: string; appToken?: string }
    gotenberg: GotenbergValues
    "evolution-api": { internalUrl?: string; publicUrl?: string; defaultInstance?: string; version?: string; webhookUrl?: string; apiKey?: string; webhookSecret?: string }
}
