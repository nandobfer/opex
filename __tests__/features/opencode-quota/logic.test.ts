import { describe, expect, it } from 'vitest'
import { formatResetIn, hasMultipleAccounts, keepLastGoodWindows, isQuotaStale, normalizeQuotaSnapshot, quotaErrorMessage, quotaHash, quotaLevel, rowValueText, snapshotCheckedAt, summaryLabel, summaryWindows, usedPercent } from '@/features/opencode-quota/logic'
import type { QuotaProviderDto, QuotaWindowDto } from '@/features/opencode-quota/types'
import { quotaSnapshotSchema } from '@/features/opencode-quota/schemas'

const CHECKED = new Date('2026-10-28T12:00:00Z')
const OK_AT = Date.parse('2026-10-28T11:58:00Z')

const row = (providerId: string, key: string, extra: Record<string, unknown>) => ({ id: `${providerId}.${key}`, providerId, type: 'quota', method: 'remote_api', authority: 'provider_reported', prominence: 'primary', ...extra })

// Snapshot v6 real do RPC `refresh` do opencode-quota 6.x (resumido).
const v6 = quotaSnapshotSchema.parse({
  version: 6,
  providers: [
    {
      providerId: 'anthropic',
      label: 'Anthropic',
      refreshing: false,
      okAtMs: OK_AT - 60_000,
      checkedAtMs: OK_AT - 60_000,
      rows: [
        row('anthropic', 'five_hour', { account: 'pro', label: '5h', window: 'five_hour', percentRemaining: 2, resetsAt: '2026-10-28T14:00:00.115Z' }),
        row('anthropic', 'weekly', { account: 'pro', label: 'Weekly', window: 'week', percentRemaining: 81, resetsAt: '2026-11-03T00:00:00Z' }),
        row('anthropic', 'five_hour', { account: 'work', label: '5h', window: 'five_hour', percentRemaining: 50 }),
      ],
    },
    {
      providerId: 'opencode-go',
      label: 'OpenCode Go',
      refreshing: false,
      okAtMs: OK_AT,
      checkedAtMs: OK_AT,
      rows: [row('opencode-go', 'five_hour', { label: '5h', percentRemaining: 100 }), row('opencode-go', 'monthly', { label: 'Monthly', percentRemaining: 50 })],
    },
    { providerId: 'gateway', label: 'Gateway X', refreshing: false, okAtMs: OK_AT - 1, rows: [row('gateway', 'balance', { type: 'balance', label: 'Saldo', amount: { decimal: '12.5', unit: { kind: 'currency', code: 'USD' } } })] },
    { providerId: 'openai', label: 'OpenAI', refreshing: false, rows: [], checkedAtMs: OK_AT - 5, error: { code: 'not_configured' } },
    { providerId: 'copilot', label: 'Copilot', refreshing: true, rows: [] },
  ],
})

describe('normalizeQuotaSnapshot', () => {
  it('agrupa por provedor com várias contas, oculta não configurados e nunca consultados', () => {
    const dto = normalizeQuotaSnapshot(v6, CHECKED)
    expect(dto.state).toBe('ok')
    expect(dto.checkedAt).toBe(CHECKED.toISOString())
    expect(dto.providers.map((provider) => provider.id)).toEqual(['anthropic', 'opencode-go', 'gateway'])
    const anthropic = dto.providers[0]!
    expect(anthropic).toMatchObject({ name: 'Anthropic', status: 'ok', errors: [] })
    expect(anthropic.windows.map((window) => [window.label, window.account, window.usedPercent])).toEqual([['5h', 'pro', 98], ['Semanal', 'pro', 19], ['5h', 'work', 50]])
    expect(anthropic.windows.map((window) => window.id)).toEqual(['anthropic.five_hour:pro', 'anthropic.weekly:pro', 'anthropic.five_hour:work'])
    expect(anthropic.windows[0]!.resetAt).toBe('2026-10-28T14:00:00.115Z')
    expect(anthropic.windows[2]!.resetAt).toBeNull()
    expect(dto.providers[1]!.windows.map((window) => window.label)).toEqual(['5h', 'Mensal'])
    expect(dto.providers[2]).toMatchObject({ name: 'Gateway X', windows: [{ usedPercent: null, value: expect.stringContaining('12,50'), label: 'Saldo' }] })
  })

  it('exportedAt é a consulta mais recente (maior okAtMs/checkedAtMs)', () => {
    expect(normalizeQuotaSnapshot(v6, CHECKED).exportedAt).toBe(new Date(OK_AT).toISOString())
    expect(snapshotCheckedAt(quotaSnapshotSchema.parse({ version: 6, providers: [{ providerId: 'x', rows: [] }] }))).toBeNull()
  })

  it('com linhas e erro vira parcial; sem linhas e com erro vira falha', () => {
    const retryAtMs = Date.parse('2026-10-28T15:07:00Z')
    const snapshot = quotaSnapshotSchema.parse({
      version: 6,
      providers: [
        { ...v6.providers[0]!, error: { code: 'rate_limited', status: 429, retryAtMs } },
        { providerId: 'broken', label: 'Broken', rows: [], checkedAtMs: OK_AT, error: { code: 'login_expired', status: 401 } },
      ],
    })
    const dto = normalizeQuotaSnapshot(snapshot, CHECKED)
    expect(dto.providers[0]).toMatchObject({ status: 'partial', errors: ['Limite de consultas atingido; tente após 12:07 (HTTP 429)'] })
    expect(dto.providers[0]!.windows).toHaveLength(3)
    expect(dto.providers[1]).toMatchObject({ id: 'broken', name: 'Broken', status: 'error', windows: [], errors: ['Login expirado: entre de novo no provedor pelo OpenCode (HTTP 401)'] })
  })

  it('recusa um snapshot de outra versão', () => {
    expect(quotaSnapshotSchema.safeParse({ version: 5, providers: [] }).success).toBe(false)
  })
})

