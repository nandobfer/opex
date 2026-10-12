import { describe, expect, it } from 'vitest'
import { describeToolInput, normalizeOpencodeEvent, toOpencodeModelRef, toolContentText } from '@/lib/ai/opencode-events'

const ev = (type: string, data: Record<string, unknown>) => ({ type, data: { sessionID: 's1', ...data } })

describe('normalizeOpencodeEvent', () => {
  it('ignora eventos de outra sessão', () => {
    expect(normalizeOpencodeEvent({ type: 'session.text.delta', data: { sessionID: 'outra', delta: 'x' } }, 's1')).toBeNull()
  })

  it('converte texto, ferramentas, custo e fim da execução', () => {
    expect(normalizeOpencodeEvent(ev('session.text.delta', { delta: 'Olá' }), 's1')).toEqual({ kind: 'text', delta: 'Olá' })
    expect(normalizeOpencodeEvent(ev('session.tool.input.started', { id: 't1', name: 'bash' }), 's1')).toEqual({ kind: 'tool-start', id: 't1', name: 'bash' })
    expect(normalizeOpencodeEvent(ev('session.tool.success', { id: 't1', content: [{ type: 'text', text: 'ok' }] }), 's1')).toEqual({ kind: 'tool-done', id: 't1', output: 'ok' })
    expect(normalizeOpencodeEvent(ev('session.tool.failed', { id: 't1', error: { message: 'boom' } }), 's1')).toMatchObject({ kind: 'tool-error', message: 'boom' })
    expect(normalizeOpencodeEvent(ev('session.step.ended', { assistantMessageID: 'm1', cost: 0.5, tokens: { input: 10, output: 5, reasoning: 2 } }), 's1')).toEqual({ kind: 'step', stepId: 'm1', costUsd: 0.5, tokens: { input: 10, output: 5, reasoning: 2 } })
    // Sem `assistantMessageID`, cai no id do evento (para a deduplicação do consumo).
    expect(normalizeOpencodeEvent({ type: 'session.step.ended', id: 'e9', data: { sessionID: 's1', cost: 0, tokens: {} } }, 's1')).toMatchObject({ kind: 'step', stepId: 'e9' })
    expect(normalizeOpencodeEvent(ev('session.execution.succeeded', {}), 's1')).toEqual({ kind: 'end', outcome: 'succeeded' })
    expect(normalizeOpencodeEvent(ev('session.execution.failed', { error: { message: 'cota' } }), 's1')).toEqual({ kind: 'end', outcome: 'failed', message: 'cota' })
  })

  it('lê a sessão do formulário em data.form e normaliza os campos', () => {
    const raw = { type: 'form.created', data: { form: { id: 'f1', sessionID: 's1', title: 'Qual banco?', fields: [{ key: 'db', type: 'string', options: [{ value: 'pg', label: 'Postgres' }], required: true }, { key: 'x', type: 'string', hidden: true }] } } }
    const event = normalizeOpencodeEvent(raw, 's1')
    expect(event).toMatchObject({ kind: 'form', form: { id: 'f1', title: 'Qual banco?' } })
    expect(event?.kind === 'form' && event.form.fields.map((field) => field.key)).toEqual(['db'])
  })

  it('pedido e resposta de permissão', () => {
    expect(normalizeOpencodeEvent(ev('permission.asked', { id: 'p1', action: 'bash', resources: ['rm -rf x'] }), 's1')).toEqual({ kind: 'permission', permission: { id: 'p1', action: 'bash', resources: ['rm -rf x'], message: null } })
    expect(normalizeOpencodeEvent(ev('permission.replied', { requestID: 'p1' }), 's1')).toEqual({ kind: 'permission-replied', id: 'p1' })
  })
})

describe('auxiliares', () => {
  it('toOpencodeModelRef separa provedor e modelo (modelo com barras)', () => {
    expect(toOpencodeModelRef('openrouter/anthropic/claude', 'high')).toEqual({ providerID: 'openrouter', id: 'anthropic/claude', variant: 'high' })
    expect(() => toOpencodeModelRef('sem-provedor')).toThrow()
  })

  it('describeToolInput usa o comando ou o arquivo', () => {
    expect(describeToolInput({ command: 'pnpm test' })).toBe('pnpm test')
    expect(describeToolInput({ filePath: '/a.ts' })).toBe('/a.ts')
    expect(describeToolInput({})).toBeNull()
  })

  it('toolContentText junta as partes de texto', () => {
    expect(toolContentText([{ type: 'text', text: 'a' }, { type: 'file', name: 'b.png' }])).toBe('a\n[arquivo b.png]')
  })
})
