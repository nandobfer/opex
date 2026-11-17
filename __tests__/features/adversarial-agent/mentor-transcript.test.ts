import { describe, expect, it } from 'vitest'
import { buildTranscript, clipMiddle, hasConversation, ownerMessages, type TranscriptInput } from '@/features/adversarial-agent/mentor/transcript'

/** OPE-165: transcrição da mesa para o Agente Mentor (montagem e compactação determinística). */

const header: TranscriptInput['header'] = {
  task: { code: 'OPE-9', title: 'Tela de modelos' },
  project: 'Opex',
  plans: [
    { version: 1, text: '# Plano v1', feedback: null },
    { version: 2, text: '# Plano FINAL', feedback: 'Use o componente compartilhado' },
  ],
  pr: { number: 42, url: 'https://github.com/x/y/pull/42', state: 'merged', mergedAt: '2026-11-13T15:00:00.000Z' },
  manualCompletion: null,
  reviews: [{ round: 1, decision: 'blocked', summary: 'Falta teste', findings: [{ id: 'F1', severity: 'high', title: 'Sem teste de tela', blocking: true, status: 'resolved' }], disputes: [{ id: 'F2', reason: 'É intencional' }] }],
  completedAt: '2026-11-13T15:00:00.000Z',
}

const bigOutput = 'x'.repeat(20_000)
const input = (extra: Record<string, unknown>[] = []): TranscriptInput => ({
  header,
  conversations: [
    {
      title: 'Conversa principal',
      events: [
        { type: 'turn', stage: 'implementing', title: 'Implementação', agent: 'build', model: 'claude' },
        { type: 'user', text: 'Não copie o markup, extraia o componente' },
        { type: 'text', text: 'Vou ' },
        { type: 'text', text: 'extrair.' },
        { type: 'reasoning' },
        { type: 'tool', id: 't1', name: 'bash', state: 'running', input: 'pnpm test' },
        { type: 'tool', id: 't1', name: 'bash', state: 'done', output: bigOutput },
        { type: 'tool', id: 't2', name: 'read', state: 'done', input: 'a.ts', output: bigOutput },
        { type: 'notice', level: 'info', message: 'Memória lida' },
        { type: 'notice', level: 'info', message: 'Memória lida' },
        { type: 'notice', level: 'error', message: 'Build falhou' },
        { type: 'turn-end', outcome: 'succeeded', message: null, durationMs: 1, costUsd: 0 },
        ...extra,
      ],
    },
    { title: 'Fork #1 (integrado: Contexto da conversa principal)', note: 'Resumo do fork', events: [{ type: 'user', text: 'Pergunta no fork' }] },
  ],
})

describe('transcrição da mesa', () => {
  it('abaixo do limiar vai inteira, com os dados da mesa, a conversa e os forks integrados', () => {
    const result = buildTranscript(input(), 10_000_000)
    expect(result.compacted).toBe(false)
    expect(result.level).toBe(0)
    expect(result.sentChars).toBe(result.originalChars)
    expect(result.text).toContain('# Plano FINAL')
    expect(result.text).toContain('Pedido do dono que originou a versão 2: Use o componente compartilhado')
    expect(result.text).toContain('Pull Request #42 (merged')
    expect(result.text).toContain('F1 [high, bloqueia, resolved] Sem teste de tela')
    expect(result.text).toContain('Contestação do desenvolvedor (F2): É intencional')
    expect(result.text).toContain('[Dono] Não copie o markup, extraia o componente')
    expect(result.text).toContain('[Agente] Vou extrair.')
    expect(result.text).toContain('entrada: pnpm test')
    expect(result.text).toContain('Fork #1')
    expect(result.text).toContain('Resumo da integração: Resumo do fork')
    expect(result.eventCount).toBe(13)
  })

  it('a mesma chamada de ferramenta fica com o último estado e a entrada do primeiro', () => {
    const text = buildTranscript(input(), 10_000_000).text
    expect(text.match(/\[Ferramenta bash/g)).toHaveLength(1)
    expect(text).toContain('[Ferramenta bash · done]')
  })

  it('acima do limiar compacta de forma determinística e preserva o dono, o plano, os achados e os erros', () => {
    const first = buildTranscript(input(), 5_000)
    const second = buildTranscript(input(), 5_000)
    expect(first.text).toBe(second.text)
    expect(first.compacted).toBe(true)
    expect(first.sentChars).toBeLessThan(first.originalChars)
    expect(first.sentChars).toBeLessThanOrEqual(5_000)
    expect(first.text).toContain('[Dono] Não copie o markup, extraia o componente')
    expect(first.text).toContain('# Plano FINAL')
    expect(first.text).toContain('Sem teste de tela')
    expect(first.text).toContain('[Aviso error] Build falhou')
    expect(first.text).toContain('(×2)')
  })

  it('leituras bem-sucedidas viram contador quando ainda não cabe', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ type: 'tool', id: `r${index}`, name: 'read', state: 'done', input: `arquivo-${index}.ts`, output: bigOutput }))
    const result = buildTranscript(input(many), 6_000)
    expect(result.level).toBeGreaterThanOrEqual(4)
    expect(result.text).toContain('Leituras bem-sucedidas omitidas: read ×31')
  })

  it('marca quando nem o último nível cabe no limiar', () => {
    const result = buildTranscript(input(), 100)
    expect(result.aboveThreshold).toBe(true)
    expect(result.level).toBe(5)
  })

  it('transcrição vazia (sem dono nem texto do agente) e mensagens do dono', () => {
    expect(hasConversation(input())).toBe(true)
    expect(hasConversation({ header, conversations: [{ title: 'Conversa principal', events: [{ type: 'notice', level: 'info', message: 'x' }] }] })).toBe(false)
    expect(ownerMessages(input())).toEqual(['Não copie o markup, extraia o componente', 'Pergunta no fork'])
  })

  it('clipMiddle corta o meio e mantém começo e fim', () => {
    const text = `INICIO${'m'.repeat(5000)}FIM`
    const clipped = clipMiddle(text, 100, 50)
    expect(clipped.startsWith('INICIO')).toBe(true)
    expect(clipped.endsWith('FIM')).toBe(true)
    expect(clipped).toContain('caracteres omitidos')
    expect(clipMiddle('curto', 100, 50)).toBe('curto')
  })
})
