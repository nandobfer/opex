import { describe, expect, it } from 'vitest'
import { moveAllowed, parseReorgTargetValue, planItemAction, reconcileReorgPlan, reorgTargetValue, type ReorgDestination, type ReorgPlanItem } from '@/features/adversarial-agent/mentor/reorg'

/** Reorganização do acervo do Mentor (OPE-132): decisão por memória e conciliação do plano, sem rede. */

const list = (target: ReorgDestination['target'], centralId: string | null = null): ReorgDestination => ({ target, centralId })
const CENTRAL = 'a'.repeat(24)

const item = (overrides: Partial<ReorgPlanItem> & { memoryId: string }): ReorgPlanItem => ({
  memoryId: overrides.memoryId,
  origin: { target: 'adversarial', centralId: null, memoryId: overrides.memoryId, resumo: overrides.memoryId, texto: `${overrides.memoryId}.`, versao: 1, owner: false },
  action: 'keep',
  target: 'adversarial',
  centralId: null,
  text: null,
  mergeInto: null,
  mergeIntoResumo: null,
  reason: '',
  note: null,
  routerConfidence: null,
  routerReason: null,
  sanitizerReason: null,
  moveBlocked: false,
  ownerMemory: false,
  ...overrides,
})

describe('destinos da reorganização', () => {
  it('a chave da central leva o id e volta para a lista', () => {
    expect(reorgTargetValue('developer-central', CENTRAL)).toBe(`developer-central:${CENTRAL}`)
    expect(parseReorgTargetValue(`developer-central:${CENTRAL}`)).toEqual({ target: 'developer-central', centralId: CENTRAL })
    expect(reorgTargetValue('developer-global', null)).toBe('developer-global')
    expect(parseReorgTargetValue('developer-global')).toEqual({ target: 'developer-global', centralId: null })
    expect(parseReorgTargetValue('developer-central')).toBeNull()
    expect(parseReorgTargetValue('outra-lista')).toBeNull()
  })

  it('o token do Mentor alcança as três listas (o move exige origem e destino)', () => {
    expect(moveAllowed(list('adversarial'), list('developer-global'))).toBe(true)
    expect(moveAllowed(list('developer-central', CENTRAL), list('adversarial'))).toBe(true)
    expect(moveAllowed(list('developer-central', CENTRAL), list('developer-central', 'b'.repeat(24)))).toBe(true)
    // Central sem id válido: não há canal para mover.
    expect(moveAllowed(list('developer-central', null), list('developer-global'))).toBe(false)
  })
})

describe('planItemAction', () => {
  const same = { origin: list('adversarial'), destination: list('adversarial') }

  it('manter na mesma lista, reescrever e fundir com uma memória da lista', () => {
    expect(planItemAction({ ...same, writer: { action: 'keep' }, mergeExists: false })).toMatchObject({ action: 'keep', text: null })
    expect(planItemAction({ ...same, writer: { action: 'rewrite', text: 'Regra nova' }, mergeExists: false })).toMatchObject({ action: 'rewrite', text: 'Regra nova' })
    expect(planItemAction({ ...same, writer: { action: 'merge', memoryId: 'm2', text: 'Fundida' }, mergeExists: true })).toMatchObject({ action: 'merge', mergeInto: 'm2', text: 'Fundida' })
  })

  it('outra lista vira mover (com ou sem texto novo)', () => {
    const input = { origin: list('adversarial'), destination: list('developer-global'), mergeExists: false }
    expect(planItemAction({ ...input, writer: { action: 'keep' } })).toMatchObject({ action: 'move', target: 'developer-global', centralId: null, text: null })
    expect(planItemAction({ ...input, writer: { action: 'rewrite', text: 'Sem nomes do projeto' } })).toMatchObject({ action: 'move', target: 'developer-global', text: 'Sem nomes do projeto' })
  })

  it('fusão sem a memória de destino (ou para outra lista) vira manter, com o motivo', () => {
    expect(planItemAction({ ...same, writer: { action: 'merge', memoryId: 'm_apagada', text: 'X' }, mergeExists: false })).toMatchObject({ action: 'keep', mergeInto: null, note: expect.stringContaining('não está mais') })
    expect(planItemAction({ ...same, writer: { action: 'merge', text: 'X' }, mergeExists: true })).toMatchObject({ action: 'keep', note: expect.stringContaining('não está mais') })
  })
})

describe('reconcileReorgPlan', () => {
  it('fusões cruzadas: a primeira vence e a outra mantém', () => {
    const plan = reconcileReorgPlan([item({ memoryId: 'm1', action: 'merge', mergeInto: 'm2' }), item({ memoryId: 'm2', action: 'merge', mergeInto: 'm1' })])
    expect(plan[0]).toMatchObject({ action: 'merge', mergeInto: 'm2' })
    expect(plan[1]).toMatchObject({ action: 'keep', mergeInto: null })
    expect(plan[1]!.note).toContain('recebe outra fusão')
  })

  it('fusão em cadeia: quem seria absorvido não pode absorver ninguém', () => {
    const plan = reconcileReorgPlan([item({ memoryId: 'm1', action: 'merge', mergeInto: 'm2' }), item({ memoryId: 'm2', action: 'merge', mergeInto: 'm3' })])
    expect(plan[0]!.action).toBe('merge')
    expect(plan[1]!.action).toBe('keep')
    expect(plan[1]!.note).toContain('recebe outra fusão')
  })

  it('duas fusões no mesmo destino: a segunda mantém (não sobrescreve o texto da primeira)', () => {
    const plan = reconcileReorgPlan([item({ memoryId: 'm1', action: 'merge', mergeInto: 'm3' }), item({ memoryId: 'm2', action: 'merge', mergeInto: 'm3' })])
    expect(plan[0]!.action).toBe('merge')
    expect(plan[1]!.action).toBe('keep')
    expect(plan[1]!.note).toContain('já foi fundida')
  })

  it('a memória que recebe a fusão fica na lista (não pode ser movida) e o mover de outra segue', () => {
    const plan = reconcileReorgPlan([
      item({ memoryId: 'm1', action: 'merge', mergeInto: 'm2' }),
      item({ memoryId: 'm2', action: 'move', target: 'developer-global' }),
      item({ memoryId: 'm3', action: 'move', target: 'developer-global' }),
    ])
    expect(plan[1]).toMatchObject({ action: 'keep', target: 'adversarial' })
    expect(plan[1]!.note).toContain('recebe outra fusão')
    expect(plan[2]).toMatchObject({ action: 'move', target: 'developer-global' })
  })
})
