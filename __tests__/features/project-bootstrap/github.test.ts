import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    request: vi.fn(),
    paginate: vi.fn(async () => [{ login: 'minha-org', avatar_url: null }]),
    linked: false,
    active: null as { _id: string } | null,
    lastLink: null as { entryColumnKey: string; closedColumnKey: string | null } | null,
    columns: [] as { key: string }[],
    layout: null as { order: string[] } | null,
}))
const query = <T,>(value: () => T) => ({ select: () => ({ lean: async () => value(), sort: () => ({ lean: async () => value() }) }), sort: () => ({ select: () => ({ lean: async () => value() }) }), lean: async () => value() })

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/features/github/client', async (importOriginal) => ({ ...(await importOriginal<object>()), githubRequest: mocks.request, githubPaginate: mocks.paginate }))
vi.mock('@/lib/db/models/Project', () => ({ Project: { exists: vi.fn(async () => (mocks.linked ? { _id: 'p' } : null)), findOne: () => query(() => mocks.lastLink) } }))
vi.mock('@/lib/db/models/TaskBoard', () => ({
    TaskBoardColumn: { find: (filter?: { key?: { $in: string[] } }) => query(() => (filter?.key ? mocks.columns.filter((column) => filter.key!.$in.includes(column.key)) : mocks.columns)) },
    TaskBoardLayout: { findOne: () => query(() => mocks.layout) },
}))
vi.mock('@/features/project-bootstrap/server/models', () => ({ ProjectBootstrap: { findOne: vi.fn(() => ({ select: () => ({ lean: async () => mocks.active }) })) } }))

import { GithubError } from '@/features/github/client'
import { assertBootstrapColumns, checkRepoName, initialLinkColumns } from '@/features/project-bootstrap/server/github'

/** Respostas do GitHub por caminho; o que não está no mapa responde 404. */
let routes: Record<string, unknown> = {}

beforeEach(() => {
    mocks.linked = false
    mocks.active = null
    routes = { '/user': { login: 'nandobfer', avatar_url: null }, '/user/memberships/orgs/minha-org': { state: 'active', role: 'admin' } }
    mocks.request.mockReset()
    mocks.request.mockImplementation(async (path: string) => {
        if (path in routes) return routes[path]
        throw new GithubError('Não encontrado', 'NOT_FOUND', 404)
    })
})

describe('checkRepoName', () => {
    it('nome inválido bloqueia sem chamar o GitHub', async () => {
        expect(await checkRepoName('nandobfer', 'meu repo')).toMatchObject({ state: 'invalid', blocked: true })
        expect(mocks.request).not.toHaveBeenCalled()
    })

    it('dono fora do alcance do token bloqueia', async () => {
        expect(await checkRepoName('outra-org', 'app')).toMatchObject({ state: 'forbidden', blocked: true })
    })

    it('nome livre: o repositório será criado (conta pessoal ou dono da organização)', async () => {
        expect(await checkRepoName('nandobfer', 'app')).toMatchObject({ state: 'free', blocked: false, repo: 'nandobfer/app' })
        expect(await checkRepoName('minha-org', 'app')).toMatchObject({ state: 'free', blocked: false, repo: 'minha-org/app' })
    })

    it('existente com escrita e não vinculado: modo existente com a branch padrão', async () => {
        routes['/repos/nandobfer/App'] = { full_name: 'nandobfer/app', private: false, default_branch: 'develop', permissions: { admin: false, push: true, pull: true } }
        expect(await checkRepoName('nandobfer', 'App')).toMatchObject({ state: 'existing', blocked: false, defaultBranch: 'develop', private: false, message: 'Este repositório já existe no GitHub: o bootstrap vai usá-lo' })
    })

    it('existente com o token só de leitura (ou sem as permissões na resposta): bloqueia antes de começar', async () => {
        routes['/repos/minha-org/app'] = { full_name: 'minha-org/app', private: true, default_branch: 'main', permissions: { admin: false, maintain: false, push: false, pull: true } }
        expect(await checkRepoName('minha-org', 'app')).toMatchObject({ state: 'forbidden', blocked: true, message: expect.stringContaining('só tem leitura') })
        routes['/repos/minha-org/app'] = { full_name: 'minha-org/app', private: true, default_branch: 'main' }
        expect(await checkRepoName('minha-org', 'app')).toMatchObject({ state: 'forbidden', blocked: true })
    })

    it('membro da organização sem permissão de criar repositórios: bloqueia (geral e por visibilidade)', async () => {
        routes['/user/memberships/orgs/minha-org'] = { state: 'active', role: 'member' }
        routes['/orgs/minha-org'] = { members_can_create_repositories: false }
        expect(await checkRepoName('minha-org', 'app')).toMatchObject({ state: 'forbidden', blocked: true, message: expect.stringContaining('não permite que o token crie repositórios') })
        routes['/orgs/minha-org'] = { members_can_create_repositories: true, members_can_create_private_repositories: false, members_can_create_public_repositories: true }
        expect(await checkRepoName('minha-org', 'app', { visibility: 'private' })).toMatchObject({ state: 'forbidden', message: expect.stringContaining('privados') })
        expect(await checkRepoName('minha-org', 'app', { visibility: 'public' })).toMatchObject({ state: 'free', blocked: false })
    })

    it('convite pendente na organização: bloqueia', async () => {
        routes['/user/memberships/orgs/minha-org'] = { state: 'pending', role: 'member' }
        expect(await checkRepoName('minha-org', 'app')).toMatchObject({ state: 'forbidden', message: expect.stringContaining('pendente') })
    })

    it('já vinculado a um projeto ou com bootstrap em andamento: bloqueia', async () => {
        mocks.linked = true
        expect(await checkRepoName('nandobfer', 'app')).toMatchObject({ state: 'linked', blocked: true })
        mocks.linked = false
        mocks.active = { _id: 'b'.repeat(24) }
        expect(await checkRepoName('nandobfer', 'app')).toMatchObject({ state: 'in-progress', blocked: true, bootstrapId: 'b'.repeat(24) })
    })
})

