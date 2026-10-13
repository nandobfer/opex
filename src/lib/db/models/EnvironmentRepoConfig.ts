import { Schema, model, models, type Model, type Types } from "mongoose"
import { auditPlugin } from "../plugins/audit.plugin"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"

/**
 * Configuração de **execução** de um repositório (Projeto) no módulo Ambientes
 * (`environment_repos`, uma por projeto). Define se o Opex fala com o Docker **local** (máquina do
 * Opencode) ou **remoto** (SSH) e guarda, **cifrados**, os segredos do host e a connection string
 * padrão do banco. Nenhum segredo é devolvido pela API (só `configured`/`unreadable`).
 */

export type EnvironmentMode = "local" | "remote"
export type SshAuthMethod = "key" | "password"

export interface IEnvironmentRepoConfig {
    _id: Types.ObjectId
    projectId: string
    repo: string
    name: string
    mode: EnvironmentMode
    host: string
    sshPort: number
    sshUser: string
    authMethod: SshAuthMethod
    sshKeyPath: string
    cdWorkflow: string
    /** Diretório base onde o Opex clona os repositórios no host do ambiente. */
    repositoryDirectory: string
    /** Segredos cifrados (AES-256-GCM). `null` = não configurado. */
    sshPassword: EncryptedSecret | null
    sshPrivateKey: EncryptedSecret | null
    sshPassphrase: EncryptedSecret | null
    /** Connection string padrão do banco do ambiente (pode ser sobrescrita por ambiente). */
    connectionString: EncryptedSecret | null
    createdBy: string
    createdAt: Date
    updatedBy: string
    updatedAt: Date
}

const EnvironmentRepoConfigSchema = new Schema<IEnvironmentRepoConfig>(
    {
        projectId: { type: String, required: true, unique: true },
        repo: { type: String, required: true },
        name: { type: String, required: true },
        mode: { type: String, enum: ["local", "remote"], default: "local" },
        host: { type: String, default: "" },
        sshPort: { type: Number, default: 22 },
        sshUser: { type: String, default: "" },
        authMethod: { type: String, enum: ["key", "password"], default: "key" },
        sshKeyPath: { type: String, default: "" },
        cdWorkflow: { type: String, default: "" },
        repositoryDirectory: { type: String, default: "" },
        sshPassword: { type: Schema.Types.Mixed, default: null },
        sshPrivateKey: { type: Schema.Types.Mixed, default: null },
        sshPassphrase: { type: Schema.Types.Mixed, default: null },
        connectionString: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "environment_repos", versionKey: false },
)

EnvironmentRepoConfigSchema.plugin(auditPlugin)

if (process.env.NODE_ENV === "development") {
    delete models.EnvironmentRepoConfig
}

export const EnvironmentRepoConfig: Model<IEnvironmentRepoConfig> =
    (models.EnvironmentRepoConfig as Model<IEnvironmentRepoConfig>) ||
    model<IEnvironmentRepoConfig>("EnvironmentRepoConfig", EnvironmentRepoConfigSchema)
