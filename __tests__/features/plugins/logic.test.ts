import { describe, expect, it } from 'vitest'
import { diffPluginFiles, parsePreviewList, pluginPreviewPath, pluginSlotsOf, pluginIdFromTitle, resolvePluginVersion, togglePreviewList, uniquePluginId, versionActionBlock } from '@/features/plugins/logic'
import { pluginToolName } from '@/features/plugins/constants'
import { filterPlugins, DEFAULT_PLUGIN_FILTERS } from '@/features/plugins/filters'

/** Regras puras dos plugins (OPE-172): prévia por navegador, ciclo de versões, diff e ids. */

describe('resolvePluginVersion', () => {
  const plugin = { active: true, stableVersionId: 's1', previewVersionId: 'p1' }
  it('com a prévia ligada vê a preview; desligada, a stable', () => {
    expect(resolvePluginVersion(plugin, true)).toEqual({ versionId: 'p1', channel: 'preview' })
    expect(resolvePluginVersion(plugin, false)).toEqual({ versionId: 's1', channel: 'stable' })
  })
  it('prévia ligada sem versão em prévia cai na stable; desativado ou sem versão não aparece', () => {
    expect(resolvePluginVersion({ ...plugin, previewVersionId: null }, true)).toEqual({ versionId: 's1', channel: 'stable' })
    expect(resolvePluginVersion({ ...plugin, active: false }, false)).toBeNull()
    expect(resolvePluginVersion({ active: true, stableVersionId: null, previewVersionId: null }, false)).toBeNull()
  })
})

describe('versionActionBlock', () => {
  it('segue o ciclo draft → preview → stable e o rollback para versões já consolidadas', () => {
    expect(versionActionBlock('publish-preview', 'draft')).toBeNull()
    expect(versionActionBlock('consolidate', 'draft')).toBe('Só a versão em prévia pode ser consolidada')
    expect(versionActionBlock('consolidate', 'preview')).toBeNull()
    expect(versionActionBlock('rollback', 'archived')).toBeNull()
    expect(versionActionBlock('rollback', 'draft')).toBe('O rollback só volta para uma versão já consolidada antes')
    expect(versionActionBlock('rollback', 'stable', { isCurrentStable: true })).toBe('Esta já é a versão estável atual')
  })
})

describe('diffPluginFiles', () => {
  it('lista só os arquivos alterados com as linhas somadas e removidas', () => {
    const diff = diffPluginFiles(
      [
        { path: 'a.ts', content: 'um\ndois\n' },
        { path: 'b.ts', content: 'igual\n' },
        { path: 'c.ts', content: 'some\n' },
      ],
      [
        { path: 'a.ts', content: 'um\ntrês\n' },
        { path: 'b.ts', content: 'igual\n' },
        { path: 'd.ts', content: 'novo\n' },
      ],
    )
    expect(diff.map(({ path, status, additions, deletions }) => ({ path, status, additions, deletions }))).toEqual([
      { path: 'a.ts', status: 'modified', additions: 1, deletions: 1 },
      { path: 'c.ts', status: 'removed', additions: 0, deletions: 1 },
      { path: 'd.ts', status: 'added', additions: 1, deletions: 0 },
    ])
    expect(diff[0]!.patch).toContain('+três')
  })
})

describe('lista de prévias do cookie', () => {
  it('liga, desliga e descarta ids inválidos', () => {
    expect(togglePreviewList(['a1'], 'relogio', true)).toEqual(['a1', 'relogio'])
    expect(togglePreviewList(['a1', 'relogio'], 'relogio', false)).toEqual(['a1'])
    expect(parsePreviewList('relogio,../x,relogio,ok-2')).toEqual(['relogio', 'ok-2'])
    expect(parsePreviewList(null)).toEqual([])
  })
})

describe('ids', () => {
  it('gera o id do título sem acentos e com sufixo quando já existe', () => {
    expect(pluginIdFromTitle('Relógio do Dashboard!')).toBe('relogio-do-dashboard')
    expect(pluginIdFromTitle('42 métricas')).toBe('p-42-metricas')
    expect(uniquePluginId('relogio', new Set(['relogio', 'relogio-2']))).toBe('relogio-3')
    expect(pluginToolName('meu-plugin', 'hora')).toBe('plugin_meu_plugin_hora')
  })
})

