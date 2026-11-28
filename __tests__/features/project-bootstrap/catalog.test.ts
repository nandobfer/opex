import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection } from '../../helpers/fake-collection'

const mocks = vi.hoisted(() => ({ recordAudit: vi.fn(async () => {}), publishAppEvent: vi.fn(async () => {}) }))

const stores = vi.hoisted(() => ({ groups: null as unknown, technologies: null as unknown, features: null as unknown }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent }))
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

import { createTechGroup, createTechnology, deleteTechGroup, getTechCatalog, seedTechCatalog } from '@/features/project-bootstrap/server/catalog'
import { SEED_TECH_GROUPS } from '@/features/project-bootstrap/seed/technologies'

type Fake = ReturnType<typeof createFakeCollection> & { exists: (filter: Record<string, unknown>) => Promise<unknown> }

function fake(): Fake {
    const collection = createFakeCollection() as Fake
    collection.exists = async (filter) => ((await collection.countDocuments(filter)) > 0 ? { _id: 'x' } : null)
    const updateOne = collection.updateOne
    // `upsert` com `$setOnInsert` (a carga inicial): insere quando nada casa.
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

beforeEach(() => {
    stores.groups = fake()
    stores.technologies = fake()
    stores.features = fake()
    vi.clearAllMocks()
})

describe('catálogo de tecnologias', () => {
    it('um grupo com tecnologias não pode ser removido; vazio pode, com auditoria e evento', async () => {
        const group = await createTechGroup({ name: 'Linguagem', color: '#A855F7' }, 'local')
        await createTechnology({ name: 'Rust', aliases: ['rust-lang'], groupId: group.id }, 'local')
        await expect(deleteTechGroup(group.id, 'local')).rejects.toMatchObject({ status: 409, code: 'TECH_GROUP_IN_USE' })
        const empty = await createTechGroup({ name: 'Serviços', color: '#EC4899' }, 'local')
        await deleteTechGroup(empty.id, 'local')
        const catalog = await getTechCatalog()
        expect(catalog.groups.map((item) => [item.name, item.count])).toEqual([['Linguagem', 1]])
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'EXCLUIR', entidadeId: empty.id }))
        expect(mocks.publishAppEvent).toHaveBeenCalledWith('project-bootstrap-catalog-updated', { kind: 'group' })
    })

    it('tecnologia num grupo que não existe é recusada', async () => {
        await expect(createTechnology({ name: 'Go', aliases: [], groupId: 'f'.repeat(24) }, 'local')).rejects.toMatchObject({ code: 'TECH_GROUP_NOT_FOUND' })
    })

    it('a carga inicial grava os grupos uma única vez e não recria o que foi removido', async () => {
        expect(await seedTechCatalog()).toEqual({ seeded: true })
        const first = await getTechCatalog()
        expect(first.groups.map((group) => group.name)).toEqual(SEED_TECH_GROUPS.map((group) => group.name))
        expect(first.technologies.length).toBe(SEED_TECH_GROUPS.reduce((sum, group) => sum + group.technologies.length, 0))
        const groups = stores.groups as Fake
        groups.docs.splice(0, groups.docs.length)
        expect(await seedTechCatalog()).toEqual({ seeded: false })
        expect((await getTechCatalog()).groups).toEqual([])
    })
})
