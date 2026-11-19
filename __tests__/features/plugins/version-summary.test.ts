import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Descritivo da mudança de uma versão (OPE-172): o agente da mesa devolve `{ changeSummary }` no bloco
 * final; sem ele, "Gerar descritivo" chama a IA com a diferença para a versão ANTERIOR (número menor),
 * grava com origem `ai`, audita e publica. Feature desligada recusa com 409 sem chamar a IA.
 */

const mocks = vi.hoisted(() => ({
  settings: { enabled: true, provider: 'gemini', model: 'gemini-2.5-flash', agent: null, variant: null, temperature: null, maxOutputTokens: null, instructions: 'Descreva' } as Record<string, unknown>,
  available: true,
  stream: vi.fn(),
  versions: [] as Array<Record<string, unknown>>,
  updates: [] as unknown[],
  audit: vi.fn(async () => undefined),
  publish: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: mocks.audit }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/ai/server/settings', () => ({
  loadPluginVersionSummarySettings: async () => ({ settings: mocks.settings, isDefault: false, updatedAt: null }),
  availabilityOfPluginVersionSummary: async () => (mocks.available ? { available: true, reason: null } : { available: false, reason: 'Ative "Descritivo de versão de plugin"' }),
}))
vi.mock('@/lib/ai/stream', () => ({ streamAi: mocks.stream }))
vi.mock('@/features/plugins/server/service', () => ({ publishPluginUpdated: mocks.publish }))
vi.mock('@/lib/db/models/Plugin', () => {
  const lean = (value: unknown) => ({ lean: async () => value })
  return {
    Plugin: { findOne: () => lean({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null }) },
    PluginVersion: {
      findOne: (query: { _id?: string; number?: { $lt: number } }) => {
        if (query._id) return lean(mocks.versions.find((v) => v._id === query._id) ?? null)
        const lower = mocks.versions.filter((v) => (v.number as number) < query.number!.$lt).sort((a, b) => (b.number as number) - (a.number as number))
        return { sort: () => lean(lower[0] ?? null) }
      },
      updateOne: async (...args: unknown[]) => {
        mocks.updates.push(args)
      },
    },
  }
})

import { buildChangeSummaryPrompt, cleanChangeSummary, generateVersionChangeSummary } from '@/features/plugins/server/version-summary'
import { pluginChangeSummaryFrom } from '@/features/agentic/prompts'

async function* events(list: unknown[]) {
  for (const event of list) yield event
}

beforeEach(() => {
  mocks.available = true
  mocks.updates.length = 0
  mocks.audit.mockClear()
  mocks.publish.mockClear()
  mocks.stream.mockReset().mockImplementation(() => events([{ type: 'delta', text: '"Agora o cronômetro ' }, { type: 'delta', text: 'pausa."' }, { type: 'done' }]))
  mocks.versions = [
    { _id: 'v1', pluginId: 'relogio', number: 1, files: [{ path: 'client/index.tsx', content: 'antes' }], changeSummary: null },
    { _id: 'v2', pluginId: 'relogio', number: 2, files: [{ path: 'client/index.tsx', content: 'depois' }], changeSummary: null },
  ]
})

describe('descritivo do agente', () => {
  it('lê o changeSummary do bloco final; sem bloco, null', () => {
    expect(pluginChangeSummaryFrom('Feito.\n```json\n{"changeSummary": "O widget mostra os segundos."}\n```')).toBe('O widget mostra os segundos.')
    expect(pluginChangeSummaryFrom('Feito, sem bloco.')).toBeNull()
    expect(pluginChangeSummaryFrom('```json\n{"changeSummary": "  "}\n```')).toBeNull()
  })
})

describe('Gerar descritivo', () => {
  it('usa a diferença para a versão anterior, grava com origem ai, audita e publica', async () => {
    const result = await generateVersionChangeSummary('relogio', 'v2', 'local')
    expect(result).toEqual({ changeSummary: 'Agora o cronômetro pausa.' })
    const request = mocks.stream.mock.calls[0]![0] as { prompt: string; consumption: { origin: string } }
    expect(request.prompt).toContain('Mudança da versão v1 para a v2')
    expect(request.prompt).toContain('-antes')
    expect(request.prompt).toContain('+depois')
    expect(request.consumption.origin).toBe('plugin-version-summary')
    expect(mocks.updates[0]).toEqual([{ _id: 'v2' }, { $set: { changeSummary: 'Agora o cronômetro pausa.', changeSummarySource: 'ai' } }])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'ATUALIZAR', depois: expect.objectContaining({ versao: 2, origem: 'ai' }) }))
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ pluginId: 'relogio' }), { version: 2, channel: null })
  })

  it('a primeira versão descreve o plugin (sem anterior)', async () => {
    await generateVersionChangeSummary('relogio', 'v1', 'local')
    expect((mocks.stream.mock.calls[0]![0] as { prompt: string }).prompt).toContain('a primeira')
  })

  it('feature indisponível recusa com 409 sem chamar a IA nem gravar', async () => {
    mocks.available = false
    await expect(generateVersionChangeSummary('relogio', 'v2', 'local')).rejects.toMatchObject({ status: 409, code: 'AI_FEATURE_UNAVAILABLE' })
    expect(mocks.stream).not.toHaveBeenCalled()
    expect(mocks.updates).toHaveLength(0)
  })

  it('erro da IA não grava e devolve 502', async () => {
    mocks.stream.mockImplementation(() => events([{ type: 'error', message: 'cota' }]))
    await expect(generateVersionChangeSummary('relogio', 'v2', 'local')).rejects.toMatchObject({ status: 502, code: 'PLUGIN_SUMMARY_FAILED' })
    expect(mocks.updates).toHaveLength(0)
  })

  it('limpa cercas e aspas e corta a diferença grande', () => {
    expect(cleanChangeSummary('```\n"Texto."\n```')).toBe('Texto.')
    expect(cleanChangeSummary('   ')).toBeNull()
    expect(buildChangeSummaryPrompt({ pluginName: 'R', fromNumber: 1, toNumber: 2, patches: ['x'.repeat(70_000)] })).toContain('[diferença cortada]')
  })
})
