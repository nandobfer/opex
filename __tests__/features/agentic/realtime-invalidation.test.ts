import { describe, expect, it } from 'vitest'
import { isOtherWorkbenchQuery, workbenchEventTarget } from '@/features/agentic/realtime-invalidation'

/** OPE-188: o avanço de uma mesa não refaz agora as consultas abertas de outra mesa. */

describe('workbenchEventTarget', () => {
  it('lê a mesa e a tarefa do payload; sem mesa não há alvo', () => {
    expect(workbenchEventTarget({ centralId: 'c1', workbenchId: 'w1', taskId: 't1' })).toEqual({ workbenchId: 'w1', taskId: 't1' })
    expect(workbenchEventTarget({ centralId: 'c1', workbenchId: 'w1' })).toEqual({ workbenchId: 'w1', taskId: null })
    expect(workbenchEventTarget({ centralId: 'c1' })).toBeNull()
    expect(workbenchEventTarget({ scope: 'settings' })).toBeNull()
    expect(workbenchEventTarget(undefined)).toBeNull()
  })
})

describe('isOtherWorkbenchQuery', () => {
  const target = { workbenchId: 'w1', taskId: 't1' }

  it('mesa por tarefa: só a de outra tarefa é "de outra mesa"', () => {
    expect(isOtherWorkbenchQuery(['agentic', 'workbench', 't1'], target)).toBe(false)
    expect(isOtherWorkbenchQuery(['agentic', 'workbench', 't2'], target)).toBe(true)
    // Sem a tarefa no evento não dá para saber: recarrega normalmente.
    expect(isOtherWorkbenchQuery(['agentic', 'workbench', 't2'], { workbenchId: 'w1', taskId: null })).toBe(false)
  })

  it('forks e builds pelo id da mesa', () => {
    expect(isOtherWorkbenchQuery(['agentic', 'forks', 'w1'], target)).toBe(false)
    expect(isOtherWorkbenchQuery(['agentic', 'forks', 'w2'], target)).toBe(true)
    expect(isOtherWorkbenchQuery(['agentic', 'builds', 'w2'], target)).toBe(true)
  })

  it('consultas não ligadas a uma mesa recarregam normalmente', () => {
    expect(isOtherWorkbenchQuery(['agentic', 'workbenches', 'c1'], target)).toBe(false)
    expect(isOtherWorkbenchQuery(['agentic', 'queue', 'c1'], target)).toBe(false)
    expect(isOtherWorkbenchQuery(['agentic', 'centrals'], target)).toBe(false)
  })
})
