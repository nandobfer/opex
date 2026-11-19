/** @vitest-environment happy-dom */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { StageSteps } from '@/features/agentic/components/workbench/StageSteps'
import { manualStageBlock, workbenchActions } from '@/features/agentic/logic'
import { workbenchActionItems } from '@/features/agentic/workbench-action-items'
import { workbenchStageLabel } from '@/features/agentic/constants'
import { noPluginTests, pluginPreviewPath, pluginTestsDecision, pluginWorkDirFor } from '@/features/agentic/plugin-flow'
import { pluginImplementPrompt, pluginPlanningNotes } from '@/features/agentic/prompts'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import { environmentFiles, skeletonFiles, workspaceInitCommand } from '@/features/agentic/server/plugin-workflow'

/** Mesa Plugin (OPE-172): trilha, ações, rótulos, prompts e as regras puras do fluxo de plugin. */

describe('trilha e ações da mesa Plugin', () => {
  it('a trilha troca Prévia/PR por Prévia ao vivo, Testes do plugin e Consolidada', () => {
    render(<StageSteps stage="fixing_ci" runState="running" kind="plugin" />)
    const trail = within(screen.getByRole('list', { name: 'Etapas da mesa' }))
    expect(trail.getByText('Prévia ao vivo')).toBeTruthy()
    expect(trail.getByText('Testes do plugin').closest('li')?.getAttribute('aria-current')).toBe('step')
    expect(trail.getByText('Consolidada')).toBeTruthy()
    expect(trail.queryByText('Pull Request')).toBeNull()
  })

  it('na prévia não há "Gerar nova prévia"; aprovar consolida (sem PR)', () => {
    const actions = workbenchActions('preview', 'idle', true, true, false, 'plugin')
    expect(actions).toEqual(['open-preview', 'request-correction', 'approve'])
    const items = workbenchActionItems({ actions, failed: false, pending: false, prOpen: false, deleting: false, implementBlockReason: null, plugin: true })
    expect(items.find((item) => item.id === 'approve')?.label).toBe('Aprovar e consolidar')
    expect(workbenchActions('preview', 'idle', true, true, false, 'repo')).toContain('rebuild-preview')
  })

  it('mesa de plugin não vai para as etapas do PR à mão; os rótulos mudam pelo tipo', () => {
    const state = { stage: 'preview' as const, hasPlan: true, hasPreview: true, prOpen: false, deleting: false, kind: 'plugin' as const }
    expect(manualStageBlock('pr_open', state)).toBe('Mesa de plugin não tem Pull Request')
    expect(workbenchStageLabel('fixing_ci', 'plugin')).toBe('Testes do plugin')
    expect(workbenchStageLabel('fixing_ci', 'repo')).not.toBe('Testes do plugin')
  })
})

describe('regras puras do fluxo de plugin', () => {
  const config = defaultCentralConfig('/home/u/app')

  it('pasta de trabalho ao lado dos worktrees e o endereço da prévia por escopo', () => {
    expect(pluginWorkDirFor(config, 'OPE-172')).toMatch(/\/plugins\/ope-172$/)
    expect(pluginPreviewPath({ pluginId: 'relogio', scope: 'owner' }, { pages: [{ path: 'painel', title: 'P', export: 'P' }], slots: [] })).toBe('/x/relogio/painel')
    expect(pluginPreviewPath({ pluginId: 'painel', scope: 'client' }, { pages: [], slots: [] })).toBe('/cliente/dashboard')
    expect(pluginPreviewPath({ pluginId: 'relogio', scope: 'owner' }, { pages: [], slots: [{ slot: 'task.panel', export: 'T', order: 1 }] })).toBe('/tarefas')
  })

  it('testes: passou consolida; falhou corrige até o limite; sem testes não bloqueia', () => {
    expect(pluginTestsDecision(0, 0, 3)).toBe('consolidate')
    expect(pluginTestsDecision(1, 2, 3)).toBe('fix')
    expect(pluginTestsDecision(1, 3, 3)).toBe('fail')
    expect(noPluginTests('No test files found, exiting with code 1')).toBe(true)
  })

  it('o esqueleto troca id/nome; o ambiente traz o .gitignore com ponto; o git marca o commit base', () => {
    const sdk = [
      { path: 'skeleton/owner/plugin.json', content: '{"id":"__PLUGIN_ID__","name":"__PLUGIN_NAME__"}' },
      { path: 'skeleton/client/plugin.json', content: 'cliente' },
      { path: 'template/gitignore', content: 'node_modules/' },
      { path: 'template/package.json', content: '{}' },
    ]
    expect(skeletonFiles(sdk, { pluginId: 'relogio', name: 'Relógio "novo"', scope: 'owner' })).toEqual([{ path: 'plugin.json', content: `{"id":"relogio","name":"Relógio 'novo'"}` }])
    expect(environmentFiles(sdk).map((file) => file.path)).toEqual(['.gitignore', 'package.json'])
    const command = workspaceInitCommand("/tmp/a b's")
    expect(command).toContain("cd '/tmp/a b'\\''s'")
    expect(command).toContain('git update-ref refs/remotes/origin/opex-base HEAD')
  })

  it('prompts: planejamento sem repositório e implementação na pasta, sem push nem PR', () => {
    expect(pluginPlanningNotes({ pluginId: null, scope: 'client', clientName: 'ACME' })).toContain('plugin de CLIENTE (ACME): SÓ interface')
    const prompt = pluginImplementPrompt(config, {} as never, 2, { pluginId: 'relogio', scope: 'owner', workDir: '/w/ope-172' })
    expect(prompt).toContain('versão 2')
    expect(prompt).toContain('MOVA ESTA SESSÃO para /w/ope-172')
    expect(prompt).toContain('`origin/opex-base`')
    expect(prompt).toContain('NÃO faça push e NÃO abra Pull Request')
  })
})
