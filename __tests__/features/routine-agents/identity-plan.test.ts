import { describe, expect, it } from 'vitest'
import { generatedNameProblem, identityNeeds, parseGeneratedIdentity, routineAgentTitle } from '@/features/routine-agents/identity-plan'
import { routineAgentInputSchema, DEFAULT_ROUTINE_AGENT_INPUT, ROUTINE_IDENTITY_SOURCE_MESSAGE } from '@/features/routine-agents/schemas'
import { slugifyRoutineName, uniqueRoutineSlug } from '@/features/routine-agents/slug'

/** Identidade gerada pelo subagente de provisionamento (critério aprovado OPE-130, D8: o nome é só o papel). */

const TAKEN = ['Desenvolvedor', 'Arquiteto', 'Adversário', 'Vagas']

describe('nome gerado (D8)', () => {
  it('aceita o papel com uma ou duas palavras', () => {
    expect(generatedNameProblem('Recrutador', TAKEN)).toBeNull()
    expect(generatedNameProblem('Monitor Fiscal', TAKEN)).toBeNull()
  })

  it('recusa "Agente", "Rotineiro", agente fixo, rotineiro existente (sem acento), três palavras e mais de 30 caracteres', () => {
    expect(generatedNameProblem('Agente Recrutador', TAKEN)).toMatch(/Agente/)
    expect(generatedNameProblem('Rotineiro', TAKEN)).toMatch(/Rotineiro/)
    expect(generatedNameProblem('Desenvolvedor', TAKEN)).toMatch(/outro agente/)
    expect(generatedNameProblem('adversario', TAKEN)).not.toBeNull()
    expect(generatedNameProblem('Adversario', TAKEN)).toMatch(/outro agente/)
    expect(generatedNameProblem('Monitor Fiscal Federal', TAKEN)).toMatch(/duas palavras/)
    expect(generatedNameProblem('Supercalifragilisticexpialidocioso', TAKEN)).toMatch(/30/)
    expect(generatedNameProblem('Recrutador2', TAKEN)).toMatch(/só letras/)
  })

  it('gera só o que está vazio e recusa objetivo vazio', () => {
    expect(identityNeeds({ name: 'Vagas', objective: '' })).toEqual({ name: false, objective: true })
    expect(parseGeneratedIdentity('```json\n{"name":"Outro","objective":"Fazer X."}\n```', { name: false, objective: true }, TAKEN)).toEqual({ objective: 'Fazer X.' })
    expect(() => parseGeneratedIdentity('{"name":"Recrutador","objective":""}', { name: true, objective: true }, TAKEN)).toThrow(/objetivo: objetivo vazio/)
    expect(() => parseGeneratedIdentity('sem json', { name: true, objective: false }, TAKEN)).toThrow(/JSON/)
  })

  it('título mostra "Agente <nome>" e o estado de geração', () => {
    expect(routineAgentTitle('Recrutador')).toBe('Agente Recrutador')
    expect(routineAgentTitle('Agente Vagas')).toBe('Agente Vagas')
    expect(routineAgentTitle('')).toBe('Agente rotineiro (gerando nome…)')
  })
})

describe('schema e slug', () => {
  it('nome e objetivo opcionais; objetivo ou instruções obrigatórios', () => {
    const base = { ...DEFAULT_ROUTINE_AGENT_INPUT, opex: { ...DEFAULT_ROUTINE_AGENT_INPUT.opex, provider: 'anthropic' as const, model: 'claude' } }
    const empty = routineAgentInputSchema.safeParse(base)
    expect(empty.success).toBe(false)
    expect(empty.error?.issues).toContainEqual(expect.objectContaining({ path: ['objective'], message: ROUTINE_IDENTITY_SOURCE_MESSAGE }))
    expect(routineAgentInputSchema.safeParse({ ...base, name: 'Vagas' }).success).toBe(false)
    expect(routineAgentInputSchema.safeParse({ ...base, instructions: 'Procure vagas' }).success).toBe(true)
    expect(routineAgentInputSchema.safeParse({ ...base, objective: 'Candidatar-se' }).success).toBe(true)
    expect(routineAgentInputSchema.safeParse({ ...base, objective: 'x', name: 'A' }).success).toBe(false)
  })

  it('o slug ignora um "Agente" no começo e nunca usa o prefixo provisório', () => {
    expect(slugifyRoutineName('Agente Vagas')).toBe('vagas')
    expect(uniqueRoutineSlug('Pendente 1', new Set())).toBe('agente-pendente-1')
  })
})
