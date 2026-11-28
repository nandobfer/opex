/** @vitest-environment happy-dom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/project-bootstrap/hooks/useProjectBootstrap', async () => {
    const { DEFAULT_PROJECT_BOOTSTRAP_SETTINGS } = await import('@/features/project-bootstrap/schemas')
    // Mesma referência a cada render, como o cache do TanStack Query.
    const query = { data: { settings: DEFAULT_PROJECT_BOOTSTRAP_SETTINGS, isDefault: true, availability: { available: false, reason: '"Agente de Bootstrap" está desativada' }, updatedAt: null }, isLoading: false, isError: false }
    return {
        useProjectBootstrapSettings: () => query,
        useSaveProjectBootstrapSettings: () => ({ mutateAsync: vi.fn(async () => null), isPending: false }),
    }
})
vi.mock('@/features/ai/components/AgentSettingsTabs', () => ({ AgentSettingsTabs: ({ children }: { children: (section: string) => React.ReactNode }) => <>{children('configuracao')}</> }))
vi.mock('@/features/ai/components/agent-settings/AgentCard', () => ({ AgentCard: () => <div data-testid="agent-card" /> }))
vi.mock('@/features/project-bootstrap/components/settings/BootstrapSkillsCard', () => ({ BootstrapSkillsCard: () => null }))
vi.mock('@/features/project-bootstrap/components/settings/TechCatalogSection', () => ({ TechCatalogSection: () => null }))
vi.mock('@/features/project-bootstrap/components/settings/BootstrapHistoryCard', () => ({ BootstrapHistoryCard: () => null }))

import { ProjectBootstrapTab } from '@/features/project-bootstrap/components/settings/ProjectBootstrapTab'

afterEach(() => cleanup())

describe('ProjectBootstrapTab', () => {
    it('dentro do formulário de /integracoes/ia não aninha <form> e o Salvar não envia o de fora', () => {
        const onSubmit = vi.fn()
        const { container } = render(
            <form onSubmit={onSubmit}>
                <ProjectBootstrapTab onDirtyChange={vi.fn()} />
            </form>,
        )
        expect(container.querySelectorAll('form form')).toHaveLength(0)
        const save = screen.getByRole('button', { name: /Salvar/ })
        expect(save.getAttribute('type')).toBe('button')
        save.click()
        expect(onSubmit).not.toHaveBeenCalled()
        expect(screen.getByTestId('agent-card')).toBeTruthy()
    })
})