describe('colunas do vínculo', () => {
    beforeEach(() => {
        mocks.lastLink = null
        mocks.columns = [{ key: 'todo' }, { key: 'doing' }, { key: 'done' }]
        mocks.layout = { order: ['doing', 'todo', 'done'] }
    })

    it('padrão: as colunas do último vínculo criado', async () => {
        mocks.lastLink = { entryColumnKey: 'todo', closedColumnKey: 'done' }
        expect(await initialLinkColumns()).toEqual({ entryColumnKey: 'todo', closedColumnKey: 'done' })
    })

    it('último vínculo com a coluna de conclusão removida: mantém a entrada e zera a conclusão', async () => {
        mocks.lastLink = { entryColumnKey: 'todo', closedColumnKey: 'apagada' }
        expect(await initialLinkColumns()).toEqual({ entryColumnKey: 'todo', closedColumnKey: null })
    })

    it('último vínculo com a coluna de entrada removida, ou sem vínculo: a primeira coluna do quadro (ordem do layout), sem conclusão', async () => {
        mocks.lastLink = { entryColumnKey: 'apagada', closedColumnKey: 'done' }
        expect(await initialLinkColumns()).toEqual({ entryColumnKey: 'doing', closedColumnKey: null })
        mocks.lastLink = null
        expect(await initialLinkColumns()).toEqual({ entryColumnKey: 'doing', closedColumnKey: null })
    })

    it('sem layout salvo: a primeira coluna criada; quadro vazio: nenhuma', async () => {
        mocks.layout = null
        expect(await initialLinkColumns()).toEqual({ entryColumnKey: 'todo', closedColumnKey: null })
        mocks.columns = []
        expect(await initialLinkColumns()).toEqual({ entryColumnKey: null, closedColumnKey: null })
    })

    it('o envio recusa (400) coluna de entrada ou de conclusão que não existe no quadro', async () => {
        await expect(assertBootstrapColumns('todo', 'done')).resolves.toBeUndefined()
        await expect(assertBootstrapColumns('todo', null)).resolves.toBeUndefined()
        await expect(assertBootstrapColumns('apagada', null)).rejects.toMatchObject({ status: 400, code: 'COLUMN_NOT_FOUND' })
        await expect(assertBootstrapColumns('todo', 'apagada')).rejects.toMatchObject({ status: 400, code: 'COLUMN_NOT_FOUND' })
    })
})
