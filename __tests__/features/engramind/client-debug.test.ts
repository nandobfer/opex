import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-117: o texto do usuário (foco do contexto, `text` das dicas e `query` da busca) nunca vai para o
 * debug da integração. Exercita o `engramindCall` real com o `debugFetch` real e um depurador que grava.
 */

const lines = vi.hoisted(() => [] as { kind: string; message: string; data: unknown }[])

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => ({ baseUrl: 'http://engramind:8000', adminToken: 'eng.tk_0.segredo' }) }))
vi.mock('@/lib/integrations/debug', async (original) => {
  const actual = await original<typeof import('@/lib/integrations/debug')>()
  const record = (kind: string) => (message: string, a?: unknown, b?: unknown) => lines.push({ kind, message, data: b ?? a })
  return { ...actual, integrationDebug: () => ({ info: record('info'), step: record('step'), request: record('request'), response: record('response'), success: record('success'), warn: record('warn'), error: record('error') }) }
})

import { engramindCall } from '@/features/engramind/server/client'

const FOCUS = 'mensagem secreta do usuário sobre o cliente Fulano'
const dump = () => JSON.stringify(lines)

beforeEach(() => {
  lines.length = 0
})
afterEach(() => vi.unstubAllGlobals())

describe('debug do Engramind sem texto do usuário', () => {
  it('foco do contexto: a URL real leva o foco, o debug só o tamanho', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await engramindCall('GET', { path: '/v1/context', query: { channels: 'opex', focus: FOCUS } })
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('focus=')
    expect(decodeURIComponent(String((fetchMock.mock.calls[0] as unknown[])[0])).replace(/\+/g, ' ')).toContain(FOCUS)
    expect(lines.some((line) => line.kind === 'request')).toBe(true)
    expect(decodeURIComponent(dump()).replace(/\+/g, ' ')).not.toContain(FOCUS)
    expect(decodeURIComponent(dump()).replace(/\+/g, ' ')).toContain(`[foco omitido: ${FOCUS.length} caracteres]`)
  })

  it('falha de rede: a URL do erro também vem mascarada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    await expect(engramindCall('GET', { path: '/v1/context', query: { focus: FOCUS } })).rejects.toBeTruthy()
    expect(lines.some((line) => line.kind === 'error')).toBe(true)
    expect(decodeURIComponent(dump()).replace(/\+/g, ' ')).not.toContain(FOCUS)
  })

  it('dicas e busca: text/query saem do corpo registrado; o corpo enviado continua inteiro', async () => {
    const fetchMock = vi.fn(async () => new Response('{"hints":[]}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await engramindCall('POST', { path: '/v1/hints', body: { text: FOCUS, channels: ['opex'], limit: 5 } })
    await engramindCall('POST', { path: '/v1/memories/search', body: { query: FOCUS, channels: ['opex'] } })
    expect(String(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body)).toContain(FOCUS)
    expect(dump()).not.toContain(FOCUS)
    expect(dump()).toContain('[texto omitido:')
    expect(dump()).toContain('opex')
  })
})
