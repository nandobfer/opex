/**
 * Hooks dos plugins (OPE-172) para telas que montam slots de plugin (Dashboard, aba da tarefa, menu,
 * portal): sem plugins vigentes, o slot não renderiza nada e a tela fica como antes. Use com
 * `vi.mock('@/features/plugins/hooks/usePlugins', () => pluginHooksMock())`.
 */
export function pluginHooksMock() {
  return {
    usePluginsRealtime: () => undefined,
    usePluginRuntime: () => ({ data: { plugins: [], previewOn: [] }, isPending: false, isError: false }),
  }
}
