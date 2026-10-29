import { describe, expect, it } from 'vitest'
import { formatResetIn, hasMultipleAccounts, keepLastGoodWindows, isQuotaStale, normalizeQuotaExport, quotaHash, quotaLevel, snapshotFreshAt, summaryLabel, summaryWindows, usedPercent } from '@/features/opencode-quota/logic'
import type { QuotaProviderDto, QuotaWindowDto } from '@/features/opencode-quota/types'
import { quotaExportSchema } from '@/features/opencode-quota/schemas'

const CHECKED = new Date('2026-10-28T12:00:00Z')

// Export real do opencode-quota 6.x (formato 3).
const v3 = quotaExportSchema.parse({
  version: 3,
  exportedAt: 1793196889,
  fromCache: true,
  cacheAgeSeconds: 0,
  providers: {
    anthropic: {
      status: 'ok',
      fetchedAt: 1793196889,
      entries: [
        { id: 'anthropic.five_hour', name: 'Anthropic (Claude OAuth • 8DE14427) 5h', account: 'Claude OAuth • 8DE14427', resultType: 'quota', window: '5h', resetAt: 1793204400, renderType: 'percent', percentRemaining: 2 },
        { id: 'anthropic.weekly', name: 'Anthropic (Claude OAuth • 8DE14427) Weekly', account: 'Claude OAuth • 8DE14427', resultType: 'quota', window: 'Weekly', resetAt: 1793707200, renderType: 'percent', percentRemaining: 81 },
        { id: 'anthropic.weekly_fable', name: 'Anthropic (Claude OAuth • 8DE14427) Fable', account: 'Claude OAuth • 8DE14427', resultType: 'quota', window: 'Weekly', resetAt: 1793707200, renderType: 'percent', percentRemaining: 100 },
      ],
    },
    openai: { status: 'unavailable' },
    'opencode-go': {
      status: 'ok',
      fetchedAt: 1793196889,
      entries: [
        { id: 'opencode-go.five_hour', name: 'OpenCode Go 5h', resultType: 'quota', window: '5h', resetAt: 1793211943, renderType: 'percent', percentRemaining: 100 },
        { id: 'opencode-go.monthly', name: 'OpenCode Go Monthly', resultType: 'quota', window: 'Monthly', renderType: 'percent', percentRemaining: 50 },
      ],
    },
    custom: { status: 'partial', entries: [{ id: 'custom.balance', name: 'Gateway X Saldo', renderType: 'value', value: '$12.50 left' }], errors: ['Provider error 503'] },
    broken: { status: 'error', error: 'Sign in again' },
  },
})

describe('normalizeQuotaExport', () => {
  it('agrupa por provedor, oculta os indisponíveis e traz as janelas que o plugin informou', () => {
    const dto = normalizeQuotaExport(v3, CHECKED)
    expect(dto.state).toBe('ok')
    expect(dto.checkedAt).toBe(CHECKED.toISOString())
    expect(dto.exportedAt).toBe(new Date(1793196889 * 1000).toISOString())
    expect(dto.providers.map((provider) => provider.id)).toEqual(['anthropic', 'opencode-go', 'custom', 'broken'])
    const anthropic = dto.providers[0]!
    expect(anthropic.name).toBe('Anthropic')
    expect(anthropic.windows.map((window) => [window.label, window.usedPercent])).toEqual([['5h', 98], ['Semanal', 19], ['Fable', 0]])
    expect(anthropic.windows[0]!.resetAt).toBe(new Date(1793204400 * 1000).toISOString())
    expect(dto.providers[1]!.windows.map((window) => window.label)).toEqual(['5h', 'Mensal'])
    expect(dto.providers[1]!.windows[1]!.resetAt).toBeNull()
  })

  it('linhas de valor ficam sem barra e os erros de parcial/falha são mantidos', () => {
    const dto = normalizeQuotaExport(v3, CHECKED)
    const custom = dto.providers[2]!
    expect(custom).toMatchObject({ status: 'partial', errors: ['Provider error 503'] })
    expect(custom.windows[0]).toMatchObject({ usedPercent: null, value: '$12.50 left', label: 'Gateway X Saldo' })
    expect(dto.providers[3]).toMatchObject({ status: 'error', errors: ['Sign in again'], windows: [] })
  })

  it('aceita o formato 2 (opencode-quota 5.x) com o grupo entre colchetes', () => {
    const v2 = quotaExportSchema.parse({ version: 2, exportedAt: 1, providers: { 'opencode-go': { status: 'ok', entries: [{ name: '[OpenCode Go] Weekly', window: 'Weekly', renderType: 'percent', percentRemaining: 98 }] } } })
    expect(normalizeQuotaExport(v2, CHECKED).providers[0]!.windows[0]).toMatchObject({ label: 'Semanal', usedPercent: 2 })
  })
})

