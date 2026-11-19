import { describe, expect, it } from 'vitest'
import { diffPluginFiles, parsePreviewList, pluginIdFromTitle, resolvePluginVersion, togglePreviewList, uniquePluginId, versionActionBlock } from '@/features/plugins/logic'
import { pluginToolName } from '@/features/plugins/constants'

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
