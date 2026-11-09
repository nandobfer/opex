/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/** Seção Skills na aba Agente Opex (OPE-153): entrada no menu de seções e `?secao=skills` montando a seção. */

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiProviderStatuses: () => ({ providers: [] }) }))
// Resultado estável: um objeto novo a cada render faria o `form.reset` da aba rodar sem fim.
vi.mock('@/features/opex-agent/hooks/useOpexSettings', async () => {
  const { DEFAULT_OPEX_AGENT_SETTINGS } = await import('@/features/opex-agent/schemas')
  const settings = { isLoading: false, isError: false, data: { settings: DEFAULT_OPEX_AGENT_SETTINGS, availability: {}, isDefault: false, tools: [] }, refetch: () => undefined }
  const save = { mutateAsync: async () => null, isPending: false }
  return { useOpexSettings: () => settings, useSaveOpexSettings: () => save }
})
vi.mock('@/features/opex-agent/components/settings/skills/OpexSkillsSection', async () => {
  const { createElement } = await import('react')
  return { OpexSkillsSection: () => createElement('div', { 'data-testid': 'OpexSkillsSection' }) }
})
vi.mock('@/features/opex-agent/components/settings/mcp/OpexMcpSection', async () => {
  const { createElement } = await import('react')
  return { OpexMcpSection: () => createElement('div', { 'data-testid': 'OpexMcpSection' }) }
})
vi.mock('@/features/opex-agent/components/settings/OpexMemoriesSection', async () => {
  const { createElement } = await import('react')
  return { OpexMemoriesSection: () => createElement('div', { 'data-testid': 'OpexMemoriesSection' }) }
})
vi.mock('@/features/opex-agent/components/settings/OpexModelCard', async () => {
  const { createElement } = await import('react')
  return { OpexModelCard: () => createElement('div', { 'data-testid': 'OpexModelCard' }) }
})
vi.mock('@/features/opex-agent/components/settings/OpexFilesCard', async () => {
  const { createElement } = await import('react')
  return { OpexFilesCard: () => createElement('div', { 'data-testid': 'OpexFilesCard' }) }
})
vi.mock('@/features/opex-agent/components/settings/OpexHostCard', async () => {
  const { createElement } = await import('react')
  return { OpexHostCard: () => createElement('div', { 'data-testid': 'OpexHostCard' }) }
})
vi.mock('@/features/opex-agent/components/settings/OpexToolsCard', async () => {
  const { createElement } = await import('react')
  return { OpexToolsCard: () => createElement('div', { 'data-testid': 'OpexToolsCard' }) }
})

import { OpexAgentTab } from '@/features/opex-agent/components/settings/OpexAgentTab'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('OpexAgentTab › Skills', () => {
  it('?secao=skills abre a seção Skills (e não as outras)', () => {
    window.history.replaceState(null, '', '/integracoes/ia?aba=agente-opex&secao=skills')
    render(<OpexAgentTab onDirtyChange={() => {}} />)
    expect(screen.getByTestId('OpexSkillsSection')).toBeTruthy()
    expect(screen.queryByTestId('OpexMcpSection')).toBeNull()
  })

  it('a seção Skills está no menu de seções e abre pelo clique', () => {
    window.history.replaceState(null, '', '/integracoes/ia?aba=agente-opex')
    render(<OpexAgentTab onDirtyChange={() => {}} />)
    expect(screen.queryByTestId('OpexSkillsSection')).toBeNull()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByTestId('OpexSkillsSection')).toBeTruthy()
    expect(window.location.search).toContain('secao=skills')
  })
})
