/**
 * Coleção Mongoose em memória para testes de serviço (só o que os serviços usam): filtros com
 * igualdade, caminho com ponto, `$in`, `$nin`, `$ne`, `$lt`, `$lte`, `$gte`; `$set`/`$inc`; `deleteOne`/`deleteMany`/`updateMany`; cadeias
 * `select/sort/skip/limit/lean`. Ids são strings de 24 hex (o `_id` vira objeto com `toString`).
 */

type Doc = Record<string, unknown> & { _id: FakeId }

export class FakeId {
    constructor(public readonly value: string) {}
    toString() {
        return this.value
    }
    toHexString() {
        return this.value
    }
    equals(other: unknown) {
        return String(other) === this.value
    }
}

let seq = 0
export const fakeId = () => new FakeId((++seq).toString(16).padStart(24, '0'))

const get = (doc: Record<string, unknown>, path: string): unknown =>
    path.split('.').reduce<unknown>((node, key) => {
        if (Array.isArray(node)) return node.map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined))
        return node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined
    }, doc)

const norm = (value: unknown): unknown => (value instanceof FakeId ? value.value : value instanceof Date ? value.getTime() : value)
const eq = (a: unknown, b: unknown) => (b === null ? a === null || a === undefined : a !== undefined && a !== null && String(norm(a)) === String(norm(b)))

function matchValue(actual: unknown, cond: unknown): boolean {
    if (Array.isArray(actual) && !(cond && typeof cond === 'object' && !(cond instanceof Date) && !(cond instanceof FakeId))) return actual.some((item) => matchValue(item, cond))
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !(cond instanceof FakeId) && !Array.isArray(cond)) {
        const ops = cond as Record<string, unknown>
        if (Object.keys(ops).some((key) => key.startsWith('$'))) {
            const values = Array.isArray(actual) ? actual : [actual]
            return Object.entries(ops).every(([op, value]) => {
                if (op === '$in') return values.some((item) => (value as unknown[]).some((option) => eq(item, option)))
                if (op === '$nin') return !values.some((item) => (value as unknown[]).some((option) => eq(item, option)))
                if (op === '$ne') return !values.some((item) => eq(item, value))
                if (op === '$lte') return values.some((item) => item !== null && item !== undefined && (norm(item) as number) <= (norm(value) as number))
                if (op === '$lt') return values.some((item) => item !== null && item !== undefined && (norm(item) as number) < (norm(value) as number))
                if (op === '$gte') return values.some((item) => item !== null && item !== undefined && (norm(item) as number) >= (norm(value) as number))
                throw new Error(`operador não suportado: ${op}`)
            })
        }
    }
    return eq(actual, cond)
}

export const matches = (doc: Record<string, unknown>, filter: Record<string, unknown> = {}) => Object.entries(filter).every(([path, cond]) => matchValue(get(doc, path), cond))

function set(doc: Record<string, unknown>, path: string, value: unknown) {
    const keys = path.split('.')
    let node = doc
    for (const key of keys.slice(0, -1)) {
        if (!node[key] || typeof node[key] !== 'object') node[key] = {}
        node = node[key] as Record<string, unknown>
    }
    node[keys[keys.length - 1]!] = value
}

function apply(doc: Record<string, unknown>, update: Record<string, unknown>) {
    const ops = Object.keys(update).some((key) => key.startsWith('$')) ? update : { $set: update }
    for (const [path, value] of Object.entries((ops.$set ?? {}) as Record<string, unknown>)) set(doc, path, structuredCloneSafe(value))
    for (const [path, value] of Object.entries((ops.$inc ?? {}) as Record<string, number>)) set(doc, path, ((get(doc, path) as number) ?? 0) + value)
    doc.updatedAt = new Date()
}

const structuredCloneSafe = <T>(value: T): T => value

function chain<T>(run: (state: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number }) => T) {
    const state: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number } = {}
    const api = {
        select: () => api,
        sort: (sort: Record<string, 1 | -1>) => ((state.sort = sort), api),
        skip: (skip: number) => ((state.skip = skip), api),
        limit: (limit: number) => ((state.limit = limit), api),
        lean: async () => run(state),
        exec: async () => run(state),
        then: (resolve: (value: T) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve().then(() => run(state)).then(resolve, reject),
    }
    return api
}

export function createFakeCollection(defaults: () => Record<string, unknown> = () => ({})) {
    const docs: Doc[] = []
    const clone = (doc: Doc | undefined | null) => (doc ? ({ ...doc } as Doc) : null)
    const findMany = (filter: Record<string, unknown>, state: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number }) => {
        let rows = docs.filter((doc) => matches(doc, filter))
        if (state.sort) {
            const entries = Object.entries(state.sort)
            rows = [...rows].sort((a, b) => {
                for (const [key, dir] of entries) {
                    const x = norm(get(a, key)) as number | string
                    const y = norm(get(b, key)) as number | string
                    if (x === y) continue
                    return (x > y ? 1 : -1) * dir
                }
                return 0
            })
        }
        const start = state.skip ?? 0
        return rows.slice(start, start + (state.limit ?? rows.length)).map((doc) => clone(doc)!)
    }
    const model = {
        docs,
        insert(doc: Record<string, unknown>) {
            const row = { _id: fakeId(), createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...doc } as Doc
            docs.push(row)
            return row
        },
        async create(doc: Record<string, unknown>) {
            const row = model.insert(doc)
            return { ...row, toObject: () => clone(row) }
        },
        find: (filter: Record<string, unknown> = {}) => chain((state) => findMany(filter, state)),
        findOne: (filter: Record<string, unknown> = {}) => chain((state) => findMany(filter, { ...state, limit: 1 })[0] ?? null),
        findById: (id: unknown) => chain(() => clone(docs.find((doc) => String(doc._id) === String(id)))),
        async countDocuments(filter: Record<string, unknown> = {}) {
            return docs.filter((doc) => matches(doc, filter)).length
        },
        async distinct(path: string, filter: Record<string, unknown> = {}) {
            return [...new Set(docs.filter((doc) => matches(doc, filter)).map((doc) => get(doc, path)))]
        },
        findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>, options: { new?: boolean } = {}) =>
            chain(() => {
                const doc = docs.find((row) => matches(row, filter))
                if (!doc) return null
                const before = clone(doc)
                apply(doc, update)
                return options.new ? clone(doc) : before
            }),
        async deleteOne(filter: Record<string, unknown> = {}) {
            const index = docs.findIndex((row) => matches(row, filter))
            if (index >= 0) docs.splice(index, 1)
            return { deletedCount: index >= 0 ? 1 : 0 }
        },
        async updateMany(filter: Record<string, unknown>, update: Record<string, unknown>) {
            const rows = docs.filter((row) => matches(row, filter))
            for (const row of rows) apply(row, update)
            return { modifiedCount: rows.length, matchedCount: rows.length }
        },
        async deleteMany(filter: Record<string, unknown> = {}) {
            const before = docs.length
            for (let index = docs.length - 1; index >= 0; index--) if (matches(docs[index]!, filter)) docs.splice(index, 1)
            return { deletedCount: before - docs.length }
        },
        async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
            const doc = docs.find((row) => matches(row, filter))
            if (!doc) return { modifiedCount: 0, matchedCount: 0 }
            apply(doc, update)
            return { modifiedCount: 1, matchedCount: 1 }
        },
    }
    return model
}

export type FakeCollection = ReturnType<typeof createFakeCollection>
