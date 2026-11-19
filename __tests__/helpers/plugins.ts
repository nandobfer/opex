import React from 'react'

/**
 * Hooks dos plugins (OPE-172) para telas que montam slots de plugin (Dashboard, aba da tarefa, menu,
 * portal). Por padrão não há plugins vigentes: o slot não renderiza nada e a tela fica como antes.
 * Use com `vi.mock('@/features/plugins/hooks/usePlugins', async () => (await import('…/helpers/plugins')).pluginHooksMock())`.
 *
 * Para provar o ponto de montagem de uma tela, ponha um plugin vigente em `pluginTestRuntime.plugins`
 * (com `pluginTestEntry`) e troque o `PluginContribution` por `pluginContributionMock()`: cada
 * contribuição vira `[data-plugin-contribution="{id}:{export}"]` com as props em `data-props`.
 */
export const pluginTestRuntime = { plugins: [] as unknown[], previewOn: [] as string[] }

export function resetPluginTestRuntime() {
  pluginTestRuntime.plugins = []
  pluginTestRuntime.previewOn = []
}

export function pluginHooksMock() {
  return {
    usePluginsRealtime: () => undefined,
    usePluginRuntime: () => ({ data: pluginTestRuntime, isPending: false, isError: false }),
  }
}

/** Plugin vigente com um slot (e, opcionalmente, itens de menu). */
export function pluginTestEntry(slot: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id: 'relogio',
    name: 'Relógio',
    versionId: 'v1',
    versionNumber: 1,
    channel: 'stable',
    revision: '1-a',
    bundleUrl: '/x.js',
    cssUrl: null,
    slots: slot ? [{ slot, export: 'Widget', title: 'Aba do relógio', order: 100 }] : [],
    pages: [],
    nav: [],
    ...overrides,
  }
}

export function pluginContributionMock() {
  return {
    PluginContribution: ({ entry, exportName, props }: { entry: { id: string }; exportName: string; props: unknown }) =>
      React.createElement('div', { 'data-plugin-contribution': `${entry.id}:${exportName}`, 'data-props': JSON.stringify(props) }, `contribuição ${entry.id}`),
  }
}
