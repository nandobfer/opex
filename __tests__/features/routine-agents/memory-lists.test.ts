import { describe, expect, it } from 'vitest'
import { isOpexMemoryAgent, isRoutineAgentIdentity, listOfChannel, memoryChannelOf } from '@/features/ai/agents'
import { LEGACY_NAMESPACE } from '@/features/engramind/channel-namespace'
import { extraChannelPrompt, parseExtraChannelPlan } from '@/features/routine-agents/provision-plan'

/** Listas dos agentes rotineiros em `agents.ts` (OPE-130) e o plano dos canais extras do provisionamento. */

const L = LEGACY_NAMESPACE
const ALF = { app: 'alfredopex', prefixed: true }

describe('listas dos rotineiros', () => {
  it('routine-global e routine-specific viram canais e voltam pelo listOfChannel', () => {
    expect(memoryChannelOf('routine-global', {}, L)).toBe('agentes/rotineiros/global')
    expect(memoryChannelOf('routine-specific', { routineSlug: 'vagas-x' }, L)).toBe('agentes/rotineiros/vagas-x')
    expect(memoryChannelOf('routine-specific', { routineSlug: 'global' }, L)).toBeNull()
    expect(memoryChannelOf('routine-specific', {}, L)).toBeNull()
    expect(listOfChannel('agentes/rotineiros/global', L)).toEqual({ agentId: 'routine-global' })
    expect(listOfChannel('agentes/rotineiros/vagas-x', L)).toEqual({ agentId: 'routine-specific', routineSlug: 'vagas-x' })
    expect(memoryChannelOf('routine-specific', { routineSlug: 'vagas-x' }, ALF)).toBe('alfredopex/agentes/rotineiros/vagas-x')
    expect(listOfChannel('alfredopex/agentes/rotineiros/vagas-x', ALF)).toEqual({ agentId: 'routine-specific', routineSlug: 'vagas-x' })
  })

  it('cada rotineiro é um agente do Opex no Engramind (Identidades)', () => {
    expect(isRoutineAgentIdentity('rotineiro-vagas-x')).toBe(true)
    expect(isRoutineAgentIdentity('rotineiro-global')).toBe(false)
    expect(isOpexMemoryAgent('opex', 'opex/rotineiro-vagas-x', 'opex')).toBe(true)
    expect(isOpexMemoryAgent('outro', 'rotineiro-vagas-x', 'opex')).toBe(false)
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
      [],
      [],
      L,
    )
    expect(plan.items).toEqual([
      { channel: 'vagas/empresa-x', name: 'Vagas da Empresa X', description: '', reason: 'vagas', create: false },
      { channel: 'curriculos/backend', name: 'Currículos', description: '', reason: 'z', create: true },
    ])
    expect(plan.warnings[0]).toContain('nao/existe')
  })

  it('nunca escolhe canais privados de outros agentes nem os já assinados', () => {
    const plan = parseExtraChannelPlan('{"subscribe":[{"channel":"agentes/desenvolvedor/global"}],"create":[{"slug":"agentes/rotineiros/outro"}]}', existing, [], [], L)
    expect(plan.items).toEqual([])
    expect(parseExtraChannelPlan('{"subscribe":[{"channel":"vagas/empresa-x"}]}', existing, ['vagas/empresa-x'], [], L).items).toEqual([])
    expect(extraChannelPrompt({ name: 'A', objective: 'B', instructions: '' }, [...existing.map((item) => ({ ...item, description: null }))], [], [], L)).not.toContain('agentes/desenvolvedor/global')
  })

  it('OPE-206: os canais reservados da instância ficam de fora; os de outros apps continuam elegíveis', () => {
    const channels = [
      { slug: 'alfredopex/agentes/desenvolvedor/global', name: 'Dev' },
      { slug: 'alfredopex', name: 'Raiz' },
      { slug: 'dndicas/opex/admin', name: 'Admin' },
    ]
    const plan = parseExtraChannelPlan('{"subscribe":[{"channel":"alfredopex/agentes/desenvolvedor/global"},{"channel":"alfredopex"},{"channel":"dndicas/opex/admin"}]}', channels, [], [], ALF)
    expect(plan.items.map((item) => item.channel)).toEqual(['dndicas/opex/admin'])
  })

  it('resposta sem JSON falha (o provisionamento fica com erro)', () => {
    expect(() => parseExtraChannelPlan('não sei', existing, [], [], L)).toThrow(/JSON/)
  })
})
