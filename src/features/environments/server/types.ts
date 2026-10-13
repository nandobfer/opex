import type { Types } from "mongoose"

/** Documento com `_id` (o que `.lean()` devolve). */
export type WithId<T> = T & { _id: Types.ObjectId }
