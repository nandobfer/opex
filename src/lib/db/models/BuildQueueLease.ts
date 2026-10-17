import { Schema, model, models, type Model } from "mongoose"
interface IBuildQueueLease {
    _id: string
    holder: string
    expiresAt: Date
}
const schema = new Schema<IBuildQueueLease>(
    { _id: String, holder: { type: String, required: true }, expiresAt: { type: Date, required: true } },
    { collection: "build_queue_leases", versionKey: false },
)
export const BuildQueueLease: Model<IBuildQueueLease> =
    (models.BuildQueueLease as Model<IBuildQueueLease>) || model<IBuildQueueLease>("BuildQueueLease", schema)