describe('slots de um plugin (OPE-172)', () => {
  it('os de componente e, com nav, o menu do escopo', () => {
    expect(pluginSlotsOf({ scope: 'owner', slots: [{ slot: 'workbench.panel', export: 'A', order: 100 }], nav: [{ label: 'X', page: '', icon: 'Puzzle' }] } as never)).toEqual(['sidebar.nav', 'workbench.panel'])
    expect(pluginSlotsOf({ scope: 'client', slots: [{ slot: 'portal.task.panel', export: 'A', order: 100 }], nav: [{ label: 'X', page: '', icon: 'Puzzle' }] } as never)).toEqual(['portal.task.panel', 'portal.nav'])
    expect(pluginSlotsOf(null)).toEqual([])
  })

  it('Ver prévia: a primeira página; sem página, a tela do slot', () => {
    expect(pluginPreviewPath({ pluginId: 'relogio', scope: 'owner' }, { pages: [], slots: [{ slot: 'financeiro.widgets', export: 'A', order: 1 }] } as never)).toBe('/financeiro')
    expect(pluginPreviewPath({ pluginId: 'relogio', scope: 'owner' }, { pages: [], slots: [{ slot: 'workbench.panel', export: 'A', order: 1 }] } as never)).toBe('/desenvolvimento')
    expect(pluginPreviewPath({ pluginId: 'painel', scope: 'client' }, { pages: [], slots: [{ slot: 'portal.task.panel', export: 'A', order: 1 }] } as never)).toBe('/cliente/tarefas')
    expect(pluginPreviewPath({ pluginId: 'relogio', scope: 'owner' }, { pages: [{ path: 'hora', title: 'H', export: 'P' }], slots: [] } as never)).toBe('/x/relogio/hora')
  })

  it('filtro Slot: qualquer um dos escolhidos', () => {
    const plugins = [{ id: 'a', name: 'A', description: '', clientName: null, scope: 'owner', slots: ['dashboard.widgets'] }, { id: 'b', name: 'B', description: '', clientName: null, scope: 'owner', slots: ['tasks.header', 'sidebar.nav'] }] as never[]
    expect(filterPlugins(plugins, { ...DEFAULT_PLUGIN_FILTERS, slots: ['sidebar.nav'] }).map((p: { id: string }) => p.id)).toEqual(['b'])
    expect(filterPlugins(plugins, DEFAULT_PLUGIN_FILTERS)).toHaveLength(2)
  })
})

describe('árvore de slots (OPE-172, rodada 4)', () => {
  it('todo slot está na árvore uma vez só, com caminho; os ids de antes continuam', async () => {
    const { flatSlotTree, slotPathLabel, PLUGIN_SLOT_NODE_IDS } = await import('@/features/plugins/slot-tree')
    const { PLUGIN_SLOTS } = await import('@/features/plugins/constants')
    const leaves = flatSlotTree().filter((node) => node.kind === 'slot').map((node) => node.id)
    expect([...leaves].sort()).toEqual([...PLUGIN_SLOTS].sort())
    expect(new Set(PLUGIN_SLOT_NODE_IDS).size).toBe(PLUGIN_SLOT_NODE_IDS.length)
    for (const id of ['dashboard.widgets', 'sidebar.nav', 'task.panel', 'topbar.actions', 'workbench.panel', 'tasks.header', 'financeiro.widgets', 'portal.dashboard.widgets', 'portal.task.panel', 'portal.nav']) expect(leaves).toContain(id)
    expect(slotPathLabel('sidebar.nav.agentes')).toBe('Casca do app › Barra lateral › Menu Agentes')
    expect(slotPathLabel('task.sidebar')).toBe('Tarefas › Página da tarefa › Coluna lateral')
  })

  it('escolher uma área cobre todos os slots abaixo dela; a raiz do escopo cobre o escopo inteiro', async () => {
    const { expandSlotSelection, flatSlotTree } = await import('@/features/plugins/slot-tree')
    expect([...expandSlotSelection(['area:dashboard'])].sort()).toEqual(['dashboard.section.central', 'dashboard.section.financeiro', 'dashboard.section.horas', 'dashboard.section.tarefas', 'dashboard.widgets'])
    expect(expandSlotSelection(['area:client']).size).toBe(flatSlotTree('client').filter((node) => node.kind === 'slot').length)
    expect([...expandSlotSelection(['task.panel', 'desconhecido'])]).toEqual(['task.panel'])
  })

  it('filtro: área, arquivados fora por padrão', () => {
    const plugins = [
      { id: 'a', name: 'A', description: '', clientName: null, scope: 'owner', slots: ['dashboard.section.horas'], archivedAt: null },
      { id: 'b', name: 'B', description: '', clientName: null, scope: 'owner', slots: ['tasks.header'], archivedAt: null },
      { id: 'c', name: 'C', description: '', clientName: null, scope: 'owner', slots: ['dashboard.widgets'], archivedAt: '2026-11-19T12:00:00.000Z' },
    ] as never[]
    const ids = (filters: Partial<typeof DEFAULT_PLUGIN_FILTERS>) => filterPlugins(plugins, { ...DEFAULT_PLUGIN_FILTERS, ...filters }).map((p: { id: string }) => p.id)
    expect(ids({ slots: ['area:dashboard'] })).toEqual(['a'])
    expect(ids({ slots: ['area:dashboard'], showArchived: true })).toEqual(['a', 'c'])
    expect(ids({})).toEqual(['a', 'b'])
  })

  it('itens nav com slot de menu aninhado contam como esse slot', () => {
    expect(pluginSlotsOf({ scope: 'owner', slots: [], nav: [{ label: 'X', page: 'x', icon: 'Puzzle', slot: 'sidebar.nav.agentes' }, { label: 'Y', page: 'y', icon: 'Puzzle' }] } as never)).toEqual(['sidebar.nav', 'sidebar.nav.agentes'])
  })
})

describe('SDK: slots.json (OPE-172)', () => {
  it('plugin-sdk/slots.json é a mesma árvore do núcleo', async () => {
    const { readFileSync } = await import('node:fs')
    const { PLUGIN_SLOT_TREE } = await import('@/features/plugins/slot-tree')
    expect(JSON.parse(readFileSync(`${process.cwd()}/plugin-sdk/slots.json`, 'utf8'))).toEqual(JSON.parse(JSON.stringify(PLUGIN_SLOT_TREE)))
  })
})
