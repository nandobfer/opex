import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Logs de debug dos plugins (OPE-172): cada linha vai para `plugin_logs`, com chaves sensíveis
 * mascaradas, e sai agrupada pelo Pusher em `private-plugin-{id}` (`plugin-debug`). A leitura devolve
 * do mais antigo ao mais novo e respeita o `after`. Erro de interface fica limitado a 4 KB.
 */

const mocks = vi.hoisted(() => ({ docs: [] as Array<Record<string, unknown>>, trigger: vi.fn(async () => undefined) }))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/integrations/debug', () => ({ chunkForPusher: (lines: unknown[]) => [lines] }))
vi.mock('@/lib/pusher/server', () => ({ getRawPusherServer: async () => ({ trigger: mocks.trigger }) }))
vi.mock('@/lib/db/models/PluginLog', () => ({
  PluginLog: {
    create: async (doc: Record<string, unknown>) => {
      mocks.docs.push(doc)
      return doc
    },
    find: (query: { pluginId: string; ts?: { $gt: Date } }) => {
      const rows = mocks.docs.filter((doc) => doc.pluginId === query.pluginId && (!query.ts || (doc.ts as Date) > query.ts.$gt)).sort((a, b) => (b.ts as Date).getTime() - (a.ts as Date).getTime())
      const chain = { sort: () => chain, limit: (n: number) => ({ lean: async () => rows.slice(0, n) }) }
      return chain
    },
  },
}))

import { drainPluginLogs, listPluginLogs, pluginLog, recordPluginClientError } from '@/features/plugins/server/logs'

beforeEach(() => {
  mocks.docs.length = 0
  mocks.trigger.mockClear()
  vi.useRealTimers()
})

describe('logs de debug dos plugins', () => {
  it('grava com o canal, mascara segredos e publica no canal do plugin', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    pluginLog('relogio', 'info', 'Chamou a API', { token: 'segredo-123', ok: true }, 'preview')
    await drainPluginLogs()
    expect(mocks.docs[0]).toMatchObject({ pluginId: 'relogio', channel: 'preview', level: 'info', message: 'Chamou a API' })
    expect(JSON.stringify(mocks.docs[0]!.data)).not.toContain('segredo-123')
    await vi.advanceTimersByTimeAsync(600)
    expect(mocks.trigger).toHaveBeenCalledWith('private-plugin-relogio', 'plugin-debug', { entries: [expect.objectContaining({ message: 'Chamou a API', channel: 'preview' })] })
  })

  it('a leitura vem do mais antigo ao mais novo e respeita o after', async () => {
    mocks.docs.push({ pluginId: 'relogio', level: 'info', message: 'a', ts: new Date('2026-11-19T10:00:00Z'), channel: 'stable' })
    mocks.docs.push({ pluginId: 'relogio', level: 'error', message: 'b', ts: new Date('2026-11-19T11:00:00Z'), channel: null })
    mocks.docs.push({ pluginId: 'outro', level: 'info', message: 'x', ts: new Date('2026-11-19T12:00:00Z'), channel: null })
    expect((await listPluginLogs('relogio')).map((line) => line.message)).toEqual(['a', 'b'])
    expect((await listPluginLogs('relogio', { after: '2026-11-19T10:30:00.000Z' })).map((line) => line.message)).toEqual(['b'])
  })

  it('erro de interface vira linha de erro com a pilha, limitado a 4 KB', async () => {
    recordPluginClientError('relogio', { message: 'x'.repeat(5000), stack: 'at Widget', channel: 'stable', where: 'slot Widget' })
    await drainPluginLogs()
    const doc = mocks.docs[0]!
    expect(doc.level).toBe('error')
    expect(String(doc.message).startsWith('[interface] ')).toBe(true)
    expect(String(doc.message).length).toBeLessThan(4200)
    expect(doc.data).toMatchObject({ where: 'slot Widget', stack: 'at Widget' })
  })
})
