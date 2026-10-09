import { describe, expect, it } from 'vitest'
import { formatLogLine, formatLogTimestamp, MASK, maskSensitive } from '@/lib/integrations/log-format'
import { chunkForPusher } from '@/lib/integrations/debug'

describe('maskSensitive (issue #604)', () => {
  it('mascara chaves sensíveis em qualquer profundidade', () => {
    const masked = maskSensitive({
      url: 'https://x',
      headers: { Authorization: 'Bearer abc', 'X-SAP-Authorization': 'Basic zzz', accept: 'json' },
      body: { password: 'p', login: 'user' },
    }) as Record<string, Record<string, string>>

    expect(masked.headers.Authorization).toBe(MASK)
    expect(masked.headers['X-SAP-Authorization']).toBe(MASK)
    expect(masked.headers.accept).toBe('json')
    expect(masked.body.password).toBe(MASK)
    expect(masked.body.login).toBe('user')
  })

  it('substitui segredos conhecidos embutidos em strings', () => {
    expect(maskSensitive('POST https://x?key=segredo-123 falhou', ['segredo-123'])).toBe(`POST https://x?key=${MASK} falhou`)
  })
})

describe('formatLogLine', () => {
  it('inclui data/hora de Brasília, tag e nível; sem cor quando pedido', () => {
    const line = formatLogLine(
      { integrationId: 'crons', level: 'error', message: 'falhou', ts: '2026-09-22T15:00:00.000Z', data: { a: 1 } },
      { color: false, tag: 'SMTP' },
    )
    expect(line).toBe('[2026-09-22 12:00:00.000] [SMTP] ERROR falhou {"a":1}')
  })

  it('usa códigos ANSI por padrão (erro em vermelho)', () => {
    const line = formatLogLine({ integrationId: 'crons', level: 'error', message: 'x', ts: '2026-09-22T15:00:00.000Z' })
    expect(line).toContain('\x1b[31m')
  })

  it('formatLogTimestamp devolve o texto original se a data for inválida', () => {
    expect(formatLogTimestamp('invalida')).toBe('invalida')
  })
})

describe('chunkForPusher', () => {
  const line = (message: string) => ({ integrationId: 'crons', level: 'info' as const, message, ts: '2026-09-22T15:00:00.000Z' })

  it('divide lotes para respeitar o limite de tamanho do Pusher', () => {
    const lines = Array.from({ length: 50 }, (_, i) => line(`linha ${i} ${'x'.repeat(300)}`))
    const chunks = chunkForPusher(lines, 4000)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.flat()).toHaveLength(50)
    for (const chunk of chunks) expect(Buffer.byteLength(JSON.stringify(chunk))).toBeLessThanOrEqual(4000)
  })

  it('substitui os dados de uma linha grande demais em vez de descartá-la', () => {
    const [chunk] = chunkForPusher([{ ...line('grande'), data: 'y'.repeat(20_000) }], 4000)
    expect(chunk[0].message).toBe('grande')
    expect(String(chunk[0].data)).toMatch(/Atualizar/)
  })
})
