import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Mesa Plugin com a estável alterada por outra mesa (OPE-172): a prévia ou a consolidação recusadas
 * com `PLUGIN_BASE_OUTDATED` fazem a mesa recomeçar da estável atual (prévia dela descartada, pasta
 * removida, aprovação desfeita) e o erro orienta a voltar ao planejamento.
 */

const holder = vi.hoisted(() => ({
  updates: [] as unknown[],
  commands: [] as string[],
  publish: vi.fn(),
  consolidate: vi.fn(),
  discard: vi.fn(async () => undefined),
  findPlugin: vi.fn(),
  written: new Map<string, string>(),
  versionFiles: vi.fn(async () => [{ path: 'plugin.json', content: '{"v":4}' }]),
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: { updateOne: async (filter: unknown, update: unknown) => void holder.updates.push({ filter, update }) } }))
vi.mock('@/lib/db/models/Orcamento', () => ({ OrcamentoClient: {} }))
vi.mock('@/lib/db/models/Plugin', () => ({ Plugin: {}, PluginVersion: { findById: () => ({ lean: async () => ({ manifest: { pages: [], slots: [] } }) }) } }))
vi.mock('@/features/opencode-resources/server/host', () => ({
  openHost: async () => ({
    // A pasta "existe" (sobra de outra rodada) até um rm -rf: só então o `test -d` falha.
    run: async (command: string) => (holder.commands.push(command), { exitCode: command.startsWith('test -d ') && holder.commands.some((c) => c.startsWith('rm -rf ')) ? 1 : 0, output: '' }),
    writeText: async (file: string, content: string) => void holder.written.set(file, content),
  }),
}))
vi.mock('@/features/plugins/server/service', () => ({
  publishPreviewVersion: holder.publish,
  consolidateVersion: holder.consolidate,
  discardPreview: holder.discard,
  findPlugin: holder.findPlugin,
  createDraftVersion: vi.fn(),
  createPluginRecord: vi.fn(),
  pluginVersionFiles: holder.versionFiles,
}))

import { DomainError } from '@/lib/api/route'
import { consolidatePluginWorkbench, preparePluginImplementation, publishPluginPreview, releasePluginPreview } from '@/features/agentic/server/plugin-workflow'

const doc = () =>
  ({ _id: 'wb1', plugin: { pluginId: 'relogio', scope: 'owner', clientId: null, baseVersionId: 'v1', draftVersionId: 'v3', workDir: '/w/ope-2', approved: true, compileAttempts: 0, testAttempts: 1 } }) as never
const outdated = () => new DomainError(409, 'A versão v3 partiu da estável v1, mas a estável agora é v2. Refaça a alteração a partir da estável atual', 'PLUGIN_BASE_OUTDATED')

beforeEach(() => {
  holder.updates = []
  holder.commands = []
  holder.written = new Map()
  holder.publish.mockReset()
  holder.consolidate.mockReset()
  holder.discard.mockClear()
  holder.findPlugin.mockReset().mockResolvedValue({ previewWorkbenchId: 'wb1' })
})

describe('base desatualizada na mesa Plugin', () => {
  it('na consolidação: descarta a prévia da mesa, remove a pasta e zera base, versão e aprovação', async () => {
    holder.consolidate.mockRejectedValue(outdated())
    await expect(consolidatePluginWorkbench(doc())).rejects.toMatchObject({ status: 409, message: expect.stringContaining('use "Voltar ao planejamento"') })
    expect(holder.discard).toHaveBeenCalledWith('relogio', 'local')
    expect(holder.commands).toEqual(["rm -rf '/w/ope-2'"])
    expect(holder.updates).toEqual([{ filter: { _id: 'wb1' }, update: { $set: expect.objectContaining({ 'plugin.baseVersionId': null, 'plugin.draftVersionId': null, 'plugin.workDir': null, 'plugin.approved': false }) } }])
  })

  it('na prévia: o mesmo recomeço; outros erros (ex.: prévia de outra mesa) não mexem na mesa', async () => {
    holder.publish.mockRejectedValueOnce(outdated())
    await expect(publishPluginPreview(doc())).rejects.toMatchObject({ code: 'PLUGIN_BASE_OUTDATED' })
    expect(holder.updates).toHaveLength(1)

    holder.updates = []
    holder.commands = []
    holder.publish.mockRejectedValueOnce(new DomainError(409, 'O plugin já tem uma prévia da tarefa OPE-1 (v2). Aguarde ela ser consolidada ou descartada', 'PLUGIN_PREVIEW_BUSY'))
    await expect(publishPluginPreview(doc())).rejects.toMatchObject({ code: 'PLUGIN_PREVIEW_BUSY' })
    expect(holder.updates).toEqual([])
    expect(holder.commands).toEqual([])
  })
})

describe('pasta de trabalho de uma rodada nova (OPE-172)', () => {
  const config = { worktreesRoot: '/w' } as never
  const fresh = (workDir: string | null) =>
    ({ _id: 'wb1', taskCode: 'OPE-2', taskTitle: 'Relógio', plugin: { pluginId: 'relogio', scope: 'owner', clientId: null, baseVersionId: null, draftVersionId: null, workDir, approved: false, compileAttempts: 0, testAttempts: 0 } }) as never

  it('com workDir zerado, a pasta que sobrou é apagada e as fontes da estável atual são reexportadas', async () => {
    holder.findPlugin.mockResolvedValue({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null, stableVersionId: 'v4' })
    const next = await preparePluginImplementation(fresh(null), config)
    const rm = holder.commands.findIndex((command) => command.startsWith('rm -rf '))
    const check = holder.commands.findIndex((command) => command.startsWith('test -d '))
    expect(rm).toBeGreaterThanOrEqual(0)
    expect(rm).toBeLessThan(check)
    expect(holder.versionFiles).toHaveBeenCalledWith('relogio', 'v4')
    expect(holder.written.get(`${next.workDir}/plugin.json`)).toBe('{"v":4}')
    expect(next.baseVersionId).toBe('v4')
  })

  it('correção na mesma rodada (workDir gravado) mantém a pasta', async () => {
    holder.findPlugin.mockResolvedValue({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null, stableVersionId: 'v4' })
    await preparePluginImplementation(fresh('/w/plugins/ope-2'), config)
    expect(holder.commands.some((command) => command.startsWith('rm -rf '))).toBe(false)
    expect(holder.written.size).toBe(0)
  })

  it('concluir, excluir ou reabrir remove a pasta mesmo sem prévia da mesa (sem depender da limpeza da central)', async () => {
    holder.findPlugin.mockResolvedValue({ previewWorkbenchId: 'outra' })
    await releasePluginPreview(doc())
    expect(holder.commands).toEqual(["rm -rf '/w/ope-2'"])
    expect(holder.discard).not.toHaveBeenCalled()
  })
})
