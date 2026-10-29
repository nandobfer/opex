import { afterEach, describe, expect, it, vi } from 'vitest'

/** readNdjson: caminho com o subcaminho público (NEXT_PUBLIC_BASE_PATH) e leitura linha a linha. */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('readNdjson', () => {
  it('prefixa o basePath e entrega cada linha (regressão: atrás de proxy com prefixo o log não carregava)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/opex')
    const body = new Response('{"type":"a"}\n{"type":"b"}\n').body
    const fetchMock = vi.fn(async () => ({ ok: true, body }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const { readNdjson } = await import('@/lib/ndjson-client')
    const events: string[] = []
    await readNdjson('/api/environments/deploys/d1/events', (event) => events.push(event.type))
    expect(fetchMock).toHaveBeenCalledWith('/opex/api/environments/deploys/d1/events', expect.objectContaining({ method: 'POST' }))
    expect(events).toEqual(['a', 'b'])
  })
})
