import { describe, expect, it } from 'vitest'
import { extraChannelPrompt, parseExtraChannelPlan } from '@/features/routine-agents/provision-plan'

/** Plano dos canais extras (OPE-143): canal bloqueado pelo dono nunca entra, nem em `subscribe` nem em `create`. */

const existing = [
  { slug: 'vagas/empresa-x', name: 'Vagas X' },
  { slug: 'experiencia/desenvolvimento', name: 'Experiência' },
]
const answer = JSON.stringify({
  subscribe: [
    { channel: 'vagas/empresa-x', reason: 'vagas' },
    { channel: 'experiencia/desenvolvimento', reason: 'exp' },
  ],
  create: [
    { slug: 'dndicas/opex/admin', name: 'Admin', reason: 'novo' },
    { slug: 'curriculos/backend', name: 'Currículos', reason: 'novo' },
  ],
})

describe('parseExtraChannelPlan com canais bloqueados', () => {
  it('descarta o bloqueado em subscribe e em create, com aviso, e mantém os demais', () => {
    const plan = parseExtraChannelPlan(answer, existing, [], ['experiencia/desenvolvimento', 'dndicas/opex/admin'])
    expect(plan.items.map((item) => item.channel)).toEqual(['vagas/empresa-x', 'curriculos/backend'])
    expect(plan.warnings).toEqual(['Canal "experiencia/desenvolvimento" está bloqueado neste agente: ignorado.', 'Canal "dndicas/opex/admin" está bloqueado neste agente: ignorado.'])
  })

  it('bloqueado que já existe como canal também não vira assinatura', () => {
    const plan = parseExtraChannelPlan(answer, existing, [], ['vagas/empresa-x'])
    expect(plan.items.map((item) => item.channel)).not.toContain('vagas/empresa-x')
  })

  it('sem bloqueados o comportamento é o de sempre', () => {
    expect(parseExtraChannelPlan(answer, existing).items).toHaveLength(4)
  })
})

describe('extraChannelPrompt com canais bloqueados', () => {
  const agent = { name: 'Garimpeiro', objective: 'Achar vagas', instructions: '' }
  const channels = existing.map((item) => ({ ...item, description: null }))

  it('lista os bloqueados como "não assine" e os tira da lista de existentes', () => {
    const prompt = extraChannelPrompt(agent, channels, [], ['experiencia/desenvolvimento'])
    expect(prompt).toContain('Bloqueados pelo dono (não assine nem crie')
    expect(prompt).toContain('experiencia/desenvolvimento')
    expect(prompt).not.toContain('- experiencia/desenvolvimento —')
    expect(prompt).toContain('- vagas/empresa-x — Vagas X')
  })

  it('sem bloqueados não há a linha', () => {
    expect(extraChannelPrompt(agent, channels, [])).not.toContain('Bloqueados')
  })
})
