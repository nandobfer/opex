import { beforeEach, describe, expect, it } from 'vitest'
import { StackRegistry, matchRoutePath, pluginRegistries, findPluginRoute, routeKey } from '@/features/plugins/server/kernel/registries'

/** Registros do runtime (OPE-172): pilha por chave, para a recarga não abrir janela nem deixar resíduo. */

const owner = (versionId: string) => ({ pluginId: 'p1', channel: 'stable' as const, versionId, fiberId: versionId })

describe('StackRegistry', () => {
  it('a versão nova empilha por cima e o dispose da antiga só tira a própria entrada', () => {
    const registry = new StackRegistry<string>()
    const disposeOld = registry.add('k', owner('v1'), 'velha')
    registry.add('k', owner('v2'), 'nova')
    expect(registry.get('k')?.value).toBe('nova')
    disposeOld()
    expect(registry.get('k')?.value).toBe('nova')
    expect(registry.all()).toHaveLength(1)
  })

  it('o dispose da versão de cima devolve a de baixo; sem entradas, a chave some', () => {
    const registry = new StackRegistry<string>()
    const disposeOld = registry.add('k', owner('v1'), 'velha')
    const disposeNew = registry.add('k', owner('v2'), 'nova')
    disposeNew()
    expect(registry.get('k')?.value).toBe('velha')
    disposeOld()
    expect(registry.list()).toEqual([])
  })
})

describe('rotas', () => {
  beforeEach(() => pluginRegistries().routes.clear())

  it('casa os parâmetros e respeita o canal', () => {
    expect(matchRoutePath('/itens/:id', '/itens/a%20b')).toEqual({ id: 'a b' })
    expect(matchRoutePath('/itens/:id', '/itens')).toBeNull()
    pluginRegistries().routes.add(routeKey('preview', 'p1', 'GET', '/itens/:id'), { ...owner('v2'), channel: 'preview' }, { method: 'GET', path: '/itens/:id', handler: () => 'preview' })
    expect(findPluginRoute('p1', 'GET', '/itens/1', 'stable')).toBeNull()
    expect(findPluginRoute('p1', 'get', '/itens/1', 'preview')?.params).toEqual({ id: '1' })
  })
})