describe('rowValueText e quotaErrorMessage', () => {
  it('texto → flag → amount → remaining, em pt-BR', () => {
    expect(rowValueText({ text: 'Ilimitado', flag: true })).toBe('Ilimitado')
    expect(rowValueText({ flag: true })).toBe('Ativo')
    expect(rowValueText({ flag: false })).toBe('Inativo')
    expect(rowValueText({ amount: { decimal: '1500', unit: { kind: 'count', unit: 'request' } } })).toBe('1.500 requests')
    expect(rowValueText({ remaining: { decimal: '3', unit: { kind: 'custom', symbol: '◎' } } })).toBe('◎3 restantes')
    expect(rowValueText({ label: 'x' })).toBeNull()
  })

  it('códigos desconhecidos viram erro interno; ferramenta local cita o programa', () => {
    expect(quotaErrorMessage({ code: 'weird' })).toBe('Erro interno do opencode-quota')
    expect(quotaErrorMessage({ code: 'local_tool', tool: 'Claude CLI', missing: true })).toBe('Claude CLI não encontrado na máquina do OpenCode')
    expect(quotaErrorMessage({ code: 'rate_limited' })).toBe('Limite de consultas atingido')
  })
})

describe('keepLastGoodWindows', () => {
  const good = normalizeQuotaSnapshot(v6, CHECKED)
  const rateLimited = normalizeQuotaSnapshot({ ...v6, providers: [{ ...v6.providers[0]!, rows: [], error: { code: 'rate_limited' } }, ...v6.providers.slice(1)] }, CHECKED)

  it('provedor em erro sem janelas mantém as janelas da última leitura boa como parcial, com o erro atual', () => {
    const merged = keepLastGoodWindows(good, rateLimited)
    expect(merged.providers[0]).toMatchObject({ id: 'anthropic', status: 'partial', errors: ['Limite de consultas atingido'] })
    expect(merged.providers[0]!.windows).toEqual(good.providers[0]!.windows)
  })

  it('sem leitura boa anterior o provedor continua só com o erro', () => {
    expect(keepLastGoodWindows(null, rateLimited).providers[0]).toMatchObject({ status: 'error', windows: [] })
  })

  it('leitura com janelas substitui as antigas e provedor que sumiu não volta', () => {
    const fresh = normalizeQuotaSnapshot({ ...v6, providers: [v6.providers[1]!] }, CHECKED)
    expect(keepLastGoodWindows(good, fresh)).toBe(fresh)
    expect(keepLastGoodWindows(good, fresh).providers.map((provider) => provider.id)).toEqual(['opencode-go'])
  })

  it('leitura com falha (state diferente de ok) não mescla', () => {
    const failed = { ...rateLimited, state: 'error' as const, message: 'falhou', providers: [] }
    expect(keepLastGoodWindows(good, failed)).toBe(failed)
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
    const [anthropic, go, gateway] = normalizeQuotaSnapshot(v6, CHECKED).providers
    expect(summaryWindows(anthropic!).map((window) => [window.label, window.account, window.usedPercent])).toEqual([['5h', 'pro', 98], ['5h', 'work', 50]])
    expect(summaryWindows(go!).map((window) => window.label)).toEqual(['5h'])
    expect(summaryWindows(gateway!)).toMatchObject([{ usedPercent: null, value: expect.stringContaining('12,50') }])
    const broken: QuotaProviderDto = { id: 'broken', name: 'Broken', status: 'error', errors: ['x'], windows: [] }
    expect(summaryWindows(broken)).toEqual([])
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
    const a = normalizeQuotaSnapshot(v6, CHECKED)
    const b = normalizeQuotaSnapshot({ ...v6, providers: v6.providers.map((provider) => ({ ...provider, okAtMs: 1, checkedAtMs: 2 })) }, new Date())
    expect(quotaHash(a)).toBe(quotaHash(b))
  })
})
