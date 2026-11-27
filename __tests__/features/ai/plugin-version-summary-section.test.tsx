/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import { DEFAULT_PLUGIN_VERSION_SUMMARY_SETTINGS } from '@/features/ai/schemas'
import { DEFAULT_PLUGIN_VERSION_SUMMARY_INSTRUCTIONS } from '@/features/ai/constants'

/** Seção "Descritivo de versão de plugin" (Catalogador, OPE-172): liga/desliga, aviso de indisponível e instruções com "Restaurar padrão". */

const mocks = vi.hoisted(() => ({ query: null as unknown }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock("@/features/ai/hooks/useAi", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
  usePluginVersionSummarySettings: () => mocks.query,
  useSavePluginVersionSummarySettings: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useAiProviderStatuses: () => ({ providers: [] }),
}))(importOriginal)) as Record<string, unknown>) }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAi", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
  usePluginVersionSummarySettings: () => mocks.query,
  useSavePluginVersionSummarySettings: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useAiProviderStatuses: () => ({ providers: [] }),
}))(importOriginal)) as Record<string, unknown>) }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/ai/components/shared/ProviderModelCard", () => ({ ProviderModelCard: () => null }))

import { PluginVersionSummarySection } from '@/features/ai/components/plugin-version-summary/PluginVersionSummarySection'

afterEach(cleanup)

describe('seção "Descritivo de versão de plugin"', () => {
  it('mostra o liga/desliga, o motivo da indisponibilidade e as instruções; Restaurar padrão volta ao texto do código', () => {
    mocks.query = { isLoading: false, isError: false, data: { settings: { ...DEFAULT_PLUGIN_VERSION_SUMMARY_SETTINGS, instructions: 'Meu texto' }, isDefault: false, availability: { available: false, reason: 'Ative a feature' }, updatedAt: null } }
    render(<PluginVersionSummarySection ref={{ current: null }} onStateChange={() => {}} />)
    expect(screen.getAllByText('Descritivo de versão de plugin').length).toBeGreaterThan(0)
    expect(screen.getByText('Ative a feature')).toBeTruthy()
    const field = screen.getByLabelText('Instruções (prompt de sistema)') as HTMLTextAreaElement
    expect(field.value).toBe('Meu texto')
    fireEvent.click(screen.getByRole('button', { name: /Restaurar padrão/ }))
    expect((screen.getByLabelText('Instruções (prompt de sistema)') as HTMLTextAreaElement).value).toBe(DEFAULT_PLUGIN_VERSION_SUMMARY_INSTRUCTIONS)
  })

  it('erro ao carregar com tentar novamente', () => {
    const refetch = vi.fn()
    mocks.query = { isLoading: false, isError: true, data: undefined, error: null, refetch }
    render(<PluginVersionSummarySection ref={{ current: null }} onStateChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(refetch).toHaveBeenCalled()
  })
})
