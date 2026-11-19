import { describe, expect, it } from 'vitest'
import { resolvePluginTarget } from '@/features/tasks/plugin-target'

/**
 * Alvo do plugin gravado na tarefa (OPE-172): tarefa vinculada a cliente é do escopo desse cliente.
 * Sem alvo, ele é deduzido; um alvo divergente é recusado em pt-BR, nunca trocado em silêncio.
 */

describe('resolvePluginTarget', () => {
  it('tarefa do dono grava o alvo escolhido', () => {
    expect(resolvePluginTarget('plugin', { scope: 'owner', clientId: null, pluginId: 'relogio' }, null)).toEqual({ scope: 'owner', clientId: null, pluginId: 'relogio' })
  })

  it('tarefa de cliente sem alvo (portal) deduz o escopo do próprio cliente', () => {
    expect(resolvePluginTarget('plugin', null, 'cli1')).toEqual({ scope: 'client', clientId: 'cli1', pluginId: null })
    expect(resolvePluginTarget('plugin', { scope: 'client', clientId: null, pluginId: 'painel' }, 'cli1')).toEqual({ scope: 'client', clientId: 'cli1', pluginId: 'painel' })
  })

  it('escopo do dono numa tarefa de cliente é recusado, sem gravar escopo de cliente no lugar', () => {
    expect(() => resolvePluginTarget('plugin', { scope: 'owner', clientId: null, pluginId: 'relogio' }, 'cli1')).toThrow(
      expect.objectContaining({ status: 400, code: 'TASK_PLUGIN_SCOPE_CONFLICT', message: 'Esta tarefa é de um cliente: o plugin dela é do escopo Cliente, do mesmo cliente da tarefa. Escolha o escopo Cliente.' }),
    )
  })

  it('outro cliente numa tarefa de cliente também é recusado', () => {
    expect(() => resolvePluginTarget('plugin', { scope: 'client', clientId: 'cli2', pluginId: null }, 'cli1')).toThrow(expect.objectContaining({ code: 'TASK_PLUGIN_SCOPE_CONFLICT' }))
  })

  it('tipo diferente de Plugin não tem alvo; Plugin sem alvo no dono pede o escopo', () => {
    expect(resolvePluginTarget('feature', { scope: 'owner', clientId: null, pluginId: null }, 'cli1')).toBeNull()
    expect(() => resolvePluginTarget('plugin', null, null)).toThrow(expect.objectContaining({ code: 'TASK_PLUGIN_TARGET', message: 'Informe o escopo do plugin' }))
  })
})
