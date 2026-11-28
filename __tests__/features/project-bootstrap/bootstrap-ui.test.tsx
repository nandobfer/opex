/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useForm } from 'react-hook-form'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({
    skills: { data: [] as { id: string; name: string; description: string | null; empty: boolean }[], isLoading: false, isError: false, error: null, refetch: vi.fn() },
    active: { data: [] as unknown[] },
    action: vi.fn(),
    formReply: vi.fn(),
    permissionReply: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAi', () => ({ useAiSkills: () => mocks.skills, useRefreshAiSkills: () => vi.fn() }))
vi.mock('@/features/project-bootstrap/hooks/useProjectBootstrap', () => ({
    useProjectBootstraps: () => mocks.active,
    useProjectBootstrapRealtime: () => undefined,
    useProjectBootstrapStream: () => ({ timeline: { items: [] }, connected: true }),
    useProjectBootstrapAction: () => ({ mutate: mocks.action, isPending: false }),
    useSendBootstrapMessage: () => ({ mutate: vi.fn(), isPending: false }),
    useReplyBootstrapForm: () => ({ mutate: mocks.formReply, isPending: false }),
    useReplyBootstrapPermission: () => ({ mutate: mocks.permissionReply, isPending: false }),
}))
vi.mock('@/features/agentic/components/workbench/Timeline', () => ({ Timeline: () => <div data-testid="timeline" /> }))
vi.mock('@/components/agent-questions/PermissionCard', () => ({ PermissionCard: ({ onReply }: { onReply: (decision: string) => void }) => <button type="button" onClick={() => onReply('once')}>Aprovar uma vez</button> }))
vi.mock('@/components/agent-questions/AgentQuestionsCard', () => ({ AgentQuestionsCard: ({ onCancel }: { onCancel: () => void }) => <button type="button" onClick={onCancel}>Dispensar pergunta</button> }))
vi.mock('@/components/agent-reply/ReplyTargetProvider', () => ({ ReplyTargetProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

import { TechBadges } from '@/features/project-bootstrap/components/TechBadges'
import { BootstrapSkillsCard } from '@/features/project-bootstrap/components/settings/BootstrapSkillsCard'
import { ActiveBootstrapsCard } from '@/features/project-bootstrap/components/ActiveBootstrapsCard'
import { ProvisionPanel } from '@/features/project-bootstrap/components/page/ProvisionPanel'
import { DEFAULT_PROJECT_BOOTSTRAP_SETTINGS, type ProjectBootstrapSettings } from '@/features/project-bootstrap/schemas'
import type { ProjectBootstrapDto } from '@/features/project-bootstrap/types'

afterEach(() => cleanup())
beforeEach(() => {
    vi.clearAllMocks()
    mocks.skills.data = [{ id: 'bootstrap-docker', name: 'bootstrap-docker', description: 'Dockeriza o projeto', empty: false }]
    mocks.active = { data: [] }
})

function SkillsHarness({ onSubmit }: { onSubmit: () => void }) {
    const form = useForm<ProjectBootstrapSettings>({ defaultValues: { ...DEFAULT_PROJECT_BOOTSTRAP_SETTINGS, skills: ['bootstrap-docker', 'bootstrap-aicontext'] } })
    return (
        <form
            onSubmit={(event) => {
                event.preventDefault()
                onSubmit()
            }}
        >
            <BootstrapSkillsCard form={form} />
        </form>
    )
}

describe('TechBadges', () => {
    it('mostra o nome do grupo e os badges; sem tecnologia, o texto de ajuda', () => {
        const { rerender, container } = render(<TechBadges groups={[{ group: { id: 'g', name: 'Banco de dados', color: '#22C55E', order: 0 }, technologies: [{ id: 'm', name: 'MongoDB' }] }]} />)
        expect(container.querySelector('[data-tech-group="Banco de dados"]')).toBeTruthy()
        expect(screen.getByText('MongoDB').getAttribute('style')).toContain('color')
        rerender(<TechBadges groups={[]} />)
        expect(screen.getByText(/aparecem aqui/)).toBeTruthy()
    })
})

describe('BootstrapSkillsCard', () => {
    it('avisa a skill escolhida que não está instalada no host e não aninha formulário', () => {
        const onSubmit = vi.fn()
        const { container } = render(<SkillsHarness onSubmit={onSubmit} />)
        expect(container.querySelector('[data-missing="true"]')!.textContent).toContain('bootstrap-aicontext')
        expect(screen.getByText(/Não está instalada no OpenCode do host/)).toBeTruthy()
        expect(screen.getByText('Dockeriza o projeto')).toBeTruthy()
        expect(container.querySelectorAll('form form')).toHaveLength(0)
        fireEvent.click(screen.getByRole('button', { name: 'Tirar a skill bootstrap-aicontext' }))
        expect(container.querySelector('[data-missing="true"]')).toBeNull()
        expect(onSubmit).not.toHaveBeenCalled()
        expect(screen.getByRole('link', { name: /Gerenciar as skills do OpenCode/ }).getAttribute('href')).toBe('/integracoes/ia/opencode?aba=skills')
    })
})

describe('ActiveBootstrapsCard', () => {
    it('não aparece sem bootstraps em andamento', () => {
        const { container } = render(<ActiveBootstrapsCard />)
        expect(container.textContent).toBe('')
    })

    it('lista os em andamento com o link da página', () => {
        mocks.active = { data: [{ id: 'b'.repeat(24), repo: 'org/app', step: 'deploy', status: 'failed', phase: 'deploy', attempt: 2, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: null }] }
        render(<ActiveBootstrapsCard />)
        expect(screen.getByText('Bootstraps em andamento')).toBeTruthy()
        expect(screen.getByRole('link', { name: 'org/app' }).getAttribute('href')).toBe(`/integracoes/ia/bootstraps/${'b'.repeat(24)}`)
        expect(screen.getByText('Falhou')).toBeTruthy()
    })
})

describe('ProvisionPanel', () => {
    const bootstrap = {
        id: 'b1',
        step: 'provision',
        status: 'waiting',
        phase: 'turn',
        error: null,
        notice: null,
        missing: [],
        running: true,
        sessionId: 's1',
        pendingForms: [{ id: 'f1' }],
        pendingPermissions: [{ id: 'p1' }],
    } as unknown as ProjectBootstrapDto

    it('mostra a conversa e os cards de permissão e de pergunta, respondendo pelo bootstrap', () => {
        render(<ProvisionPanel bootstrap={bootstrap} />)
        expect(screen.getByTestId('timeline')).toBeTruthy()
        expect(screen.getByText('O agente aguarda 2 respostas suas abaixo.')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Aprovar uma vez' }))
        expect(mocks.permissionReply).toHaveBeenCalledWith({ requestId: 'p1', decision: 'once' })
        fireEvent.click(screen.getByRole('button', { name: 'Dispensar pergunta' }))
        expect(mocks.formReply).toHaveBeenCalledWith({ formId: 'f1', cancel: true })
    })

    it('com falha, lista o que faltou e oferece Tentar novamente', () => {
        render(<ProvisionPanel bootstrap={{ ...bootstrap, status: 'failed', running: false, error: 'Pendências', missing: ['o .env'], pendingForms: [], pendingPermissions: [] }} />)
        expect(screen.getByText('falta o .env')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
        expect(mocks.action).toHaveBeenCalledWith('retry')
    })
})
