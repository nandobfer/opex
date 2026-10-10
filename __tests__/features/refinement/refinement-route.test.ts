import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    getState: vi.fn(),
    start: vi.fn(),
    del: vi.fn(),
    replyForm: vi.fn(),
    interrupt: vi.fn(),
    restart: vi.fn(),
    continueRun: vi.fn(),
}))

vi.mock('@/features/refinement/server/service', () => ({
    getRefinementState: mocks.getState,
    startRefinement: mocks.start,
    deleteRefinement: mocks.del,
    replyRefinementForm: mocks.replyForm,
    interruptRefinement: mocks.interrupt,
    restartRefinement: mocks.restart,
    continueRefinement: mocks.continueRun,
}))

import { GET, POST as START, DELETE } from '@/app/api/tasks/[id]/refinement/route'
import { POST as ACTION } from '@/app/api/tasks/[id]/refinement/actions/[action]/route'
import { POST as REPLY } from '@/app/api/tasks/[id]/refinement/forms/[formId]/route'

const params = (value: Record<string, string>) => ({ params: Promise.resolve(value) })
const req = (url: string, body?: unknown) => new NextRequest(url, body === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => vi.clearAllMocks())

describe('rotas do refinamento', () => {
    it('GET devolve o estado e a disponibilidade', async () => {
        mocks.getState.mockResolvedValue({ refinement: null, availability: { available: false, reason: 'desativada' } })
        const res = await GET(req('http://localhost/api/tasks/t1/refinement'), params({ id: 't1' }))
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ success: true, data: { refinement: null, availability: { available: false } } })
        expect(mocks.getState).toHaveBeenCalledWith('t1')
    })

    it('POST inicia o refinamento', async () => {
        mocks.start.mockResolvedValue({ refinement: { id: 'r1' }, availability: { available: true } })
        const res = await START(req('http://localhost/api/tasks/t1/refinement'), params({ id: 't1' }))
        expect(res.status).toBe(200)
        expect(mocks.start).toHaveBeenCalledWith('t1')
    })

    it('DELETE apaga o refinamento', async () => {
        mocks.del.mockResolvedValue(undefined)
        const res = await DELETE(req('http://localhost/api/tasks/t1/refinement'), params({ id: 't1' }))
        expect(await res.json()).toMatchObject({ success: true, data: { deleted: true } })
        expect(mocks.del).toHaveBeenCalledWith('t1')
    })

    it('responde a pergunta do agente', async () => {
        mocks.replyForm.mockResolvedValue({ refinement: { id: 'r1' }, availability: { available: true } })
        const res = await REPLY(req('http://localhost/api/tasks/t1/refinement/forms/f1', { answer: { q1: 'sim' } }), params({ id: 't1', formId: 'f1' }))
        expect(res.status).toBe(200)
        expect(mocks.replyForm).toHaveBeenCalledWith('t1', 'f1', { answer: { q1: 'sim' } })
    })

    it('ação inválida responde 400 sem chamar o serviço', async () => {
        const res = await ACTION(req('http://localhost/api/tasks/t1/refinement/actions/xxx'), params({ id: 't1', action: 'xxx' }))
        expect(res.status).toBe(400)
        expect(mocks.interrupt).not.toHaveBeenCalled()
    })

    it('ação interrupt interrompe o turno', async () => {
        mocks.interrupt.mockResolvedValue({ refinement: { id: 'r1' }, availability: { available: true } })
        const res = await ACTION(req('http://localhost/api/tasks/t1/refinement/actions/interrupt'), params({ id: 't1', action: 'interrupt' }))
        expect(res.status).toBe(200)
        expect(mocks.interrupt).toHaveBeenCalledWith('t1')
    })
})
