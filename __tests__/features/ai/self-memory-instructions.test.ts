import { describe, expect, it } from 'vitest'
import { MEMORY_CONSUMERS, type MemoryConsumer, type MemoryTurn } from '@/features/ai/agents'
import { SELF_MEMORY_TURN_LIMIT, selfMemoryInstructions } from '@/features/ai/self-memory'

/** OPE-117: instrução de memória própria acionável (checklist de fim de turno, contagem fora do contexto e leitura). */

const TURNS: Record<MemoryConsumer, MemoryTurn> = {
  opex: { kind: 'owner' },
  maddox: { kind: 'owner' },
  adversario: { kind: 'review' },
  arquiteto: { kind: 'review' },
  desenvolvedor: { kind: 'central', centralId: 'a'.repeat(24) },
}

describe('instrução de memória própria', () => {
  it.each(MEMORY_CONSUMERS)('%s: checklist com os 4 gatilhos, limite e remember × gestão', (consumer) => {
    const text = selfMemoryInstructions(consumer, TURNS[consumer], { toolPrefix: 'opex_memorias_', counts: { titles: 3, overflow: 2 } })
    expect(text).toContain('Checklist de fim de turno')
    expect(text).toContain('corrigiu você')
    expect(text).toContain('decisão se repetiu')
    expect(text).toContain('comando, caminho')
    expect(text).toContain('preferência foi confirmada')
    expect(text).toContain(`No máximo ${SELF_MEMORY_TURN_LIMIT} gravações por turno.`)
    expect(text).toContain('`opex_memorias_remember` é o seu caminho de aprendizado')
    expect(text).toContain('gravam como o DONO')
    expect(text).toContain('3 só pelo título')
    expect(text).toContain('2 fora do bloco')
    expect(text).toContain('consolide')
    expect(text).toContain('Listas que você grava:')
  })

  it('o bloco de leitura fica separado do de gravação e manda get_hints → get_memory, com search de reserva', () => {
    const text = selfMemoryInstructions('opex', { kind: 'owner' }, { counts: { titles: 1, overflow: 0 } })
    const read = text.indexOf('## Memórias fora do contexto (leitura)')
    const write = text.indexOf('## Memória própria (aprendizado autônomo)')
    expect(read).toBeGreaterThanOrEqual(0)
    expect(write).toBeGreaterThan(read)
    expect(text).toContain('`get_hints`')
    expect(text).toContain('`get_memory`')
    expect(text).toContain('`search_memories`')
    expect(text).toContain('não invente uma memória')
  })

  it('sem overflow mostra "0 fora do contexto"; com o Engramind indisponível a linha some e a instrução continua', () => {
    expect(selfMemoryInstructions('opex', { kind: 'owner' }, { counts: { titles: 0, overflow: 0 } })).toContain('0 fora do contexto')
    const unavailable = selfMemoryInstructions('opex', { kind: 'owner' }, { counts: null })
    expect(unavailable).not.toContain('fora do contexto neste turno')
    expect(unavailable).toContain('Checklist de fim de turno')
  })

  it('aprendizado desligado: só a leitura (sem checklist); sem nada fora do contexto, nada', () => {
    const readOnly = selfMemoryInstructions('maddox', { kind: 'client', clientId: 'b'.repeat(24) }, { write: false, counts: { titles: 2, overflow: 0 } })
    expect(readOnly).toContain('`get_hints`')
    expect(readOnly).not.toContain('Checklist')
    expect(readOnly).not.toContain('é o seu caminho de aprendizado')
    // O catálogo do MCP é único por diretório: a instrução avisa que as de gravação são recusadas.
    expect(readOnly).toContain('Não chame as ferramentas de gravação')
    expect(readOnly).toContain('`remember`')
    expect(selfMemoryInstructions('maddox', { kind: 'owner' }, { write: false, counts: { titles: 0, overflow: 0 } })).toBe('')
  })

  it('duas camadas: desenvolvedor e Adversário sabem que o Mentor grava o que passou batido; os demais não', () => {
    expect(selfMemoryInstructions('desenvolvedor', TURNS.desenvolvedor)).toContain('Agente Mentor revisa a cadeia depois')
    expect(selfMemoryInstructions('adversario', TURNS.adversario)).toContain('Agente Mentor revisa a cadeia depois')
    expect(selfMemoryInstructions('opex', TURNS.opex)).not.toContain('Agente Mentor')
  })

  it('desenvolvedor na central grava em developer-global e developer-central', () => {
    const text = selfMemoryInstructions('desenvolvedor', TURNS.desenvolvedor)
    expect(text).toContain('`developer-global`')
    expect(text).toContain('`developer-central`')
  })
})
