/**
 * Coleção em memória com o subconjunto de Mongoose usado pelos serviços da integração GitHub
 * (find/findOne/findById/create/updateOne/updateMany/findOneAndUpdate/deleteOne/exists/
 * countDocuments). Filtros: igualdade, `$in`, `$ne` e `$lte`.
 */

export type Doc = Record<string, unknown>

let seq = 0
export const fakeId = () => (++seq).toString(16).padStart(24, "0")

function matchValue(actual: unknown, expected: unknown): boolean {
    if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
        const ops = expected as Record<string, unknown>
        if ("$in" in ops) return (ops.$in as unknown[]).includes(actual)
        if ("$ne" in ops) return (actual ?? null) !== ops.$ne
        if ("$lte" in ops) return actual instanceof Date && actual <= (ops.$lte as Date)
    }
    if (Array.isArray(actual) && !Array.isArray(expected)) return actual.includes(expected)
    return (actual ?? null) === (expected ?? null) || String(actual) === String(expected)
}

const matches = (doc: Doc, filter: Doc) => Object.entries(filter).every(([key, value]) => matchValue(doc[key], value))

function applyUpdate(doc: Doc, update: Doc, inserting: boolean): void {
    const ops = update as { $set?: Doc; $setOnInsert?: Doc; $addToSet?: Doc }
    if (!ops.$set && !ops.$setOnInsert && !ops.$addToSet) Object.assign(doc, update)
    if (ops.$set) Object.assign(doc, ops.$set)
    if (inserting && ops.$setOnInsert) Object.assign(doc, ops.$setOnInsert)
    for (const [key, value] of Object.entries(ops.$addToSet ?? {})) {
        const list = Array.isArray(doc[key]) ? (doc[key] as unknown[]) : []
        if (!list.includes(value)) list.push(value)
        doc[key] = list
    }
}

function query<T>(result: () => T) {
    let sorter: ((list: Doc[]) => Doc[]) | null = null
    let max: number | null = null
    const resolve = () => {
        const value = result() as unknown
        if (!Array.isArray(value)) return value as T
        let list = [...(value as Doc[])]
        if (sorter) list = sorter(list)
        if (max !== null) list = list.slice(0, max)
        return list.map((doc) => ({ ...doc })) as T
    }
    const chain = {
        sort: (spec: Record<string, 1 | -1>) => {
            const [[field, dir]] = Object.entries(spec)
            sorter = (list) => list.sort((a, b) => ((a[field!] as number) > (b[field!] as number) ? dir! : -dir!))
            return chain
        },
        select: () => chain,
        limit: (n: number) => {
            max = n
            return chain
        },
        lean: async () => resolve(),
        catch: () => chain,
        then: (onFulfilled: (value: T) => unknown, onRejected?: (error: unknown) => unknown) => Promise.resolve().then(resolve).then(onFulfilled, onRejected),
    }
    return chain
}

export function memoryModel() {
    const docs: Doc[] = []
    const first = (filter: Doc, sort?: Record<string, 1 | -1>) => {
        const found = docs.filter((doc) => matches(doc, filter))
        if (sort) {
            const [[field, dir]] = Object.entries(sort)
            found.sort((a, b) => ((a[field!] as number) > (b[field!] as number) ? dir! : -dir!))
        }
        return found[0] ?? null
    }
    return {
        docs,
        find: (filter: Doc = {}) => query(() => docs.filter((doc) => matches(doc, filter))),
        findOne: (filter: Doc = {}) => {
            let spec: Record<string, 1 | -1> | undefined
            const chain = {
                sort: (value: Record<string, 1 | -1>) => {
                    spec = value
                    return chain
                },
                select: () => chain,
                lean: async () => {
                    const found = first(filter, spec)
                    return found ? { ...found } : null
                },
            }
            return chain
        },
        findById: (id: string) => query(() => {
            const found = docs.find((doc) => String(doc._id) === String(id))
            return found ? { ...found } : null
        }),
        create: async (doc: Doc) => {
            const created = { _id: fakeId(), createdAt: new Date(), updatedAt: new Date(), ...doc }
            docs.push(created)
            return created
        },
        updateOne: async (filter: Doc, update: Doc, options?: { upsert?: boolean }) => {
            const found = docs.find((doc) => matches(doc, filter))
            if (found) {
                applyUpdate(found, update, false)
                return { upsertedCount: 0, modifiedCount: 1 }
            }
            if (options?.upsert) {
                const doc: Doc = { _id: fakeId(), ...Object.fromEntries(Object.entries(filter).filter(([, value]) => typeof value !== "object" || value === null)) }
                applyUpdate(doc, update, true)
                docs.push(doc)
                return { upsertedCount: 1, modifiedCount: 0 }
            }
            return { upsertedCount: 0, modifiedCount: 0 }
        },
        updateMany: async (filter: Doc, update: Doc) => {
            for (const doc of docs.filter((item) => matches(item, filter))) applyUpdate(doc, update, false)
        },
        findOneAndUpdate: (filter: Doc, update: Doc) =>
            query(() => {
                const found = docs.find((doc) => matches(doc, filter))
                if (!found) return null
                applyUpdate(found, update, false)
                return { ...found }
            }),
        deleteOne: async (filter: Doc) => {
            const index = docs.findIndex((doc) => matches(doc, filter))
            if (index !== -1) docs.splice(index, 1)
        },
        exists: async (filter: Doc) => (docs.some((doc) => matches(doc, filter)) ? { _id: "x" } : null),
        countDocuments: async (filter: Doc = {}) => docs.filter((doc) => matches(doc, filter)).length,
        aggregate: async () => [],
    }
}

export type MemoryModel = ReturnType<typeof memoryModel>
