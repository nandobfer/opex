import { describe, expect, it } from 'vitest'
import { extractJsonBlock } from '@/features/agentic/prompts'
import { LESSON_INSTRUCTION, takeLessonBlock, withLessonInstruction } from '@/features/adversarial-agent/mentor/lesson-block'

const lesson = { problem: 'Crash ao salvar', shouldHaveCaught: 'Componente sem o provider', why: 'Acontece em qualquer tela' }
const block = (value: unknown) => `\`\`\`opex-lesson\n${typeof value === 'string' ? value : JSON.stringify(value)}\n\`\`\``

describe('bloco de lição do agente desenvolvedor', () => {
  it('lê o bloco válido e o retira da resposta', () => {
    const taken = takeLessonBlock(`Corrigido.\n\n${block(lesson)}`)
    expect(taken).toEqual({ text: 'Corrigido.', lesson, error: null })
  })

  it('resposta sem bloco passa igual', () => {
    expect(takeLessonBlock('Só a resposta')).toEqual({ text: 'Só a resposta', lesson: null, error: null })
  })

  it('bloco inválido vira erro (e sai da resposta)', () => {
    expect(takeLessonBlock(`Ok\n${block('{nao é json')}`)).toMatchObject({ text: 'Ok', lesson: null, error: expect.stringContaining('JSON válido') })
    expect(takeLessonBlock(`Ok\n${block({ problem: 'x' })}`)).toMatchObject({ lesson: null, error: expect.stringContaining('inválido') })
  })

  it('com mais de um bloco, vale o último válido', () => {
    const second = { ...lesson, problem: 'Segundo problema' }
    expect(takeLessonBlock(`${block(lesson)}\nmeio\n${block(second)}`).lesson).toEqual(second)
  })

  it('não atrapalha o JSON da etapa, antes ou depois do bloco', () => {
    const stage = '```json\n{"url":"https://github.com/o/r/pull/9","number":9}\n```'
    for (const text of [`${stage}\n\n${block(lesson)}`, `${block(lesson)}\n\n${stage}`]) {
      const taken = takeLessonBlock(text)
      expect(taken.lesson).toEqual(lesson)
      expect(extractJsonBlock(taken.text)).toEqual({ url: 'https://github.com/o/r/pull/9', number: 9 })
    }
  })

  it('a instrução pede o bloco com a cerca própria e no máximo um', () => {
    expect(withLessonInstruction('Implemente.')).toBe(`Implemente.\n\n${LESSON_INSTRUCTION}`)
    expect(LESSON_INSTRUCTION).toContain('```opex-lesson')
    expect(LESSON_INSTRUCTION).toContain('No máximo um bloco')
  })
})
