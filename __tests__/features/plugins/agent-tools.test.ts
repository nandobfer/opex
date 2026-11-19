import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/**
 * Ferramentas de plugin no catálogo dos agentes (OPE-172): entram sem build no Agente Opex e no MCP
 * do dono (grupo `plugin-tools`), a política de desligar vale para elas, e com a prévia ligada no turno
 * a ferramenta da versão preview substitui a da stable.
 */

vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))

import { allOpexTools, enabledOpexTools, findOpexTool, OPEX_TOOLS } from '@/features/opex-agent/server/tools/registry'
import { pluginRegistries, toolKey } from '@/features/plugins/server/kernel/registries'
import type { OpexTool } from '@/features/opex-agent/server/tools/define'

const pluginTool = (label: string): OpexTool => ({ name: 'plugin_relogio_hora', group: 'plugin-tools', label, description: 'Hora', risk: 'read', input: z.object({}), execute: async () => label }) as unknown as OpexTool
const owner = (channel: 'stable' | 'preview') => ({ pluginId: 'relogio', channel, versionId: channel, fiberId: channel })

beforeEach(() => pluginRegistries().tools.clear())

describe('catálogo com ferramentas de plugin', () => {
  it('soma as ferramentas dos plugins às estáticas e remove ao desfazer a fiber', () => {
    const dispose = pluginRegistries().tools.add(toolKey('stable', 'plugin_relogio_hora'), owner('stable'), pluginTool('estável'))
    expect(allOpexTools()).toHaveLength(OPEX_TOOLS.length + 1)
    expect(findOpexTool('plugin_relogio_hora')?.label).toBe('estável')
    dispose()
    expect(findOpexTool('plugin_relogio_hora')).toBeUndefined()
  })

  it('a ferramenta desligada pelo dono fica fora; com a prévia ligada vale a versão preview', () => {
    pluginRegistries().tools.add(toolKey('stable', 'plugin_relogio_hora'), owner('stable'), pluginTool('estável'))
    pluginRegistries().tools.add(toolKey('preview', 'plugin_relogio_hora'), owner('preview'), pluginTool('prévia'))
    expect(enabledOpexTools(['plugin_relogio_hora']).some((tool) => tool.name === 'plugin_relogio_hora')).toBe(false)
    expect(enabledOpexTools([]).find((tool) => tool.name === 'plugin_relogio_hora')?.label).toBe('estável')
    expect(enabledOpexTools([], new Set(['relogio'])).find((tool) => tool.name === 'plugin_relogio_hora')?.label).toBe('prévia')
  })

  it('as ferramentas de gestão de plugins são do grupo plugins, com set/rollback destrutivos', () => {
    const tools = OPEX_TOOLS.filter((tool) => tool.group === 'plugins')
    expect(tools.map((tool) => tool.name).sort()).toEqual(['diff_plugin_versions', 'get_plugin', 'inspect_plugin_runtime', 'list_plugins', 'read_plugin_source', 'rollback_plugin', 'set_plugin_active'])
    expect(tools.filter((tool) => tool.risk === 'destructive').map((tool) => tool.name).sort()).toEqual(['rollback_plugin', 'set_plugin_active'])
  })
})
