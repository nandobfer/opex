import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Rotas da reorganização do acervo (OPE-132): validação do corpo e repasse ao serviço. */

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  recover: vi.fn(async () => undefined),
  list: vi.fn(),
  apply: vi.fn(),
  discard: vi.fn(),
  preview: vi.fn(),
  settings: vi.fn(),
}))

vi.mock('@/features/adversarial-agent/server/mentor/reorg-queue', () => ({ startMentorReorg: mocks.start, cancelMentorReorg: mocks.cancel, recoverOrphanMentorReorgs: mocks.recover }))
vi.mock('@/features/adversarial-agent/server/mentor/reorganize', () => ({ listMentorReorgs: mocks.list, applyMentorReorg: mocks.apply, discardMentorReorg: mocks.discard, previewMentorReorg: mocks.preview }))
vi.mock('@/features/adversarial-agent/server/mentor/settings', () => ({ loadMentorSettings: mocks.settings }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local', name: 'Eu' }), LOCAL_USER_ID: 'local' }))

import { NextRequest } from 'next/server'
import { DEFAULT_MENTOR_SETTINGS } from '@/features/adversarial-agent/mentor/schemas'
import { GET as listRoute, POST as startRoute } from '@/app/api/adversarial/mentor/reorganizations/route'
import { GET as previewRoute } from '@/app/api/adversarial/mentor/reorganizations/preview-count/route'
import { POST as cancelRoute } from '@/app/api/adversarial/mentor/reorganizations/[id]/cancel/route'
import { POST as applyRoute } from '@/app/api/adversarial/mentor/reorganizations/[id]/apply/route'
import { POST as discardRoute } from '@/app/api/adversarial/mentor/reorganizations/[id]/discard/route'

const request = (path: string, body?: unknown) => new NextRequest(`http://opex${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.settings.mockResolvedValue({ settings: structuredClone(DEFAULT_MENTOR_SETTINGS), isDefault: true, updatedAt: null })
  mocks.list.mockResolvedValue({ items: [], centrals: [] })
  mocks.preview.mockResolvedValue({ memories: 2, calls: 4, averageCostUsdPerMemory: null })
  mocks.start.mockResolvedValue({ id: 'r1' })
  mocks.apply.mockResolvedValue({ id: 'r1', status: 'applied' })
  mocks.discard.mockResolvedValue({ id: 'r1', status: 'discarded' })
  mocks.cancel.mockResolvedValue({ id: 'r1', status: 'cancelled' })
})

describe('rotas da reorganização', () => {
  it('inicia com o recorte validado e a configuração do Mentor', async () => {
    const res = await startRoute(request('/api/adversarial/mentor/reorganizations', { targets: ['adversarial', 'developer-global'], centralIds: ['c1'] }))
    expect(res.status).toBe(200)
    expect(mocks.start).toHaveBeenCalledWith({ targets: ['adversarial', 'developer-global'], centralIds: ['c1'] }, expect.objectContaining({ targets: expect.any(Object) }), 'local')
  })

  it('destino desconhecido no recorte: 400, sem iniciar', async () => {
    const res = await startRoute(request('/api/adversarial/mentor/reorganizations', { targets: ['outra'] }))
    expect(res.status).toBe(400)
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('lista o histórico e recupera as órfãs antes', async () => {
    const res = await listRoute(request('/api/adversarial/mentor/reorganizations'))
    expect(res.status).toBe(200)
    expect(mocks.recover).toHaveBeenCalled()
    expect(mocks.list).toHaveBeenCalled()
  })

  it('a estimativa lê os CSVs da query', async () => {
    const res = await previewRoute(request('/api/adversarial/mentor/reorganizations/preview-count?targets=adversarial,developer-global&centralIds=c1'))
    expect(res.status).toBe(200)
    expect(mocks.preview).toHaveBeenCalledWith({ targets: ['adversarial', 'developer-global'], centralIds: ['c1'] }, expect.anything())
    expect((await res.json()).data).toMatchObject({ memories: 2, calls: 4 })
  })

  it('aprova itens com texto e confirmação do dono; texto grande é recusado', async () => {
    const res = await applyRoute(request('/api/adversarial/mentor/reorganizations/r1/apply', { itemIds: ['i1'], overrides: { i1: { text: 'Regra nova', confirmOwner: true } } }), params('r1'))
    expect(res.status).toBe(200)
    expect(mocks.apply).toHaveBeenCalledWith('r1', { itemIds: ['i1'], overrides: { i1: { text: 'Regra nova', confirmOwner: true } } }, 'local')
    const invalid = await applyRoute(request('/api/adversarial/mentor/reorganizations/r1/apply', { overrides: { i1: { text: 'x'.repeat(5000) } } }), params('r1'))
    expect(invalid.status).toBe(400)
    expect(mocks.apply).toHaveBeenCalledTimes(1)
  })

  it('descarta tudo (sem itens) e cancela pelo id', async () => {
    expect((await discardRoute(request('/api/adversarial/mentor/reorganizations/r1/discard', {}), params('r1'))).status).toBe(200)
    expect(mocks.discard).toHaveBeenCalledWith('r1', {}, 'local')
    expect((await cancelRoute(request('/api/adversarial/mentor/reorganizations/r1/cancel'), params('r1'))).status).toBe(200)
    expect(mocks.cancel).toHaveBeenCalledWith('r1')
  })
})
