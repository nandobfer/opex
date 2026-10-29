import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ config: vi.fn(), publish: vi.fn(), rpc: vi.fn(), call: vi.fn(), connection: vi.fn(), shell: vi.fn() }))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: mocks.config }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), request: vi.fn(), response: vi.fn() }) }))
vi.mock('@/lib/ai/opencode', () => ({ getOpencodeConnection: mocks.connection }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: async () => ({ rpc: { call: mocks.call }, shell: { create: mocks.shell } }) }))

import { getOpencodeQuota, refreshOpencodeQuota, setQuotaRpcForTests } from '@/features/opencode-quota/server/service'
import { callQuotaRpc } from '@/features/opencode-quota/server/rpc'

const OK_AT = Date.parse('2026-10-28T11:58:00Z')

const snapshot = (percentRemaining: number, extra: Record<string, unknown> = {}) => ({
  ok: true as const,
  output: {
    snapshot: {
      version: 6,
      providers: [{ providerId: 'opencode-go', label: 'OpenCode Go', refreshing: false, okAtMs: OK_AT, checkedAtMs: OK_AT, rows: [{ id: 'opencode-go.five_hour', providerId: 'opencode-go', label: '5h', percentRemaining }], ...extra }],
    },
  },
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  setQuotaRpcForTests(mocks.rpc)
  mocks.config.mockResolvedValue({ baseUrl: 'http://opencode:4999' })
  mocks.publish.mockResolvedValue(undefined)
})

