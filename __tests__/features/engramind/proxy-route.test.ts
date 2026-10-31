import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rota catch-all `/api/engramind/[...path]`: os parâmetros chegam como LISTA de segmentos (o formato
 * que o Next exige na checagem de tipos do build) e o segmento é decodificado antes do catálogo.
 */

const mocks = vi.hoisted(() => ({ run: vi.fn(), auth: vi.fn(async () => {}) }))

vi.mock('@/features/engramind/server/operations-runner', () => ({ runEngramindOperation: mocks.run }))
vi.mock('@/features/auth/server/context', () => ({ requireAdminSession: mocks.auth }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/engramind/[...path]/route'

const call = (method: string, path: string[], body?: string) => {
    const url = `http://opex/api/engramind/${path.join('/')}`
    return new NextRequest(url, { method, ...(body ? { body, headers: { 'Content-Type': 'application/json' } } : {}) })
}
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) })

describe('rota /api/engramind/[...path]', () => {
    beforeEach(() => {
        mocks.run.mockReset()
        mocks.run.mockResolvedValue({ ok: true })
    })

    it('monta a operação do catálogo com os segmentos decodificados, a query e o corpo', async () => {
        const response = await POST(call('POST', ['channels', 'eng%2Fglobal', 'archive'], '{"motivo":"x"}'), ctx(['channels', 'eng/global', 'archive']))
        expect(response.status).toBe(200)
        expect(mocks.run).toHaveBeenCalledWith('archive_channel', expect.objectContaining({ channel: 'eng/global' }), 'local')
        await GET(call('GET', ['channels', 'eng/global', 'stats']), ctx(['channels', 'eng/global', 'stats']))
        expect(mocks.run).toHaveBeenLastCalledWith('channel_stats', { channel: 'eng/global' }, 'local')
    })

    it('rota desconhecida: 404; corpo inválido: 400', async () => {
        const missing = await GET(call('GET', ['nao', 'existe']), ctx(['nao', 'existe']))
        expect(missing.status).toBe(404)
        expect(mocks.run).not.toHaveBeenCalled()
        const invalid = await POST(call('POST', ['channels'], '{nao json'), ctx(['channels']))
        expect(invalid.status).toBe(400)
    })
})
