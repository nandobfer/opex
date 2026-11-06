import { describe, expect, it } from 'vitest'
import { isOpexMemoryAgent, isRoutineAgentIdentity, listOfChannel, memoryChannelOf } from '@/features/ai/agents'
import { extraChannelPrompt, parseExtraChannelPlan } from '@/features/routine-agents/provision-plan'

/** Listas dos agentes rotineiros em `agents.ts` (OPE-130) e o plano dos canais extras do provisionamento. */

describe('listas dos rotineiros', () => {
  it('routine-global e routine-specific viram canais e voltam pelo listOfChannel', () => {
    expect(memoryChannelOf('routine-global')).toBe('agentes/rotineiros/global')
    expect(memoryChannelOf('routine-specific', { routineSlug: 'vagas-x' })).toBe('agentes/rotineiros/vagas-x')
    expect(memoryChannelOf('routine-specific', { routineSlug: 'global' })).toBeNull()
    expect(memoryChannelOf('routine-specific', {})).toBeNull()
    expect(listOfChannel('agentes/rotineiros/global')).toEqual({ agentId: 'routine-global' })
    expect(listOfChannel('agentes/rotineiros/vagas-x')).toEqual({ agentId: 'routine-specific', routineSlug: 'vagas-x' })
  })

  it('cada rotineiro é um agente do Opex no Engramind (Identidades)', () => {
    expect(isRoutineAgentIdentity('rotineiro-vagas-x')).toBe(true)
    expect(isRoutineAgentIdentity('rotineiro-global')).toBe(false)
    expect(isOpexMemoryAgent('opex', 'opex/rotineiro-vagas-x')).toBe(true)
    expect(isOpexMemoryAgent('outro', 'rotineiro-vagas-x')).toBe(false)
  })
})

describe('plano dos canais extras', () => {
  const existing = [
    { slug: 'vagas/empresa-x', name: 'Vagas da Empresa X' },
    { slug: 'agentes/desenvolvedor/global', name: 'Dev' },
  ]

  it('assina o existente, transforma em assinatura o "novo" que já existe e descarta o inexistente', () => {
    const plan = parseExtraChannelPlan(
      '```json\n{"subscribe":[{"channel":"vagas/empresa-x","reason":"vagas"},{"channel":"nao/existe","reason":"x"}],"create":[{"slug":"vagas/empresa-x","name":"Dup","reason":"y"},{"slug":"curriculos/backend","name":"Currículos","reason":"z"}]}\n```',
      existing,
    )
    expect(plan.items).toEqual([
      { channel: 'vagas/empresa-x', name: 'Vagas da Empresa X', description: '', reason: 'vagas', create: false },
      { channel: 'curriculos/backend', name: 'Currículos', description: '', reason: 'z', create: true },
    ])
    expect(plan.warnings[0]).toContain('nao/existe')
  })

  it('nunca escolhe canais privados de outros agentes nem os já assinados', () => {
    const plan = parseExtraChannelPlan('{"subscribe":[{"channel":"agentes/desenvolvedor/global"}],"create":[{"slug":"agentes/rotineiros/outro"}]}', existing, [])
    expect(plan.items).toEqual([])
    expect(parseExtraChannelPlan('{"subscribe":[{"channel":"vagas/empresa-x"}]}', existing, ['vagas/empresa-x']).items).toEqual([])
    expect(extraChannelPrompt({ name: 'A', objective: 'B', instructions: '' }, [...existing.map((item) => ({ ...item, description: null }))], [])).not.toContain('agentes/desenvolvedor/global')
  })

  it('resposta sem JSON falha (o provisionamento fica com erro)', () => {
    expect(() => parseExtraChannelPlan('não sei', existing)).toThrow(/JSON/)
  })
})
