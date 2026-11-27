import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-203: PTAX de venda do Banco Central, gravada por dia corrido. Fim de semana herda o último dia útil; hoje só é
 * gravado com a cotação do próprio dia; a rotina preenche os dias que faltam e avisa as telas.
 */

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  rows: new Map<string, { date: string; usdBrl: number; quotedDate: string }>(),
  publish: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => undefined) }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: vi.fn(async () => ({ baseUrl: 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata' })) }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({}), debugFetch: (_dbg: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init) }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ warn: vi.fn(), info: vi.fn() }) }))
vi.mock('@/lib/db/models/FxRateDaily', () => {
  const query = (filter: { date: { $gte: string; $lte: string } }) => {
    const docs = [...mocks.rows.values()].filter((row) => row.date >= filter.date.$gte && row.date <= filter.date.$lte).sort((a, b) => a.date.localeCompare(b.date))
    const chain = { sort: () => chain, select: () => chain, lean: async () => docs }
    return chain
  }
  return {
    FxRateDaily: {
      find: query,
      findOne: () => ({ sort: () => ({ lean: async () => [...mocks.rows.values()].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null }) }),
      bulkWrite: async (ops: { updateOne: { filter: { date: string }; update: { $set: { usdBrl: number; quotedDate: string } } } }[]) => {
        for (const op of ops) mocks.rows.set(op.updateOne.filter.date, { date: op.updateOne.filter.date, ...op.updateOne.update.$set })
        return {}
      },
    },
  }
})

import { fillCalendarRates, parsePtaxPeriod, ptaxPeriodUrl } from '@/lib/fx/ptax-parse'
import { fillFxRates, loadFxRates, runFxPtaxRoutine } from '@/features/ai-billing/server/fx'

// Resposta real da API Olinda (23 a 26/11/2026; 21 e 22/11 são sábado e domingo).
const OLINDA = {
  value: [
    { cotacaoCompra: 5.9702, cotacaoVenda: 5.9708, dataHoraCotacao: '2026-11-23 13:06:23.798289' },
    { cotacaoCompra: 5.8567, cotacaoVenda: 5.8573, dataHoraCotacao: '2026-11-24 13:07:40.485706' },
    { cotacaoCompra: 5.8819, cotacaoVenda: 5.8825, dataHoraCotacao: '2026-11-25 13:02:42.418138' },
    { cotacaoCompra: 5.744, cotacaoVenda: 5.7446, dataHoraCotacao: '2026-11-26 13:11:27.937451' },
  ],
}
const FRIDAY = { cotacaoCompra: 6, cotacaoVenda: 6.01, dataHoraCotacao: '2026-11-20 13:00:00.000000' }

beforeEach(() => {
  mocks.rows.clear()
  mocks.fetch.mockReset()
  mocks.publish.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  // 26/11/2026 18:00 em Brasília.
  vi.setSystemTime(new Date('2026-11-26T21:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('PTAX (módulo puro)', () => {
  it('URL do período no formato da API Olinda (MM-DD-AAAA entre aspas simples)', () => {
    expect(ptaxPeriodUrl('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/', '2026-11-20', '2026-11-26')).toBe(
      "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='11-20-2026'&@dataFinalCotacao='11-26-2026'&$format=json&$select=cotacaoVenda,dataHoraCotacao",
    )
  })

  it('usa a cotação de venda; fim de semana herda o último dia útil', () => {
    const quotes = parsePtaxPeriod({ value: [FRIDAY, ...OLINDA.value] })
    expect(quotes[0]).toEqual({ date: '2026-11-20', usdBrl: 6.01 })
    expect(fillCalendarRates(quotes, '2026-11-21', '2026-11-23')).toEqual([
      { date: '2026-11-21', usdBrl: 6.01, quotedDate: '2026-11-20' },
      { date: '2026-11-22', usdBrl: 6.01, quotedDate: '2026-11-20' },
      { date: '2026-11-23', usdBrl: 5.9708, quotedDate: '2026-11-23' },
    ])
    expect(() => parsePtaxPeriod({ erro: true })).toThrow('fora do formato')
  })
})

describe('gravação e leitura', () => {
  it('grava os dias do período, com o fim de semana herdando a sexta', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ value: [FRIDAY, ...OLINDA.value] })))
    expect(await fillFxRates('2026-11-21', '2026-11-26')).toBe(6)
    expect(mocks.rows.get('2026-11-22')).toMatchObject({ date: '2026-11-22', usdBrl: 6.01, quotedDate: '2026-11-20' })
    expect(mocks.rows.get('2026-11-26')?.usdBrl).toBe(5.7446)
  })

  it('hoje sem a PTAX publicada não é gravado (fica para a próxima leitura), mas a tela usa a última conhecida', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ value: [FRIDAY, ...OLINDA.value.slice(0, 3)] })))
    await fillFxRates('2026-11-25', '2026-11-26')
    expect(mocks.rows.has('2026-11-26')).toBe(false)
    const { rates, missing } = await loadFxRates('2026-11-25', '2026-11-26')
    expect(rates.get('2026-11-26')).toBe(5.8825)
    expect(missing).toEqual([])
  })

  it('dia passado sem cotação gravada aparece como faltante (nunca zero)', async () => {
    const { rates, missing } = await loadFxRates('2026-11-23', '2026-11-24')
    expect(rates.size).toBe(0)
    expect(missing).toEqual(['2026-11-23', '2026-11-24'])
  })

  it('a rotina grava a partir do primeiro dia que falta e publica ai-billing-updated', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ value: [FRIDAY, ...OLINDA.value] })))
    const summary = await runFxPtaxRoutine()
    expect(summary).toMatch(/dia\(s\) gravado\(s\); última cotação/)
    expect(mocks.publish).toHaveBeenCalledWith('ai-billing-updated', { kind: 'fx' })
    expect(String(mocks.fetch.mock.calls[0]![0])).toContain('CotacaoDolarPeriodo')
  })
})
