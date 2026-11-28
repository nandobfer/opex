import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection } from '../../helpers/fake-collection'

/**
 * Regressão (OPE-215): a migração `project-bootstrap-catalog` roda DENTRO de `runMigrations()`, que o
 * `dbConnect()` espera. Se a carga chamar `dbConnect()` de novo, ela espera a própria migração e todo
 * `dbConnect()` do processo trava (a prévia ficou carregando para sempre). Aqui o `dbConnect` e o
 * `runMigrations` são os reais; só a conexão, o registro (só esta migração) e os modelos são falsos.
 */

const stores = vi.hoisted(() => ({ groups: null as unknown, technologies: null as unknown, features: null as unknown }))

vi.mock('@/lib/db/connection', () => ({ connectMongo: vi.fn(async () => ({ name: 'conexão' })) }))
vi.mock('@/lib/db/migrations/registry', async () => {
    const { registerMigrations } = await import('@/lib/db/migrations')
    const { seedProjectBootstrapCatalog } = await import('@/lib/db/migrations/project-bootstrap-catalog')
    registerMigrations({ name: 'project-bootstrap-catalog', run: () => seedProjectBootstrapCatalog() })
    return {}
})
vi.mock('@/lib/audit/record', () => ({ AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' }, recordAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/db/plugins/audit.plugin', () => ({ createAuditContext: vi.fn(), auditPlugin: vi.fn() }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/project-bootstrap/server/models', () => ({
    get ProjectBootstrapTechGroup() {
        return stores.groups
    },
    get ProjectBootstrapTechnology() {
        return stores.technologies
    },
}))
vi.mock('@/lib/db/models/Ai', () => ({
    get AiFeatureSetting() {
        return stores.features
    },
}))

import { dbConnect } from '@/lib/db'
import { CATALOG_SEED_FEATURE } from '@/features/project-bootstrap/server/catalog'
import { SEED_TECH_GROUPS } from '@/features/project-bootstrap/seed/technologies'

type Fake = ReturnType<typeof createFakeCollection> & { exists: (filter: Record<string, unknown>) => Promise<unknown> }

/** Coleção falsa com `exists` e `upsert` (`$setOnInsert`), como a carga inicial usa. */
function fake(): Fake {
    const collection = createFakeCollection() as Fake
    collection.exists = async (filter) => ((await collection.countDocuments(filter)) > 0 ? { _id: 'x' } : null)
    const updateOne = collection.updateOne
    collection.updateOne = (async (filter: Record<string, unknown>, update: Record<string, unknown>, options?: { upsert?: boolean }) => {
        const result = await updateOne(filter, update)
        if (!result.matchedCount && options?.upsert) collection.insert({ ...filter, ...((update.$setOnInsert as Record<string, unknown>) ?? {}) })
        return result
    }) as Fake['updateOne']
    const findOneAndUpdate = collection.findOneAndUpdate
    collection.findOneAndUpdate = ((filter: Record<string, unknown>, update: Record<string, unknown>, options: { upsert?: boolean; new?: boolean } = {}) => {
        if (options.upsert && !collection.docs.some((doc) => doc.name === filter.name)) collection.insert({ ...filter, ...((update.$setOnInsert as Record<string, unknown>) ?? {}) })
        return findOneAndUpdate(filter, {}, { new: true })
    }) as Fake['findOneAndUpdate']
    return collection
}

/** `dbConnect()` precisa terminar; preso = deadlock nas migrações. */
function withinTimeout<T>(promise: Promise<T>, ms = 2000): Promise<T> {
    return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('deadlock nas migrações: dbConnect() não terminou')), ms))])
}

beforeEach(() => {
    stores.groups = fake()
    stores.technologies = fake()
    stores.features = fake()
})

describe('migração project-bootstrap-catalog pelo dbConnect real', () => {
    it('dbConnect() termina e a carga inicial fica gravada com a marca', async () => {
        await expect(withinTimeout(dbConnect())).resolves.toEqual({ name: 'conexão' })
        const groups = (stores.groups as Fake).docs.map((doc) => doc.name)
        expect(groups).toEqual(SEED_TECH_GROUPS.map((group) => group.name))
        expect((stores.technologies as Fake).docs.length).toBe(SEED_TECH_GROUPS.reduce((sum, group) => sum + group.technologies.length, 0))
        expect((stores.features as Fake).docs.map((doc) => doc.feature)).toEqual([CATALOG_SEED_FEATURE])
    })

    it('uma segunda conexão termina e não roda a migração de novo', async () => {
        await withinTimeout(dbConnect())
        const before = (stores.groups as Fake).docs.length
        ;(stores.groups as Fake).docs.splice(0, before)
        await expect(withinTimeout(dbConnect())).resolves.toEqual({ name: 'conexão' })
        expect((stores.groups as Fake).docs).toHaveLength(0)
    })
})
