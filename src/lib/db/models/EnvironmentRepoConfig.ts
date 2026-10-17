import { Schema, model, models, type Model } from "mongoose"
import type { RepoConfigInput } from "@/features/environments/schemas"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"

export interface IEnvironmentRepoConfig {
    projectId: string
    config: RepoConfigInput
    secrets: EncryptedSecret | null
    revision: number
    updatedBy: string
    createdAt: Date
    updatedAt: Date
}
const schema = new Schema<IEnvironmentRepoConfig>(
    {
        projectId: { type: String, required: true, unique: true },
        config: { type: Schema.Types.Mixed, required: true },
        secrets: { type: Schema.Types.Mixed, default: null, select: false },
        revision: { type: Number, default: 0 },
        updatedBy: { type: String, required: true },
    },
    { collection: "environment_repos", timestamps: true },
)
export const EnvironmentRepoConfig: Model<IEnvironmentRepoConfig> =
    (models.EnvironmentRepoConfig as Model<IEnvironmentRepoConfig>) ||
    model<IEnvironmentRepoConfig>("EnvironmentRepoConfig", schema)
