import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Backup da migração B (OPE-206): o resumo das memórias volta numa linha só pela saída do host. Regressão: com um
 * acervo grande (o do dono tinha 2.987 memórias, ~611 KB), a saída passa de uma página do OpenCode e precisa ser lida
 * inteira pelo executor real do host.
 */

type Page = { output: string; cursor: number; size?: number; truncated?: boolean }
type OutputInput = { id: string; cursor?: number; limit?: number }

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  output: vi.fn<(input?: OutputInput) => Promise<{ data: Page }>>(async () => ({ data: { output: '', cursor: 0 } })),
  remove: vi.fn(async () => undefined),
}))

vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => ({ shell: { create: mocks.create, get: mocks.get, output: mocks.output, remove: mocks.remove } }),
}))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({ request: vi.fn(), response: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: vi.fn(async () => ({})) }))

import { DIGEST_MARKER } from '@/features/engramind/channel-migration/plan'
import { EXPORT_OUTPUT_MAX, runHostExport } from '@/features/engramind/server/channel-migration/host-export'

function paged(full: string) {
  return async (input?: OutputInput): Promise<{ data: Page }> => {
    const start = input?.cursor ?? 0
    const end = Math.min(full.length, start + (input?.limit ?? 20_000))
    return { data: { output: full.slice(start, end), cursor: end, size: full.length, truncated: end < full.length } }
  }
}

function digestLine(count: number): string {
  const memories = Array.from({ length: count }, (_, index) => ({
    id: `mem_${String(index).padStart(6, '0')}`,
    channel: index % 2 ? 'agentes/opex/global' : 'opex',
    status: index % 5 ? 'active' : 'archived',
    pinned: false,
    key: null,
    textHash: 'a'.repeat(64),
  }))
  const byStatus: Record<string, number> = {}
  const byChannel: Record<string, number> = {}
  for (const memory of memories) {
    byStatus[memory.status] = (byStatus[memory.status] ?? 0) + 1
    byChannel[memory.channel] = (byChannel[memory.channel] ?? 0) + 1
  }
  return `${DIGEST_MARKER}${JSON.stringify({ file: '/tmp/opex/engramind-migracao/m1/antes/x.json', source: null, exportedAt: null, totals: { memories: count, byStatus, byChannel }, memories })}`
}

const SCRIPT = '/home/u/export-engramind-memories.mjs'
const DIR = '/tmp/opex/engramind-migracao/m1/antes'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ data: { id: 'sh_1', status: 'exited', exit: 0 } })
  mocks.get.mockResolvedValue({ data: { id: 'sh_1', status: 'exited', exit: 0 } })
})

describe('runHostExport', () => {
  it('regressão: resumo maior que uma página do OpenCode volta completo', async () => {
    const line = digestLine(800)
    expect(line.length).toBeGreaterThan(128_000)
    mocks.output.mockImplementation(paged(`exportado\n${line}\n`))
    const digest = await runHostExport(DIR, { scriptPath: SCRIPT })
    expect(digest.memories).toHaveLength(800)
    expect(digest.totals.memories).toBe(800)
    expect(digest.memories.at(-1)?.id).toBe('mem_000799')
    expect(mocks.output.mock.calls.length).toBeGreaterThan(2)
  })

  it('saída acima do teto: ENGRAMIND_EXPORT_TOO_LARGE', async () => {
    const pageOver = EXPORT_OUTPUT_MAX + 1
    mocks.output.mockImplementation(async (input?: OutputInput) => {
      const start = input?.cursor ?? 0
      const end = start + (input?.limit ?? 20_000)
      return { data: { output: 'z'.repeat(end - start), cursor: end, size: pageOver * 2, truncated: true } }
    })
    await expect(runHostExport(DIR, { scriptPath: SCRIPT })).rejects.toMatchObject({ code: 'ENGRAMIND_EXPORT_TOO_LARGE' })
  })

  it('leitura que falha no meio: ENGRAMIND_EXPORT_READ_FAILED (não “resumo inválido”)', async () => {
    const page = paged(`${digestLine(800)}\n`)
    mocks.output.mockImplementation(async (input) => {
      if ((input?.cursor ?? 0) > 0) throw new Error('timeout')
      return page(input)
    })
    await expect(runHostExport(DIR, { scriptPath: SCRIPT })).rejects.toMatchObject({ code: 'ENGRAMIND_EXPORT_READ_FAILED' })
  })

  it('sem o marcador do resumo: ENGRAMIND_EXPORT_INVALID', async () => {
    mocks.output.mockImplementation(paged('nada aqui\n'))
    await expect(runHostExport(DIR, { scriptPath: SCRIPT })).rejects.toMatchObject({ code: 'ENGRAMIND_EXPORT_INVALID' })
  })
})
