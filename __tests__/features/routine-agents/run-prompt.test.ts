import { afterEach, describe, expect, it, vi } from 'vitest'
import { activationMessage, routineInstructions, type ActivationMessageInput, type RoutineInstructionInput } from '@/features/routine-agents/run-prompt'

/**
 * Textos da execução (OPE-204): as instruções do sistema não levam data e hora (o prefixo do prompt se
 * repete entre execuções e o provedor acerta o cache); a data e a hora vão na mensagem de cada ativação.
 */

const instructionInput: RoutineInstructionInput = {
  name: 'Agente Indexador',
  objective: 'Catalogar os repositórios',
  instructions: 'Use a planilha do dono.',
  engine: 'opex',
  confirmIrreversible: true,
  maxLiveWaitMinutes: null,
  memoryBlock: '- já catalogou o repo A',
  memoryChannels: ['agentes/indexador'],
  toolPrefix: '',
  warnings: ['A ferramenta "x" foi removida.'],
  http: { tool: 'http_request', secrets: [] },
  skillsBlock: '## Skills disponíveis\n- planilhas',
}

const messageInput: Omit<ActivationMessageInput, 'kind' | 'now'> = { origin: 'manual', request: 'Indexe o repo B', payload: null, delayMs: null, resumeNote: null }

const brasilia = (date: Date) => `Data e hora atual: ${date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (horário de Brasília).`

afterEach(() => {
  vi.useRealTimers()
})

describe('routineInstructions — estáveis entre execuções (OPE-204)', () => {
  it('não trazem data e hora e mantêm a ordem das seções, do mais estável ao mais variável', () => {
    const text = routineInstructions(instructionInput)
    expect(text).not.toContain('Data e hora atual')
    const order = ['Você é o agente rotineiro', '## Objetivo', '## Instruções do dono', '## Como trabalhar', '## Chamadas HTTP e segredos', '## Skills disponíveis', '## Avisos', '## Memórias'].map((marker) => text.indexOf(marker))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('duas execuções em instantes diferentes, com a mesma configuração, geram instruções idênticas', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'))
    const first = routineInstructions(instructionInput)
    vi.setSystemTime(new Date('2026-11-27T09:30:15Z'))
    const second = routineInstructions(instructionInput)
    expect(second).toBe(first)
  })
})

describe('consulta às memórias por índice (OPE-209)', () => {
  it('motor Opex: índice primeiro, consulta por chave, listagem como exceção, índice atualizado e leituras juntas', () => {
    const text = routineInstructions(instructionInput)
    expect(text).toContain('leia primeiro a memória de chave `indice` (list_my_memories com `chave: "indice"`')
    expect(text).toContain('busque cada item por `chave`')
    expect(text).toContain('Listar os títulos do canal inteiro (formato "titulos", seguindo o cursor) é exceção')
    expect(text).toContain('Acrescente ao `indice` o que encontrar assim')
    expect(text).toContain('crie-o uma única vez com as chaves que já existem')
    expect(text).toContain('Se não couber numa memória (até 20 mil caracteres), mantenha o `indice` como mapa curto e divida em índices por tema (`indice-<tema>`), citados nele.')
    expect(text).toContain('acrescente-a ao `indice` do mesmo canal nesta execução, editando com update_memory')
    expect(text).toContain('saem juntas, no mesmo passo')
    expect(text).toContain('Se as instruções do dono acima definirem outro jeito de consultar as memórias, elas valem.')
  })

  it('a orientação antiga (listar o canal inteiro antes de trabalhar) não aparece', () => {
    for (const engine of ['opex', 'opencode'] as const) {
      const text = routineInstructions({ ...instructionInput, engine, toolPrefix: engine === 'opencode' ? 'rotina_ab12_' : '' })
      expect(text).not.toContain('ANTES de trabalhar')
      expect(text).not.toContain('para consultar tudo de um canal')
    }
  })

  it('motor OpenCode: as ferramentas de memória saem com o prefixo, sem nome cru', () => {
    const text = routineInstructions({ ...instructionInput, engine: 'opencode', toolPrefix: 'rotina_ab12_', http: null })
    expect(text).toContain('rotina_ab12_list_my_memories com `chave: "indice"`')
    expect(text).toContain('com rotina_ab12_remember e `chave: "indice"`')
    expect(text).toContain('editando com rotina_ab12_update_memory')
    for (const name of ['list_my_memories', 'remember', 'update_memory']) expect(text).not.toMatch(new RegExp(`(?<!rotina_ab12_)\\b${name}\\b`))
  })
})

describe('activationMessage — data e hora da ativação (OPE-204)', () => {
  it('disparo: a data e a hora (horário de Brasília) vêm logo depois do cabeçalho', () => {
    const now = new Date('2026-11-05T12:00:00Z')
    const lines = activationMessage({ kind: 'start', ...messageInput, now }).split('\n')
    expect(lines[0]).toMatch(/^\[Execução disparada por:/)
    expect(lines[1]).toBe(brasilia(now))
    expect(lines[1]).toContain('09:00:00')
    expect(lines.slice(2)).toEqual(['Solicitação desta execução:', 'Indexe o repo B'])
  })

  it('retomada: vale a hora da retomada, logo depois do cabeçalho', () => {
    const now = new Date('2026-11-27T09:30:15Z')
    const lines = activationMessage({ kind: 'resume', ...messageInput, resumeNote: 'Hibernou: aguardando o deploy.', now }).split('\n')
    expect(lines[0]).toMatch(/^\[Retomada da execução/)
    expect(lines[1]).toBe(brasilia(now))
    expect(lines[2]).toBe('Hibernou: aguardando o deploy.')
  })

  it('now nulo omite a linha; a mensagem combinada (disparo + retomada) leva a data uma única vez', () => {
    const now = new Date('2026-11-27T09:30:15Z')
    expect(activationMessage({ kind: 'start', ...messageInput, now: null })).not.toContain('Data e hora atual')
    const combined = [activationMessage({ kind: 'start', ...messageInput, now: null }), '', activationMessage({ kind: 'resume', ...messageInput, now })].join('\n')
    expect(combined.split('Data e hora atual').length - 1).toBe(1)
    expect(combined).toContain(brasilia(now))
  })
})
