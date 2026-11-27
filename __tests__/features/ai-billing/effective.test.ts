import { describe, expect, it } from 'vitest'
import { autoExhaustionAt } from "@nandobfer/integracoes/modules/integrations/ia/features/ai-billing/credits"
import { cycleFor, dailyQuota } from "@nandobfer/integracoes/modules/integrations/ia/features/ai-billing/cycle"
import { stepEffectiveCost, sumStepCosts, type BillingLookup, type CostStepInput, type KeyBillingInfo, type SubscriptionDayTotal } from "@nandobfer/integracoes/modules/integrations/ia/features/ai-billing/effective"
import type { StoredAiKeyBilling } from "@nandobfer/integracoes/modules/integrations/ia/features/ai-billing/schemas"

/**
 * OPE-203: custo efetivo pela modalidade da chave que respondeu (pago por uso, créditos, assinatura com rateio
 * diário sobre o uso total), com uso extra, ociosidade fora dos agentes e R$ pela PTAX (sem cotação, indisponível).
 */

// 24/11/2026 12:00 UTC = 09:00 em Brasília (mesmo dia nos dois calendários).
const AT = new Date('2026-11-24T12:00:00Z')

const step = (extra: Partial<CostStepInput> = {}): CostStepInput => ({ id: 's1', at: AT, provider: 'deepseek', model: 'deepseek-flash', apiKeyId: 'key_a', listUsd: 1, estimated: false, allowanceUsd: null, extraUsd: null, ...extra })

function lookup(billing: StoredAiKeyBilling | null, options: { fx?: number | null; day?: SubscriptionDayTotal; exhaustedAt?: Date | null; provider?: string } = {}): BillingLookup {
  const key: KeyBillingInfo | null = billing ? { keyId: 'key_a', name: 'Pessoal', provider: options.provider ?? 'deepseek', billing } : null
  return {
    key: (id) => (id === 'key_a' ? key : null),
    fx: () => (options.fx === undefined ? 5 : options.fx),
    subscriptionDay: () => options.day ?? { kind: 'routine', total: 1 },
    creditsExhaustedAt: () => options.exhaustedAt ?? null,
  }
}

describe('pago por uso', () => {
  it('efetivo = tabela, em US$ e R$', () => {
    expect(stepEffectiveCost(step(), lookup({ mode: 'usage' }))).toMatchObject({ listUsd: 1, effectiveUsd: 1, listBrl: 5, effectiveBrl: 5, mode: 'usage', planLabel: 'Pessoal · Pago por uso' })
  })

  it('sem PTAX do dia, o R$ fica desconhecido (nunca zero) e avisa', () => {
    const cost = stepEffectiveCost(step(), lookup({ mode: 'usage' }, { fx: null }))
    expect(cost).toMatchObject({ listBrl: null, effectiveBrl: null, effectiveUsd: 1 })
    expect(cost.notices[0]).toContain('PTAX')
  })
})

describe('créditos', () => {
  const credits = (extra: Partial<Extract<StoredAiKeyBilling, { mode: 'credits' }>> = {}): StoredAiKeyBilling => ({ mode: 'credits', faceValueUsd: 100, paidAmount: 25, paidCurrency: 'USD', startsAt: '2026-11-01', expiresAt: '2026-12-31', exhaustedAt: null, ...extra })

  it('pagos: tabela × (pago ÷ face)', () => {
    expect(stepEffectiveCost(step(), lookup(credits())).effectiveUsd).toBeCloseTo(0.25, 6)
  })

  it('concedidos (pago 0): efetivo zero informado, economia igual à tabela', () => {
    const totals = sumStepCosts([stepEffectiveCost(step(), lookup(credits({ paidAmount: 0 })))])
    expect(totals).toMatchObject({ effectiveUsd: 0, savingsUsd: 1, partial: false })
  })

  it('fora da validade, esgotados pela data manual ou pela soma do Opex: custo de tabela com aviso', () => {
    const expired = stepEffectiveCost(step(), lookup(credits({ expiresAt: '2026-11-23' })))
    expect(expired.effectiveUsd).toBe(1)
    expect(expired.notices.join()).toContain('vencidos')
    expect(stepEffectiveCost(step(), lookup(credits({ exhaustedAt: '2026-11-24' }))).notices.join()).toContain('esgotados')
    expect(stepEffectiveCost(step(), lookup(credits(), { exhaustedAt: new Date('2026-11-24T11:00:00Z') })).effectiveUsd).toBe(1)
    expect(stepEffectiveCost(step(), lookup(credits({ startsAt: '2026-11-25' }))).notices.join()).toContain('ainda não iniciados')
  })

  it('pagos em R$: usa a PTAX do início para o valor pago em US$', () => {
    expect(stepEffectiveCost(step(), lookup(credits({ paidAmount: 250, paidCurrency: 'BRL' }), { fx: 5 })).effectiveUsd).toBeCloseTo(0.5, 6)
  })

  it('esgotamento automático: o passo que cruza o valor de face ainda é coberto, os seguintes não', () => {
    const at = (h: number) => new Date(`2026-11-24T0${h}:00:00Z`)
    expect(autoExhaustionAt([{ at: at(1), listUsd: 60 }, { at: at(2), listUsd: 50 }, { at: at(3), listUsd: 5 }], 100)).toEqual(at(3))
    expect(autoExhaustionAt([{ at: at(1), listUsd: 60 }], 100)).toBeNull()
  })
})