describe('keepLastGoodWindows', () => {
  const good = normalizeQuotaExport(v3, CHECKED)
  const rateLimited = normalizeQuotaExport(
    { ...v3, providers: { ...v3.providers, anthropic: { status: 'error', error: 'Rate limited, retry in 1m' } } },
    CHECKED,
  )

  it('provedor em erro sem janelas mantém as janelas da última leitura boa como parcial, com o erro atual', () => {
    const merged = keepLastGoodWindows(good, rateLimited)
    expect(merged.providers[0]).toMatchObject({ id: 'anthropic', status: 'partial', errors: ['Rate limited, retry in 1m'] })
    expect(merged.providers[0]!.windows).toEqual(good.providers[0]!.windows)
    expect(merged.providers[3]).toMatchObject({ id: 'broken', status: 'error', windows: [] })
  })

  it('sem leitura boa anterior o provedor continua só com o erro', () => {
    expect(keepLastGoodWindows(null, rateLimited).providers[0]).toMatchObject({ status: 'error', windows: [] })
  })

  it('leitura com janelas substitui as antigas e provedor que sumiu não volta', () => {
    const fresh = normalizeQuotaExport({ ...v3, providers: { 'opencode-go': v3.providers['opencode-go']! } }, CHECKED)
    expect(keepLastGoodWindows(good, fresh)).toBe(fresh)
    expect(keepLastGoodWindows(good, fresh).providers.map((provider) => provider.id)).toEqual(['opencode-go'])
  })

  it('arquivo não lido (state diferente de ok) não mescla', () => {
    const failed = { ...rateLimited, state: 'error' as const, message: 'falhou', providers: [] }
    expect(keepLastGoodWindows(good, failed)).toBe(failed)
  })
})

describe('snapshotFreshAt', () => {
  it('usa o fetchedAt mais recente entre os provedores', () => {
    const data = quotaExportSchema.parse({ version: 3, exportedAt: 1793219999, providers: { anthropic: { status: 'partial', fetchedAt: 1793218240 }, 'opencode-go': { status: 'ok', fetchedAt: 1793218215 }, openai: { status: 'unavailable' } } })
    expect(snapshotFreshAt(data)).toBe(1793218240)
  })

  it('sem nenhum provedor verificado devolve null', () => {
    expect(snapshotFreshAt(quotaExportSchema.parse({ version: 3, exportedAt: 1, providers: { openai: { status: 'unavailable' } } }))).toBeNull()
    expect(snapshotFreshAt(quotaExportSchema.parse({ version: 3, providers: {} }))).toBeNull()
  })
})
describe('regras de exibição', () => {
  it('usedPercent limita a 0–100 e arredonda', () => {
    expect(usedPercent(2)).toBe(98)
    expect(usedPercent(-5)).toBe(100)
    expect(usedPercent(120)).toBe(0)
    expect(usedPercent(33.4)).toBe(67)
  })

  it('faixas de cor por uso', () => {
    expect(quotaLevel(59)).toBe('ok')
    expect(quotaLevel(60)).toBe('warning')
    expect(quotaLevel(84)).toBe('warning')
    expect(quotaLevel(85)).toBe('critical')
  })

  it('summaryWindows pega a primeira janela com % de cada provedor (a de 5h)', () => {
    const [anthropic, go, custom, broken] = normalizeQuotaExport(v3, CHECKED).providers
    expect(summaryWindows(anthropic!).map((window) => [window.label, window.usedPercent])).toEqual([['5h', 98]])
    expect(summaryWindows(go!).map((window) => window.label)).toEqual(['5h'])
    expect(summaryWindows(custom!)).toMatchObject([{ usedPercent: null, value: '$12.50 left' }])
    expect(summaryWindows(broken!)).toEqual([])
  })

  it('summaryWindows prefere a janela com % mesmo depois de uma linha de valor e separa por conta', () => {
    const win = (id: string, account: string | null, usedPercent: number | null, label = id): QuotaWindowDto => ({ id, label, account, usedPercent, value: usedPercent === null ? '$1' : null, resetAt: null })
    const provider: QuotaProviderDto = {
      id: 'anthropic',
      name: 'Anthropic',
      status: 'ok',
      errors: [],
      windows: [win('saldo', 'pro', null), win('a.5h', 'pro', 40, '5h'), win('a.week', 'pro', 10), win('b.5h', 'max', 70, '5h')],
    }
    expect(summaryWindows(provider).map((window) => window.id)).toEqual(['a.5h', 'b.5h'])
    expect(hasMultipleAccounts(provider)).toBe(true)
    expect(summaryLabel(provider, provider.windows[1]!, true)).toBe('Anthropic (pro) · 5h')
    expect(summaryLabel(provider, provider.windows[1]!, false)).toBe('Anthropic · 5h')
    expect(hasMultipleAccounts({ ...provider, windows: [provider.windows[0]!] })).toBe(false)
  })

  it('formatResetIn em minutos, horas e dias; passado vira "reiniciando…"', () => {
    const now = Date.parse('2026-10-28T12:00:00Z')
    expect(formatResetIn('2026-10-28T12:12:00Z', now)).toBe('12 min')
    expect(formatResetIn('2026-10-28T14:15:00Z', now)).toBe('2 h 15 min')
    expect(formatResetIn('2026-10-28T15:00:00Z', now)).toBe('3 h')
    expect(formatResetIn('2026-10-31T16:00:00Z', now)).toBe('3 d 4 h')
    expect(formatResetIn('2026-10-28T11:00:00Z', now)).toBe('reiniciando…')
  })

  it('isQuotaStale depois de 30 min sem regravar', () => {
    const now = Date.parse('2026-10-28T12:00:00Z')
    expect(isQuotaStale('2026-10-28T11:45:00Z', now)).toBe(false)
    expect(isQuotaStale('2026-10-28T11:29:00Z', now)).toBe(true)
    expect(isQuotaStale(null, now)).toBe(false)
  })

  it('quotaHash ignora os instantes de leitura e de export', () => {
    const a = normalizeQuotaExport(v3, CHECKED)
    const b = normalizeQuotaExport({ ...v3, exportedAt: 2 }, new Date())
    expect(quotaHash(a)).toBe(quotaHash(b))
  })
})
