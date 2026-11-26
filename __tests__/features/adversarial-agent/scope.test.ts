import { describe, expect, it } from 'vitest'
import { adversaryAppliesTo } from '@/features/adversarial-agent/scope'

/** OPE-187: regra única de "o Agente Adversário roda nas mesas desta central" (servidor e etapa inicial). */
describe('adversaryAppliesTo', () => {
  it('ativo com escopo "todas" vale para qualquer central', () => {
    expect(adversaryAppliesTo({ enabled: true, scope: { all: true, centralIds: [] } }, 'c1')).toBe(true)
  })

  it('ativo com escopo por lista vale só para as centrais escolhidas', () => {
    const settings = { enabled: true, scope: { all: false, centralIds: ['c1'] } }
    expect(adversaryAppliesTo(settings, 'c1')).toBe(true)
    expect(adversaryAppliesTo(settings, 'c2')).toBe(false)
  })

  it('desligado não vale para nenhuma central', () => {
    expect(adversaryAppliesTo({ enabled: false, scope: { all: true, centralIds: [] } }, 'c1')).toBe(false)
  })
})
