import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Opções do motor OpenCode no editor do rotineiro (OPE-130/OPE-153): MCPs do host e as skills
 * selecionáveis (D8: globais ligadas + nativas, com `native`), pela mesma listagem da aba Skills do
 * OpenCode. OpenCode indisponível devolve listas vazias com o motivo. OpenCode sempre simulado.
 */

const holder = vi.hoisted(() => ({
  down: false,
  scopes: [] as unknown[],
  skills: [] as { name: string; description: string | null; enabled: boolean; builtin: boolean }[],
}))

vi.mock('@/lib/ai/opencode', () => ({ getOpencodeConnection: async () => ({ directory: '/home/burgos' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => {
    if (holder.down) throw new Error('ECONNREFUSED')
    return { mcp: { list: async () => ({ data: [{ name: 'playwright', status: { status: 'connected' } }, { name: 'rotina_abc', status: { status: 'connected' } }] }) } }
  },
}))
vi.mock('@/features/opencode-resources/server/service', () => ({
  listResources: async (kind: string, scope: string) => {
    holder.scopes.push([kind, scope])
    return holder.skills
  },
}))

import { routineOpencodeOptions } from '@/features/routine-agents/server/opencode-options'

beforeEach(() => {
  holder.down = false
  holder.scopes = []
  holder.skills = [
    { name: 'revisar-pr', description: 'Revisa PRs', enabled: true, builtin: false },
    { name: 'desligada', description: 'Fora', enabled: false, builtin: false },
    { name: 'customize-opencode', description: null, enabled: true, builtin: true },
  ]
})

describe('routineOpencodeOptions', () => {
  it('lista as skills globais ligadas e as nativas (marca native); as desligadas ficam de fora', async () => {
    const options = await routineOpencodeOptions()
    expect(holder.scopes).toEqual([['skill', 'global']])
    expect(options.available).toBe(true)
    expect(options.skills).toEqual([
      { name: 'revisar-pr', description: 'Revisa PRs', native: false },
      { name: 'customize-opencode', description: '', native: true },
    ])
    expect(options.mcps.map((mcp) => mcp.name)).toEqual(['playwright'])
  })

  it('OpenCode indisponível: sem MCPs nem skills, com o motivo', async () => {
    holder.down = true
    expect(await routineOpencodeOptions()).toEqual({ available: false, reason: 'Serviço OpenCode indisponível: ECONNREFUSED', mcps: [], skills: [], browserAvailable: false })
  })
})
