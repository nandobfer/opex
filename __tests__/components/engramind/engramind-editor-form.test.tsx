/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * OPE-142: a aba Visualização está ligada ao `EngramindEditorForm` (entre Configurações e Provedores, `?aba=visualizacao`)
 * e recebe o aviso de alterações pendentes como as demais abas.
 */

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('@/features/engramind/hooks/useEngramind', async (original) => ({ ...(await original<object>()), useEngramindRealtime: vi.fn() }))
vi.mock('@/features/integrations/components/detail/DetailHeader', () => ({ DetailHeader: () => <div data-testid="header" /> }))
for (const [path, name] of [
  ['AboutTab', 'AboutTab'],
  ['ConnectionTab', 'ConnectionTab'],
  ['settings/SettingsTab', 'SettingsTab'],
  ['providers/ProvidersTab', 'ProvidersTab'],
  ['identities/IdentitiesTab', 'IdentitiesTab'],
  ['operation/OperationTab', 'OperationTab'],
  ['env/EnvTab', 'EnvTab'],
  ['migration/MigrationTab', 'MigrationTab'],
] as const) {
  vi.doMock(`@/features/engramind/components/integration/${path}`, () => ({ [name]: () => <div data-testid={`tab-${name}`} /> }))
}
vi.mock('@/features/engramind/components/integration/universe-layout/UniverseLayoutTab', () => ({
  UniverseLayoutTab: ({ onDirtyChange, onConfigure }: { onDirtyChange: (dirty: boolean) => void; onConfigure: () => void }) => (
    <div data-testid="tab-visualizacao">
      <button type="button" onClick={() => onDirtyChange(true)}>
        sujar
      </button>
      <button type="button" onClick={onConfigure}>
        configurar
      </button>
    </div>
  ),
}))

const def = { id: 'engramind', name: 'Engramind', secretFields: [] } as never
const data = { health: 'ok' } as never

const mount = async () => {
  const { EngramindEditorForm } = await import('@/features/engramind/components/integration/EngramindEditorForm')
  return render(<EngramindEditorForm def={def} data={data} draft={{} as never} setDraft={vi.fn()} dirty={false} pending={false} onSave={async () => true} onUndo={vi.fn()} onExplore={vi.fn()} />)
}

beforeEach(() => {
  vi.resetModules()
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EngramindEditorForm: aba Visualização', () => {
  it('?aba=visualizacao abre o conteúdo da aba Visualização', async () => {
    window.history.replaceState({}, '', '/integracoes/engramind?aba=visualizacao')
    await mount()
    expect(await screen.findByTestId('tab-visualizacao')).toBeTruthy()
    expect(screen.queryByTestId('tab-ConnectionTab')).toBeNull()
    expect(screen.getByRole('tab', { name: /Visualização/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('a aba aparece entre Configurações e Provedores e clicar nela troca o conteúdo e a URL', async () => {
    window.history.replaceState({}, '', '/integracoes/engramind')
    await mount()
    const names = screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())
    expect(names.indexOf('Visualização')).toBe(names.indexOf('Configurações') + 1)
    expect(names.indexOf('Provedores')).toBe(names.indexOf('Visualização') + 1)
    expect(await screen.findByTestId('tab-ConnectionTab')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Visualização/ }))
    expect(await screen.findByTestId('tab-visualizacao')).toBeTruthy()
    expect(window.location.search).toBe('?aba=visualizacao')
  })

  it('alterações pendentes da aba pedem confirmação ao trocar de aba', async () => {
    window.history.replaceState({}, '', '/integracoes/engramind?aba=visualizacao')
    await mount()
    fireEvent.click(await screen.findByRole('button', { name: 'sujar' }))
    fireEvent.click(screen.getByRole('tab', { name: /Provedores/ }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeTruthy())
    expect(screen.getByTestId('tab-visualizacao')).toBeTruthy()
  })
})
