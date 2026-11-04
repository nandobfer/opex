import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(async () => ({ favorites: [{ color: '#A78BFA', name: 'Violeta' }] })),
  add: vi.fn(async (input: { color: string; name: string | null }) => ({ favorites: [input] })),
  update: vi.fn(async (_current: string, input: { color: string; name: string | null }) => ({ favorites: [input] })),
  remove: vi.fn(async () => ({ favorites: [] })),
}))
vi.mock('@/features/color-palette/server/service', () => ({ getColorPalette: mocks.get, addFavoriteColor: mocks.add, updateFavoriteColor: mocks.update, removeFavoriteColor: mocks.remove }))

import { appearanceTools } from '@/features/opex-agent/server/tools/appearance'
import { OPEX_TOOLS, opexToolMetas } from '@/features/opex-agent/server/tools/registry'
import { OPEX_CLIENT_SERVER_TOOLS } from '@/features/opex-agent/server/client-tools/registry'
import { toolConfirms } from '@/features/opex-agent/tool-tree'
import { MCP_OWNER_SCOPE, mcpOwnerGroupScope, mcpOwnerToolDecision } from '@/features/integrations/api-tokens/scopes'

/** Ferramentas do Agente Opex para as cores favoritas (Configurações › Aparência, OPE-136). */

const context = { sessionId: 's1', actorId: 'local' }
const tool = (name: string) => appearanceTools.find((item) => item.name === name)!

beforeEach(() => vi.clearAllMocks())

describe('ferramentas de Aparência', () => {
  it('grupo appearance, registradas no agente do dono e fora do portal do cliente', () => {
    expect(appearanceTools.map((item) => item.name)).toEqual(['list_favorite_colors', 'add_favorite_color', 'update_favorite_color', 'remove_favorite_color'])
    for (const item of appearanceTools) {
      expect(item.group).toBe('appearance')
      expect(OPEX_TOOLS).toContain(item)
      expect(OPEX_CLIENT_SERVER_TOOLS.some((client) => client.name === item.name)).toBe(false)
    }
  })

  it('decisão do dono: nenhuma pede confirmação nem exige o escopo destrutivo no token (inclusive remover)', () => {
    const metas = opexToolMetas().filter((meta) => meta.group === 'appearance')
    expect(metas).toHaveLength(4)
    for (const meta of metas) {
      expect(meta.risk).not.toBe('destructive')
      expect(toolConfirms(meta)).toBe(false)
      expect(mcpOwnerToolDecision([MCP_OWNER_SCOPE, mcpOwnerGroupScope('appearance')], meta)).toEqual({ ok: true })
    }
  })

  it('chamam as funções de serviço da tela com o hex normalizado e o ator', async () => {
    await expect(tool('list_favorite_colors').execute({}, context)).resolves.toEqual({ favorites: [{ color: '#A78BFA', name: 'Violeta' }] })
    await tool('add_favorite_color').execute({ color: '#8000ff', name: ' Roxo ' }, context)
    expect(mocks.add).toHaveBeenCalledWith({ color: '#8000FF', name: 'Roxo' }, 'local')
    await tool('update_favorite_color').execute({ currentColor: '#a78bfa', color: '#7c3aed', name: null }, context)
    expect(mocks.update).toHaveBeenCalledWith('#A78BFA', { color: '#7C3AED', name: null }, 'local')
    await tool('remove_favorite_color').execute({ color: '#a78bfa' }, context)
    expect(mocks.remove).toHaveBeenCalledWith('#A78BFA', 'local')
  })

  it('hex inválido é recusado antes de chegar ao serviço', async () => {
    await expect(tool('add_favorite_color').execute({ color: 'roxo' }, context)).rejects.toThrow()
    await expect(tool('remove_favorite_color').execute({ color: '#12' }, context)).rejects.toThrow()
    expect(mocks.add).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
