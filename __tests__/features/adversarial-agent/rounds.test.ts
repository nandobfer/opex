import { describe, expect, it } from 'vitest'
import { decideRound, findingsToFix, planRound } from '@/features/adversarial-agent/rounds'
import { DEFAULT_ADVERSARIAL_SETTINGS } from '@/features/adversarial-agent/schemas'

const settings = (overrides: Partial<typeof DEFAULT_ADVERSARIAL_SETTINGS> = {}) => ({ ...DEFAULT_ADVERSARIAL_SETTINGS, ...overrides })
const blocking = [{ blocking: true }]

describe('planRound', () => {
  it('primeira revisão da mesa: ciclo 1, rodada 1', () => {
    expect(planRound([])).toEqual({ cycle: 1, round: 1, previousIndex: null })
  })

  it('depois de uma correção (automática ou pedida) ou de "Revisar de novo", segue o ciclo', () => {
    expect(planRound([{ cycle: 2, round: 1, decision: 'fix-auto' }])).toEqual({ cycle: 2, round: 2, previousIndex: 0 })
    expect(planRound([{ cycle: 2, round: 2, decision: 'fix-user' }])).toEqual({ cycle: 2, round: 3, previousIndex: 0 })
    expect(planRound([{ cycle: 1, round: 1, decision: 'rerun' }])).toEqual({ cycle: 1, round: 2, previousIndex: 0 })
  })

  it('rodada que falhou é repetida (não conta como nova)', () => {
    expect(
      planRound([
        { cycle: 3, round: 2, decision: 'failed' },
        { cycle: 3, round: 1, decision: 'fix-auto' },
      ]),
    ).toEqual({ cycle: 3, round: 2, previousIndex: 1 })
    expect(planRound([{ cycle: 3, round: 1, decision: 'interrupted' }])).toEqual({ cycle: 3, round: 1, previousIndex: null })
  })

  it('implementação nova depois de aprovar ou seguir: ciclo novo', () => {
    expect(planRound([{ cycle: 1, round: 2, decision: 'approved' }])).toEqual({ cycle: 2, round: 1, previousIndex: null })
    expect(planRound([{ cycle: 4, round: 1, decision: 'skipped' }])).toEqual({ cycle: 5, round: 1, previousIndex: null })
  })
})

describe('decideRound', () => {
  it('sem bloqueio aprova', () => {
    expect(decideRound([{ blocking: false }], 1, settings())).toEqual({ kind: 'approved', decision: 'approved' })
  })

  it('correção automática volta ao implementador; com confirmação, aguarda o usuário', () => {
    expect(decideRound(blocking, 1, settings())).toEqual({ kind: 'fix', decision: 'fix-auto' })
    expect(decideRound(blocking, 1, settings({ correction: 'confirm' }))).toEqual({ kind: 'blocked', decision: 'awaiting', limitReached: false })
  })

  it('no limite de rodadas: pausa e pergunta (padrão) ou segue com aviso', () => {
    expect(decideRound(blocking, 3, settings())).toEqual({ kind: 'blocked', decision: 'awaiting', limitReached: true })
    expect(decideRound(blocking, 3, settings({ rounds: { limited: true, max: 3, onLimit: 'continue' } }))).toEqual({ kind: 'proceed', decision: 'proceeded-limit' })
  })

  it('sem limite de rodadas, sempre corrige', () => {
    expect(decideRound(blocking, 50, settings({ rounds: { limited: false, max: 3, onLimit: 'pause' } }))).toEqual({ kind: 'fix', decision: 'fix-auto' })
  })
})

describe('findingsToFix', () => {
  it('só os bloqueantes, menos os desmarcados', () => {
    const findings = [
      { id: 'F1', blocking: true },
      { id: 'F2', blocking: true },
      { id: 'F3', blocking: false },
    ]
    expect(findingsToFix(findings, ['F2']).map((item) => item.id)).toEqual(['F1'])
  })
})