describe('assinatura', () => {
  const sub = (extra: Partial<Extract<StoredAiKeyBilling, { mode: 'subscription' }>> = {}): StoredAiKeyBilling => ({ mode: 'subscription', amount: 30, currency: 'USD', renewalDay: 1, iofPercent: null, ...extra })

  it('ciclo pelo dia de renovação (31 vira o último dia do mês) e cota diária', () => {
    expect(cycleFor('2026-11-24', 1)).toEqual({ start: '2026-11-01', end: '2026-12-01', days: 30 })
    expect(cycleFor('2026-04-15', 31)).toEqual({ start: '2026-03-31', end: '2026-04-30', days: 30 })
    expect(cycleFor('2026-02-10', 31)).toMatchObject({ start: '2026-01-31', end: '2026-02-28', days: 28 })
    expect(dailyQuota({ amount: 30, iofPercent: 10, renewalDay: 1 }, '2026-11-24')).toBeCloseTo(1.1, 6)
  })

  it('rateio sobre o uso total do dia na API de cota: o Opex carrega só a parte dele', () => {
    // Cota do dia = US$ 1; o passo usou 0,2 de um total de 0,8 → US$ 0,25.
    const cost = stepEffectiveCost(step({ provider: 'command-code', listUsd: 0.2 }), lookup(sub(), { provider: 'command-code', day: { kind: 'api', total: 0.8 } }))
    expect(cost.effectiveUsd).toBeCloseTo(0.25, 6)
  })

  it('Go: o uso do passo é o allowance e o uso extra pago à parte soma ao efetivo', () => {
    const cost = stepEffectiveCost(step({ provider: 'opencode-go', listUsd: 2, allowanceUsd: 0.4, extraUsd: 0.1 }), lookup(sub(), { provider: 'opencode-go', day: { kind: 'api', total: 0.4 } }))
    expect(cost.effectiveUsd).toBeCloseTo(1.1, 6)
  })

  it('fração limitada a 1 quando o total da API ainda não alcançou o passo', () => {
    expect(stepEffectiveCost(step({ listUsd: 5 }), lookup(sub(), { day: { kind: 'api', total: 1 } })).effectiveUsd).toBeCloseTo(1, 6)
  })

  it('dia sem o total da API: efetivo desconhecido, total Parcial com o motivo', () => {
    const cost = stepEffectiveCost(step(), lookup(sub(), { day: { kind: 'api', total: null } }))
    expect(cost.effectiveUsd).toBeNull()
    const totals = sumStepCosts([cost])
    expect(totals).toMatchObject({ partial: true, listUsd: 1, effectiveUsd: null, savingsUsd: null })
    expect(totals.notices.join()).toContain('não foi lido da API de cota')
  })

  it('sem API de cota: o dia é dividido entre os passos dos rotineiros pelo custo de tabela', () => {
    const lookupDay = lookup(sub(), { day: { kind: 'routine', total: 4 } })
    const costs = [stepEffectiveCost(step({ listUsd: 1 }), lookupDay), stepEffectiveCost(step({ listUsd: 3 }), lookupDay)]
    expect(costs.map((cost) => cost.effectiveUsd)).toEqual([0.25, 0.75])
    expect(sumStepCosts(costs).effectiveUsd).toBeCloseTo(1, 6)
  })

  it('mensalidade em R$ com IOF: o R$ é exato e o US$ sai pela PTAX', () => {
    const cost = stepEffectiveCost(step(), lookup(sub({ amount: 150, currency: 'BRL', iofPercent: 6.38 }), { fx: 5 }))
    expect(cost.effectiveBrl).toBeCloseTo((150 * 1.0638) / 30, 6)
    expect(cost.effectiveUsd).toBeCloseTo((150 * 1.0638) / 30 / 5, 6)
  })
})

describe('totais', () => {
  it('modelo sem preço deixa o total Parcial e é listado; chave removida conta como pago por uso', () => {
    const totals = sumStepCosts([
      stepEffectiveCost(step({ listUsd: null, model: 'novo' }), lookup({ mode: 'usage' })),
      stepEffectiveCost(step({ apiKeyId: 'key_removida', listUsd: 2 }), lookup({ mode: 'usage' })),
      stepEffectiveCost(step({ estimated: true }), lookup({ mode: 'usage' })),
    ])
    expect(totals).toMatchObject({ listUsd: 3, effectiveUsd: 3, partial: true, missingPrices: ['deepseek/novo'], estimated: true, steps: 3 })
    expect(totals.notices.join()).toContain('Chave removida')
  })
})
