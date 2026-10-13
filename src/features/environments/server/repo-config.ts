import { dbConnect } from "@/lib/db"
import { EnvironmentRepoConfig, type IEnvironmentRepoConfig } from "@/lib/db/models/EnvironmentRepoConfig"
import { decryptSecret, encryptSecret, isEncryptedSecret, SecretBoxKeyError, type EncryptedSecret } from "@/lib/crypto/secretBox"
import { recordAudit, AcaoAuditoria } from "@/lib/audit/record"
import { DomainError } from "@/lib/api/route"
import type { IProject } from "@/lib/db/models/Project"
import type { EnvironmentRepoConfigDto } from "../types"
import { ENVIRONMENT_REPO_AUDIT_ENTITY } from "../constants"
import type { ResolvedRepoConnection } from "./runner"
import type { EnvironmentActor } from "./actor"
import { assertCanManage, assertCanManageSecrets } from "./actor"
import { emptySecretsStatus, secretStatus } from "./dto"
import type { EnvironmentRepoUpdateInput } from "../types"
import type { WithId } from "./types"

/**
 * Configuração de execução de um repositório: leitura/gravação com segredos **cifrados** e
 * **somente substituíveis** (nunca devolvidos). Só o dono altera segredos; o admin do cliente edita
 * apenas os campos públicos.
 */

function decryptOrNull(box: unknown): string | null {
    if (!isEncryptedSecret(box)) return null
    try {
        return decryptSecret(box)
    } catch {
        return null
    }
}

export function toRepoConfigDto(config: IEnvironmentRepoConfig, project: IProject): EnvironmentRepoConfigDto {
    const secrets = emptySecretsStatus()
    secrets.sshPassword = secretStatus(config.sshPassword)
    secrets.sshPrivateKey = secretStatus(config.sshPrivateKey)
    secrets.sshPassphrase = secretStatus(config.sshPassphrase)
    secrets.connectionString = secretStatus(config.connectionString)
    return {
        projectId: config.projectId,
        repo: project.repo,
        name: config.name,
        mode: config.mode,
        host: config.host,
        sshPort: config.sshPort,
        sshUser: config.sshUser,
        authMethod: config.authMethod,
        sshKeyPath: config.sshKeyPath,
        cdWorkflow: config.cdWorkflow,
        repositoryDirectory: config.repositoryDirectory,
        secrets,
        configured: config.mode === "local" || Boolean(config.host && config.sshUser),
        updatedAt: new Date(config.updatedAt).toISOString(),
    }
}

export async function getRepoConfig(projectId: string): Promise<IEnvironmentRepoConfig | null> {
    await dbConnect()
    return EnvironmentRepoConfig.findOne({ projectId }).lean()
}

/** Configuração do projeto, criada com padrões na primeira leitura. */
export async function getOrCreateRepoConfig(project: WithId<IProject>, userId: string): Promise<IEnvironmentRepoConfig> {
    await dbConnect()
    const existing = await EnvironmentRepoConfig.findOne({ projectId: String(project._id) })
    if (existing) return existing.toObject() as IEnvironmentRepoConfig
    const created = await EnvironmentRepoConfig.create({
        projectId: String(project._id),
        repo: project.repo,
        name: project.name,
        mode: "local",
        host: "",
        sshPort: 22,
        sshUser: "",
        authMethod: "key",
        sshKeyPath: "",
        cdWorkflow: "",
        repositoryDirectory: "",
        sshPassword: null,
        sshPrivateKey: null,
        sshPassphrase: null,
        connectionString: null,
    })
    created.set("_auditContext", { userId })
    await created.save()
    return created.toObject() as IEnvironmentRepoConfig
}

