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
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: { updateOne: async (filter: unknown, update: unknown) => void holder.updates.push({ filter, update }) } }))
vi.mock('@/lib/db/models/Orcamento', () => ({ OrcamentoClient: {} }))
vi.mock('@/lib/db/models/Plugin', () => ({ Plugin: {}, PluginVersion: { findById: () => ({ lean: async () => ({ manifest: { pages: [], slots: [] } }) }) } }))
vi.mock('@/features/opencode-resources/server/host', () => ({ openHost: async () => ({ run: async (command: string) => (holder.commands.push(command), { exitCode: 0, output: '' }) }) }))
vi.mock('@/features/plugins/server/service', () => ({
  publishPreviewVersion: holder.publish,
  consolidateVersion: holder.consolidate,
  discardPreview: holder.discard,
  findPlugin: holder.findPlugin,
  createDraftVersion: vi.fn(),
  createPluginRecord: vi.fn(),
  pluginVersionFiles: vi.fn(),
}))

import { DomainError } from '@/lib/api/route'
import { consolidatePluginWorkbench, publishPluginPreview } from '@/features/agentic/server/plugin-workflow'

const doc = () =>
  ({ _id: 'wb1', plugin: { pluginId: 'relogio', scope: 'owner', clientId: null, baseVersionId: 'v1', draftVersionId: 'v3', workDir: '/w/ope-2', approved: true, compileAttempts: 0, testAttempts: 1 } }) as never
const outdated = () => new DomainError(409, 'A versão v3 partiu da estável v1, mas a estável agora é v2. Refaça a alteração a partir da estável atual', 'PLUGIN_BASE_OUTDATED')

beforeEach(() => {
  holder.updates = []
  holder.commands = []
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
