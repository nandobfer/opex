import { describe, expect, it } from 'vitest'
import { metricsBucketMode, parseMargin, resolveMetricsRange, startOfZonedDay, toMetricsParams } from '@/features/agent-metrics/period'
import { formatRelativePast } from '@/lib/relative-time'

const NOW = new Date('2026-11-03T17:11:00.000Z') // 14:11 em São Paulo

describe('período da Visão geral dos agentes', () => {
  it('padrão de 30 dias, inclusivo, no fuso de São Paulo', () => {
    const range = resolveMetricsRange({ periodo: '30d' }, NOW)
    expect(range.fromDay).toBe('2026-10-05')
    expect(range.toDay).toBe('2026-11-03')
    expect(range.from.toISOString()).toBe('2026-10-05T03:00:00.000Z')
    expect(range.to.toISOString()).toBe('2026-11-04T02:59:59.999Z')
  })

  it('7 dias, 90 dias e 12 meses', () => {
    expect(resolveMetricsRange({ periodo: '7d' }, NOW).fromDay).toBe('2026-10-28')
    expect(resolveMetricsRange({ periodo: '90d' }, NOW).fromDay).toBe('2026-08-06')
    expect(resolveMetricsRange({ periodo: '12m' }, NOW).fromDay).toBe('2025-11-04')
  })

  it('intervalo personalizado; incompleto ou invertido cai em 30 dias', () => {
    expect(resolveMetricsRange({ periodo: 'custom', de: '2026-09-01', ate: '2026-09-30' }, NOW)).toMatchObject({ fromDay: '2026-09-01', toDay: '2026-09-30' })
    expect(resolveMetricsRange({ periodo: 'custom', de: '2026-09-30', ate: '2026-09-01' }, NOW).fromDay).toBe('2026-10-05')
    expect(resolveMetricsRange({ periodo: 'custom', de: '2026-09-01' }, NOW).fromDay).toBe('2026-10-05')
  })

  it('agrupa por dia até 31 dias, por semana até ~6 meses e por mês acima disso', () => {
    const mode = (periodo: '7d' | '30d' | '90d' | '12m') => {
      const range = resolveMetricsRange({ periodo }, NOW)
      return metricsBucketMode(range.from, range.to)
    }
    expect([mode('7d'), mode('30d'), mode('90d'), mode('12m')]).toEqual(['day', 'day', 'week', 'month'])
  })

  it('início do dia no fuso', () => {
    expect(new Date(startOfZonedDay('2026-11-03')).toISOString()).toBe('2026-11-03T03:00:00.000Z')
  })

  it('margem do Orçamentista: vazia, negativa, acima de 100 ou inválida volta a 20', () => {
    expect(parseMargin('')).toBe(20)
    expect(parseMargin(undefined)).toBe(20)
    expect(parseMargin('-5')).toBe(20)
    expect(parseMargin('0')).toBe(20)
    expect(parseMargin('101')).toBe(20)
    expect(parseMargin('abc')).toBe(20)
    expect(parseMargin('35')).toBe(35)
    expect(parseMargin('100')).toBe(100)
  })

  it('filtros da URL viram parâmetros da API (vazios e datas fora do personalizado omitidos)', () => {
    expect(toMetricsParams({ periodo: '30d', de: '2026-01-01', ate: '', clientes: [], repositorios: ['p1'], margem: '' })).toEqual({ periodo: '30d', repositorios: 'p1' })
    expect(toMetricsParams({ periodo: 'custom', de: '2026-01-01', ate: '2026-01-31', clientes: ['c1', 'c2'], repositorios: [], margem: '30' })).toEqual({ periodo: 'custom', de: '2026-01-01', ate: '2026-01-31', clientes: 'c1,c2', margem: '30' })
  })
})

describe('tempo relativo do Último uso', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms)
  const DAY = 86_400_000
  it('dias, semanas e meses', () => {
    expect(formatRelativePast(ago(3 * DAY), NOW)).toBe('há 3 dias')
    expect(formatRelativePast(ago(1 * DAY), NOW)).toBe('há 1 dia')
    expect(formatRelativePast(ago(15 * DAY), NOW)).toBe('há 2 semanas')
    expect(formatRelativePast(ago(125 * DAY), NOW)).toBe('há 4 meses')
    expect(formatRelativePast(ago(30 * 60_000), NOW)).toBe('há 30 minutos')
    expect(formatRelativePast(ago(400 * DAY), NOW)).toBe('há 1 ano')
  })
})