/** Aplica uma operação de segredo (`set`/`clear`); ausente mantém o valor atual. */
function applySecret(input: { action: "set" | "clear"; value?: string } | undefined): EncryptedSecret | null | undefined {
    if (!input) return undefined
    if (input.action === "clear") return null
    try {
        return encryptSecret(input.value ?? "")
    } catch (error) {
        if (error instanceof SecretBoxKeyError) throw new DomainError(409, "Configure INTEGRATIONS_ENCRYPTION_KEY para gravar segredos.", "ENCRYPTION_KEY_MISSING")
        throw error
    }
}

export async function updateRepoConfig(actor: EnvironmentActor, project: WithId<IProject>, input: EnvironmentRepoUpdateInput): Promise<IEnvironmentRepoConfig> {
    assertCanManage(actor)
    await dbConnect()
    const projectId = String(project._id)
    const config = await EnvironmentRepoConfig.findOne({ projectId })
    if (!config) throw new DomainError(404, "Configuração do repositório não encontrada.", "REPO_CONFIG_NOT_FOUND")

    const before = {
        mode: config.mode,
        host: config.host,
        sshPort: config.sshPort,
        sshUser: config.sshUser,
        authMethod: config.authMethod,
        cdWorkflow: config.cdWorkflow,
        repositoryDirectory: config.repositoryDirectory,
    }

    config.mode = input.mode
    config.host = input.host
    config.sshPort = input.sshPort
    config.sshUser = input.sshUser
    config.authMethod = input.authMethod
    config.sshKeyPath = input.sshKeyPath
    config.cdWorkflow = input.cdWorkflow
    config.repositoryDirectory = input.repositoryDirectory

    if (input.secrets && Object.keys(input.secrets).length > 0) {
        assertCanManageSecrets(actor)
        const sshPassword = applySecret(input.secrets.sshPassword)
        const sshPrivateKey = applySecret(input.secrets.sshPrivateKey)
        const sshPassphrase = applySecret(input.secrets.sshPassphrase)
        const connectionString = applySecret(input.secrets.connectionString)
        if (sshPassword !== undefined) config.sshPassword = sshPassword
        if (sshPrivateKey !== undefined) config.sshPrivateKey = sshPrivateKey
        if (sshPassphrase !== undefined) config.sshPassphrase = sshPassphrase
        if (connectionString !== undefined) config.connectionString = connectionString
    }

    config.set("_auditContext", { userId: actor.userId })
    await config.save()

    await recordAudit({
        userId: actor.userId,
        entidade: ENVIRONMENT_REPO_AUDIT_ENTITY,
        entidadeId: projectId,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: before,
        depois: {
            mode: config.mode,
            host: config.host,
            sshPort: config.sshPort,
            sshUser: config.sshUser,
            authMethod: config.authMethod,
            cdWorkflow: config.cdWorkflow,
            repositoryDirectory: config.repositoryDirectory,
            ...(input.secrets && Object.keys(input.secrets).length > 0 ? { segmentos: "alterados" } : {}),
        },
    })
    return config.toObject() as IEnvironmentRepoConfig
}

/** Conexão resolvida (com segredos em claro) para criar o `EnvironmentHost`. SOMENTE servidor. */
export function resolveRepoConnection(config: IEnvironmentRepoConfig): ResolvedRepoConnection {
    return {
        mode: config.mode,
        host: config.host,
        sshPort: config.sshPort,
        sshUser: config.sshUser,
        authMethod: config.authMethod,
        sshKeyPath: config.sshKeyPath,
        repositoryDirectory: config.repositoryDirectory,
        sshPassword: decryptOrNull(config.sshPassword),
        sshPrivateKey: decryptOrNull(config.sshPrivateKey),
        sshPassphrase: decryptOrNull(config.sshPassphrase),
    }
}

/** Connection string do repositório (padrão), em claro. `null` = não configurada. */
export function repoConnectionString(config: IEnvironmentRepoConfig): string | null {
    return decryptOrNull(config.connectionString)
}

/** Decripta a connection string de um ambiente (override). */
export function environmentConnectionString(box: unknown): string | null {
    return decryptOrNull(box)
}
