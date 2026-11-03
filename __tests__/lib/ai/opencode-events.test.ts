import { describe, expect, it } from 'vitest'
import { describeToolInput, isProviderLimitError, normalizeOpencodeEvent, retryNotice, shouldAbandonRetry, toOpencodeModelRef, toolContentText } from '@/lib/ai/opencode-events'

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

describe('nova tentativa do OpenCode e limite do provedor', () => {
  const policy = { maxWaitMs: 60_000, maxAttempts: 3 }
  const now = 1_000_000
  const limit = { type: 'provider.rate-limit', message: 'This request would exceed your account rate limit', status: 429 }
  const retry = (error: { type: string | null; message: string; status: number | null }, attempt: number, waitMs: number) => ({ attempt, at: now + waitMs, error })

  it('session.retry.scheduled vira um evento de nova tentativa com o erro estruturado (e o mesmo aviso de antes)', () => {
    const event = normalizeOpencodeEvent(ev('session.retry.scheduled', { attempt: 2, at: 5000, error: limit }), 's1')
    expect(event).toEqual({ kind: 'retry', attempt: 2, at: 5000, error: limit })
    expect(event?.kind === 'retry' && retryNotice(event)).toBe('Nova tentativa (2) após falha do provedor: This request would exceed your account rate limit')
    expect(normalizeOpencodeEvent(ev('session.retry.scheduled', { attempt: 1, at: 1 }), 's1')).toEqual({ kind: 'retry', attempt: 1, at: 1, error: { type: null, message: 'erro desconhecido', status: null } })
  })

  it('isProviderLimitError: limite e cota contam; sobrecarga, erro interno e transporte não', () => {
    expect(isProviderLimitError(limit)).toBe(true)
    expect(isProviderLimitError({ type: 'provider.quota', message: 'x', status: null })).toBe(true)
    expect(isProviderLimitError({ type: null, message: 'erro', status: 429 })).toBe(true)
    expect(isProviderLimitError({ type: null, message: 'Usage limit reached for claude', status: null })).toBe(true)
    expect(isProviderLimitError({ type: 'provider.internal', message: 'overloaded_error', status: 529 })).toBe(false)
    expect(isProviderLimitError({ type: 'provider.transport', message: 'socket hang up', status: null })).toBe(false)
    expect(isProviderLimitError({ type: 'provider.timeout', message: 'rate of tokens too slow', status: null })).toBe(false)
  })

  it('shouldAbandonRetry: desiste com espera longa ou na 3ª tentativa por limite; limite passageiro continua', () => {
    expect(shouldAbandonRetry(retry(limit, 1, 2 * 60 * 60_000), now, policy)).toBe(true)
    expect(shouldAbandonRetry(retry(limit, 1, 5_000), now, policy)).toBe(false)
    expect(shouldAbandonRetry(retry(limit, 3, 5_000), now, policy)).toBe(true)
  })

  it('shouldAbandonRetry: erro que não é de cota nunca desiste, nem com espera longa', () => {
    expect(shouldAbandonRetry(retry({ type: 'provider.internal', message: 'overloaded', status: 529 }, 5, 2 * 60 * 60_000), now, policy)).toBe(false)
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
