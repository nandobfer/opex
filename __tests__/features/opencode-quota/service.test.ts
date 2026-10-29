import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ config: vi.fn(), publish: vi.fn(), run: vi.fn() }))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: mocks.config }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), request: vi.fn(), response: vi.fn() }) }))
vi.mock('@/features/local-docker/server/shell', () => ({ createHostRunner: () => mocks.run }))

import { getOpencodeQuota, refreshOpencodeQuota, setQuotaHostRunnerForTests } from '@/features/opencode-quota/server/service'

const exportJson = (percentRemaining: number) =>
  JSON.stringify({ version: 3, exportedAt: 1793196889, providers: { 'opencode-go': { status: 'ok', entries: [{ id: 'opencode-go.five_hour', name: 'OpenCode Go 5h', window: '5h', renderType: 'percent', percentRemaining }] } } })

beforeEach(() => {
  vi.clearAllMocks()
  setQuotaHostRunnerForTests(mocks.run)
  mocks.config.mockResolvedValue({ baseUrl: 'http://opencode:4999' })
  mocks.publish.mockResolvedValue(undefined)
})

describe('refreshOpencodeQuota', () => {
  it('lê o export no host, normaliza e publica só quando muda', async () => {
    mocks.run.mockResolvedValue({ exitCode: 0, output: exportJson(70) })
    const first = await refreshOpencodeQuota()
    expect(first.state).toBe('ok')
    expect(first.providers[0]!.windows[0]!.usedPercent).toBe(30)
    expect(mocks.run).toHaveBeenCalledWith(expect.stringContaining('quota-export.json'), expect.any(Number), { quiet: true, retryOnLost: true })
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(mocks.publish).toHaveBeenCalledWith('opencode-quota-updated', { checkedAt: first.checkedAt })

    await refreshOpencodeQuota()
    expect(mocks.publish).toHaveBeenCalledTimes(1)

    mocks.run.mockResolvedValue({ exitCode: 0, output: exportJson(10) })
    await refreshOpencodeQuota()
    expect(mocks.publish).toHaveBeenCalledTimes(2)
  })

  it('leituras simultâneas rodam um comando só e o GET reaproveita o último resultado', async () => {
    mocks.run.mockResolvedValue({ exitCode: 0, output: exportJson(70) })
    await Promise.all([refreshOpencodeQuota(), refreshOpencodeQuota(), getOpencodeQuota()])
    expect(mocks.run).toHaveBeenCalledTimes(1)
    await getOpencodeQuota()
    expect(mocks.run).toHaveBeenCalledTimes(1)
  })

  it('provedor que falha mantém as janelas da última leitura boa, mesmo após falha do host', async () => {
    mocks.run.mockResolvedValue({ exitCode: 0, output: exportJson(70) })
    await refreshOpencodeQuota()
    mocks.run.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    expect((await refreshOpencodeQuota()).state).toBe('error')
    const limited = JSON.stringify({ version: 3, exportedAt: 1793196999, providers: { 'opencode-go': { status: 'error', error: 'Rate limited, retry in 1m' } } })
    mocks.run.mockResolvedValue({ exitCode: 0, output: limited })
    const merged = await refreshOpencodeQuota()
    expect(merged.providers[0]).toMatchObject({ id: 'opencode-go', status: 'partial', errors: ['Rate limited, retry in 1m'] })
    expect(merged.providers[0]!.windows[0]!.usedPercent).toBe(30)
    const published = mocks.publish.mock.calls.length
    await refreshOpencodeQuota()
    expect(mocks.publish).toHaveBeenCalledTimes(published)
  })

  it('snapshot do plugin mostra as janelas guardadas com o erro atual, mesmo sem leitura boa anterior', async () => {
    const snapshot = JSON.stringify({
      version: 3,
      exportedAt: 1793219999,
      providers: {
        anthropic: { status: 'partial', fetchedAt: 1793218240, entries: [{ id: 'anthropic.five_hour', name: 'Anthropic (Claude OAuth) 5h', account: 'Claude OAuth', window: '5h', renderType: 'percent', percentRemaining: 23 }], errors: [{ label: 'Anthropic', message: 'Rate limited, retry in 1m' }] },
        'opencode-go': { status: 'ok', fetchedAt: 1793218215, entries: [{ id: 'opencode-go.five_hour', name: 'OpenCode Go 5h', window: '5h', renderType: 'percent', percentRemaining: 100 }] },
      },
    })
    mocks.run.mockResolvedValue({ exitCode: 0, output: `__OPENCODE_QUOTA_SNAPSHOT__\n${snapshot}` })
    const dto = await refreshOpencodeQuota()
    expect(mocks.run.mock.calls[0]![0]).toContain('show --json')
    expect(dto.providers[0]).toMatchObject({ id: 'anthropic', status: 'partial', errors: ['Rate limited, retry in 1m'] })
    expect(dto.providers[0]!.windows[0]!.usedPercent).toBe(77)
    expect(dto.exportedAt).toBe(new Date(1793218240 * 1000).toISOString())
  })

  it('reserva do export mantém a mescla com a última leitura boa', async () => {
    mocks.run.mockResolvedValue({ exitCode: 0, output: `__OPENCODE_QUOTA_EXPORT__\n${exportJson(70)}` })
    const first = await refreshOpencodeQuota()
    expect(first.exportedAt).toBe(new Date(1793196889 * 1000).toISOString())
    const limited = JSON.stringify({ version: 3, exportedAt: 1793196999, providers: { 'opencode-go': { status: 'error', error: 'Rate limited, retry in 1m' } } })
    mocks.run.mockResolvedValue({ exitCode: 0, output: `__OPENCODE_QUOTA_EXPORT__\n${limited}` })
    const merged = await refreshOpencodeQuota()
    expect(merged.providers[0]).toMatchObject({ status: 'partial', errors: ['Rate limited, retry in 1m'] })
    expect(merged.providers[0]!.windows[0]!.usedPercent).toBe(30)
  })

  it('arquivo ausente vira "missing"', async () => {
    mocks.run.mockResolvedValue({ exitCode: 0, output: '__OPENCODE_QUOTA_MISSING__' })
    expect(await refreshOpencodeQuota()).toMatchObject({ state: 'missing', providers: [] })
    mocks.run.mockResolvedValue({ exitCode: 0, output: '__OPENCODE_QUOTA_EXPORT__\n__OPENCODE_QUOTA_MISSING__' })
    expect(await refreshOpencodeQuota()).toMatchObject({ state: 'missing', providers: [] })
  })

  it('JSON inválido, formato desconhecido e falha do OpenCode viram "error"', async () => {
    mocks.run.mockResolvedValue({ exitCode: 0, output: '{quebrado' })
    expect((await refreshOpencodeQuota()).message).toMatch(/não é um JSON válido/)
    mocks.run.mockResolvedValue({ exitCode: 0, output: JSON.stringify({ version: 9 }) })
    expect((await refreshOpencodeQuota()).message).toMatch(/não reconhecido \(versão 9\)/)
    mocks.run.mockRejectedValue(new Error('Não foi possível executar comandos no host do OpenCode: ECONNREFUSED'))
    expect(await refreshOpencodeQuota()).toMatchObject({ state: 'error', message: expect.stringContaining('ECONNREFUSED') })
  })

  it('sem URL do OpenCode não roda comando e pede configuração', async () => {
    mocks.config.mockResolvedValue({})
    expect((await refreshOpencodeQuota()).state).toBe('unconfigured')
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('usa o caminho customizado da integração', async () => {
    mocks.config.mockResolvedValue({ baseUrl: 'http://opencode:4999', quotaExportPath: '/srv/quota.json' })
    mocks.run.mockResolvedValue({ exitCode: 0, output: exportJson(70) })
    await refreshOpencodeQuota()
    expect(mocks.run.mock.calls[0]![0]).toContain("f='/srv/quota.json'")
  })
})