describe('refreshOpencodeQuota', () => {
  it('pede ao RPC, normaliza e publica só quando muda, sem comando no host', async () => {
    mocks.rpc.mockResolvedValue(snapshot(70))
    const first = await refreshOpencodeQuota()
    expect(first.state).toBe('ok')
    expect(first.providers[0]!.windows[0]!.usedPercent).toBe(30)
    expect(first.exportedAt).toBe(new Date(OK_AT).toISOString())
    expect(mocks.rpc).toHaveBeenCalledWith('poll')
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(mocks.publish).toHaveBeenCalledWith('opencode-quota-updated', { checkedAt: first.checkedAt })

    await refreshOpencodeQuota()
    expect(mocks.publish).toHaveBeenCalledTimes(1)

    mocks.rpc.mockResolvedValue(snapshot(10))
    await refreshOpencodeQuota()
    expect(mocks.publish).toHaveBeenCalledTimes(2)
    expect(mocks.shell).not.toHaveBeenCalled()
  })

  it('leituras simultâneas com o mesmo motivo usam uma chamada só e o GET reaproveita o último resultado', async () => {
    mocks.rpc.mockResolvedValue(snapshot(70))
    await Promise.all([refreshOpencodeQuota(), refreshOpencodeQuota({ reason: 'poll' }), getOpencodeQuota()])
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    await getOpencodeQuota()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('manual espera o poll em andamento e roda o seu', async () => {
    const poll = deferred<ReturnType<typeof snapshot>>()
    mocks.rpc.mockReturnValueOnce(poll.promise).mockResolvedValueOnce(snapshot(20))
    const pollRead = refreshOpencodeQuota()
    const manualRead = refreshOpencodeQuota({ reason: 'manual' })
    await Promise.resolve()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    poll.resolve(snapshot(70))
    expect((await pollRead).providers[0]!.windows[0]!.usedPercent).toBe(30)
    const manual = await manualRead
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(['poll', 'manual'])
    expect(manual.providers[0]!.windows[0]!.usedPercent).toBe(80)
    expect((await getOpencodeQuota()).providers[0]!.windows[0]!.usedPercent).toBe(80)
  })

  it('429 com janelas guardadas aparece parcial com a mensagem em pt-BR', async () => {
    mocks.rpc.mockResolvedValue(snapshot(40, { error: { code: 'rate_limited', status: 429 } }))
    const dto = await refreshOpencodeQuota()
    expect(dto.providers[0]).toMatchObject({ status: 'partial', errors: ['Limite de consultas atingido (HTTP 429)'] })
    expect(dto.providers[0]!.windows[0]!.usedPercent).toBe(60)
  })

  it('provedor sem linhas mantém as janelas da última leitura boa, mesmo após falha do RPC', async () => {
    mocks.rpc.mockResolvedValue(snapshot(70))
    await refreshOpencodeQuota()
    mocks.rpc.mockResolvedValueOnce({ ok: false, kind: 'network', message: 'fetch failed' })
    expect((await refreshOpencodeQuota()).state).toBe('error')
    mocks.rpc.mockResolvedValue(snapshot(0, { rows: [], error: { code: 'rate_limited' } }))
    const merged = await refreshOpencodeQuota()
    expect(merged.providers[0]).toMatchObject({ id: 'opencode-go', status: 'partial', errors: ['Limite de consultas atingido'] })
    expect(merged.providers[0]!.windows[0]!.usedPercent).toBe(30)
  })

  it('RPC indisponível vira "missing"; rede, timeout e erro interno viram "error", sem reserva no host', async () => {
    mocks.rpc.mockResolvedValue({ ok: false, kind: 'unavailable', message: 'RPC is unavailable' })
    expect(await refreshOpencodeQuota()).toMatchObject({ state: 'missing', message: expect.stringContaining('opencode-quota não respondeu'), providers: [] })
    mocks.rpc.mockResolvedValue({ ok: false, kind: 'network', message: 'fetch failed' })
    expect(await refreshOpencodeQuota()).toMatchObject({ state: 'error', message: 'Não foi possível falar com o OpenCode' })
    mocks.rpc.mockResolvedValue({ ok: false, kind: 'timeout', message: 'aborted' })
    expect((await refreshOpencodeQuota()).message).toMatch(/60 s/)
    mocks.rpc.mockRejectedValue(new Error('boom'))
    expect((await refreshOpencodeQuota()).state).toBe('error')
    expect(mocks.shell).not.toHaveBeenCalled()
  })

  it('senha recusada (401) vira "error" com a mensagem de senha recusada', async () => {
    mocks.rpc.mockResolvedValue({ ok: false, kind: 'unauthorized', message: 'Authentication required' })
    expect(await refreshOpencodeQuota()).toMatchObject({ state: 'error', message: expect.stringContaining('recusou a senha') })
  })

  it('snapshot de outra versão vira "error" com a versão', async () => {
    mocks.rpc.mockResolvedValue({ ok: true, output: { snapshot: { version: 7, providers: [] } } })
    expect((await refreshOpencodeQuota()).message).toMatch(/não reconhecido \(versão 7\)/)
  })

  it('sem URL do OpenCode não chama o RPC nem o host e pede configuração', async () => {
    mocks.config.mockResolvedValue({})
    expect((await refreshOpencodeQuota()).state).toBe('unconfigured')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.shell).not.toHaveBeenCalled()
  })
})

describe('callQuotaRpc', () => {
  it('chama slkiser.opencode-quota/refresh com o motivo e o diretório da integração como location', async () => {
    mocks.connection.mockResolvedValue({ baseUrl: 'http://opencode:4999', headers: {}, directory: '/home/u/opex-ia' })
    mocks.call.mockResolvedValue({ output: { snapshot: { version: 6, providers: [] } } })
    expect(await callQuotaRpc('manual')).toEqual({ ok: true, output: { snapshot: { version: 6, providers: [] } } })
    expect(mocks.call).toHaveBeenCalledWith(
      { rpcID: 'slkiser.opencode-quota', method: 'refresh', input: { reason: 'manual' }, location: { directory: '/home/u/opex-ia' } },
      { signal: expect.any(AbortSignal) },
    )
  })

  it('sem diretório vai sem location e classifica os erros do cliente', async () => {
    mocks.connection.mockResolvedValue({ baseUrl: 'http://opencode:4999', headers: {} })
    mocks.call.mockRejectedValueOnce(Object.assign(new Error('RPC is unavailable'), { _tag: 'RpcError', type: 'rpc.unavailable' }))
    expect(await callQuotaRpc('poll')).toMatchObject({ ok: false, kind: 'unavailable' })
    expect(mocks.call.mock.calls[0]![0]).not.toHaveProperty('location')
    mocks.call.mockRejectedValueOnce(Object.assign(new Error('Authentication required'), { _tag: 'UnauthorizedError' }))
    expect(await callQuotaRpc('poll')).toMatchObject({ ok: false, kind: 'unauthorized' })
    mocks.call.mockRejectedValueOnce(Object.assign(new Error('Transport: fetch failed'), { reason: 'Transport' }))
    expect(await callQuotaRpc('poll')).toMatchObject({ ok: false, kind: 'network' })
    mocks.call.mockRejectedValueOnce(Object.assign(new Error('internal'), { _tag: 'RpcInternalError', type: 'rpc.internal' }))
    expect(await callQuotaRpc('poll')).toMatchObject({ ok: false, kind: 'internal' })
  })
})
