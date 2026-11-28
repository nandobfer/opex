import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    request: vi.fn(),
    paginate: vi.fn(async () => [{ login: 'minha-org', avatar_url: null }]),
    linked: false,
    active: null as { _id: string } | null,
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/features/github/client', async (importOriginal) => ({ ...(await importOriginal<object>()), githubRequest: mocks.request, githubPaginate: mocks.paginate }))
vi.mock('@/lib/db/models/Project', () => ({ Project: { exists: vi.fn(async () => (mocks.linked ? { _id: 'p' } : null)) } }))
vi.mock('@/lib/db/models/TaskBoard', () => ({ TaskBoardColumn: {}, TaskBoardLayout: {} }))
vi.mock('@/features/project-bootstrap/server/models', () => ({ ProjectBootstrap: { findOne: vi.fn(() => ({ select: () => ({ lean: async () => mocks.active }) })) } }))

import { GithubError } from '@/features/github/client'
import { checkRepoName } from '@/features/project-bootstrap/server/github'

beforeEach(() => {
    mocks.linked = false
    mocks.active = null
    mocks.request.mockReset()
    mocks.request.mockImplementation(async (path: string) => {
        if (path === '/user') return { login: 'nandobfer', avatar_url: null }
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

    it('nome livre: o repositório será criado', async () => {
        expect(await checkRepoName('minha-org', 'app')).toMatchObject({ state: 'free', blocked: false, repo: 'minha-org/app' })
    })

    it('existente e não vinculado: modo existente com a branch padrão', async () => {
        mocks.request.mockImplementation(async (path: string) => (path === '/user' ? { login: 'nandobfer' } : { full_name: 'nandobfer/app', private: false, default_branch: 'develop' }))
        expect(await checkRepoName('nandobfer', 'App')).toMatchObject({ state: 'existing', blocked: false, defaultBranch: 'develop', private: false, message: 'Este repositório já existe no GitHub: o bootstrap vai usá-lo' })
    })

    it('já vinculado a um projeto ou com bootstrap em andamento: bloqueia', async () => {
        mocks.linked = true
        expect(await checkRepoName('nandobfer', 'app')).toMatchObject({ state: 'linked', blocked: true })
        mocks.linked = false
        mocks.active = { _id: 'b'.repeat(24) }
        expect(await checkRepoName('nandobfer', 'app')).toMatchObject({ state: 'in-progress', blocked: true, bootstrapId: 'b'.repeat(24) })
    })
})
