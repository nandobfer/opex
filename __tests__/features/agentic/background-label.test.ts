import { describe, expect, it } from 'vitest'
import { activeBackground, backgroundLabel } from '@/features/agentic/background-label'

describe('backgroundLabel (OPE-216)', () => {
  it('usa singular e plural e junta os tipos', () => {
    expect(backgroundLabel({ subagents: 1, shells: 0, other: 0 })).toBe('Aguardando 1 subagente em segundo plano…')
    expect(backgroundLabel({ subagents: 2, shells: 1, other: 0 })).toBe('Aguardando 2 subagentes e 1 comando em segundo plano…')
    expect(backgroundLabel({ subagents: 2, shells: 3, other: 1 })).toBe('Aguardando 2 subagentes, 3 comandos e 1 tarefa em segundo plano…')
  })

  it('nada a aguardar não tem rótulo', () => {
    expect(backgroundLabel({ subagents: 0, shells: 0, other: 0 })).toBeNull()
    expect(backgroundLabel(null)).toBeNull()
    expect(activeBackground({ subagents: 0, shells: 0, other: 0 })).toBeNull()
    expect(activeBackground({ subagents: 1, shells: 0, other: 0 })).toEqual({ subagents: 1, shells: 0, other: 0 })
  })
})
