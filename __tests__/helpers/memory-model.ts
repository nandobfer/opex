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
        const asTime = (value: unknown) => (value instanceof Date ? value.getTime() : new Date(value as string).getTime())
        const actualTime = actual == null ? null : asTime(actual)
        if ("$in" in ops && !(ops.$in as unknown[]).includes(actual)) return false
        if ("$ne" in ops && (actual ?? null) === ops.$ne) return false
        if ("$exists" in ops) {
            const present = actual !== undefined && actual !== null
            if (Boolean(ops.$exists) !== present) return false
        }
        if ("$lte" in ops && !(actualTime !== null && actualTime <= asTime(ops.$lte))) return false
        if ("$gte" in ops && !(actualTime !== null && actualTime >= asTime(ops.$gte))) return false
        if ("$lt" in ops && !(actualTime !== null && actualTime < asTime(ops.$lt))) return false
        if ("$gt" in ops && !(actualTime !== null && actualTime > asTime(ops.$gt))) return false
        if ("$in" in ops || "$ne" in ops || "$exists" in ops || "$lte" in ops || "$gte" in ops || "$lt" in ops || "$gt" in ops) return true
    }
    if (Array.isArray(actual) && !Array.isArray(expected)) return actual.includes(expected)
    return (actual ?? null) === (expected ?? null) || String(actual) === String(expected)
}

/**
 * Resolve um caminho com pontos (`memberships.clientId`) num documento. Ao entrar num array, aplica
 * o restante do caminho a cada elemento e devolve a lista de valores (semântica de array do Mongo).
 */
function getPath(doc: Doc, path: string): unknown {
    const parts = path.split(".")
    let current: unknown = doc
    for (let index = 0; index < parts.length; index++) {
        if (Array.isArray(current)) {
            const rest = parts.slice(index).join(".")
            return current.flatMap((item) => {
                const value = getPath(item as Doc, rest)
                return value === undefined ? [] : [value]
            })
        }
        if (current == null) return undefined
        current = (current as Doc)[parts[index]!]
    }
    return current
}

const matches = (doc: Doc, filter: Doc) => Object.entries(filter).every(([key, value]) => matchValue(getPath(doc, key), value))

function applyUpdate(doc: Doc, update: Doc, inserting: boolean): void {
    const ops = update as { $set?: Doc; $setOnInsert?: Doc; $addToSet?: Doc; $inc?: Record<string, number>; $unset?: Doc; $pull?: Doc }
    if (!ops.$set && !ops.$setOnInsert && !ops.$addToSet && !ops.$inc && !ops.$unset && !ops.$pull) Object.assign(doc, update)
    if (ops.$set) Object.assign(doc, ops.$set)
    if (inserting && ops.$setOnInsert) Object.assign(doc, ops.$setOnInsert)
    for (const [key, value] of Object.entries(ops.$inc ?? {})) doc[key] = ((doc[key] as number) ?? 0) + value
    for (const key of Object.keys(ops.$unset ?? {})) delete doc[key]
    for (const [key, value] of Object.entries(ops.$addToSet ?? {})) {
        const list = Array.isArray(doc[key]) ? (doc[key] as unknown[]) : []
        if (!list.includes(value)) list.push(value)
        doc[key] = list
    }
    for (const [key, value] of Object.entries(ops.$pull ?? {})) {
        const list = Array.isArray(doc[key]) ? (doc[key] as unknown[]) : []
        const isDoc = value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
        doc[key] = list.filter((item) => (isDoc ? !matches(item as Doc, value as Doc) : !matchValue(item, value)))
    }
}

function query<T>(result: () => T) {
    let sorter: ((list: Doc[]) => Doc[]) | null = null
    let max: number | null = null
    let offset = 0
    const resolve = () => {
        const value = result() as unknown
        if (!Array.isArray(value)) return value as T
        let list = [...(value as Doc[])]
        if (sorter) list = sorter(list)
        if (offset > 0) list = list.slice(offset)
        if (max !== null) list = list.slice(0, max)
        return list.map((doc) => ({ ...doc })) as T
    }
    const chain = {
        sort: (spec: Record<string, 1 | -1>) => {
            const [[field, dir]] = Object.entries(spec)
            sorter = (list) =>
                list.sort((a, b) => {
                    const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v)
                    const av = norm(a[field!])
                    const bv = norm(b[field!])
                    if (av === bv) return 0
                    return (av as number) > (bv as number) ? dir! : -dir!
                })
            return chain
        },
        select: () => chain,
        limit: (n: number) => {
            max = n
            return chain
        },
        skip: (n: number) => {
            offset = n
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
            const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v)
            found.sort((a, b) => {
                const av = norm(a[field!])
                const bv = norm(b[field!])
                if (av === bv) return 0
                return (av as number) > (bv as number) ? dir! : -dir!
            })
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
                collation: () => chain,
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
            return { ...created, toObject: () => ({ ...created }) }
        },
        insertMany: async (items: Doc[]) => {
            const created = items.map((doc) => ({ _id: fakeId(), createdAt: new Date(), updatedAt: new Date(), ...doc }))
            docs.push(...created)
            return created.map((doc) => ({ ...doc }))
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
        deleteMany: async (filter: Doc) => {
            for (let i = docs.length - 1; i >= 0; i--) if (matches(docs[i]!, filter)) docs.splice(i, 1)
        },
        exists: async (filter: Doc) => (docs.some((doc) => matches(doc, filter)) ? { _id: "x" } : null),
        countDocuments: async (filter: Doc = {}) => docs.filter((doc) => matches(doc, filter)).length,
        aggregate: async () => [],
    }
}

export type MemoryModel = ReturnType<typeof memoryModel>
