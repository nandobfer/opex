/** @vitest-environment happy-dom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useForm } from 'react-hook-form'
import { framerMotionMock } from '../../helpers/framer-motion'

/** OPE-215 (v5): a chave de ambiente e deploy na etapa 1 e na página, e as telas sem ambiente. */

const mocks = vi.hoisted(() => ({
    skills: { data: [] as { id: string; name: string; description: string | null; empty: boolean }[], isLoading: false, isError: false, error: null, refetch: vi.fn() },
    setEnvironment: vi.fn(),
    start: vi.fn(async (values: unknown) => ({ id: 'b'.repeat(24), values })),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAi', () => ({ useAiSkills: () => mocks.skills, useRefreshAiSkills: () => vi.fn() }))
vi.mock('@/features/environments/components/DeployLog', () => ({ DeployLog: () => <div data-testid="deploy-log" /> }))
vi.mock('@/features/project-bootstrap/hooks/useProjectBootstrap', () => ({
    useProjectBootstrapAction: () => ({ mutate: vi.fn(), isPending: false }),
    useSetBootstrapEnvironment: () => ({ mutate: mocks.setEnvironment, isPending: false }),
    useStartProjectBootstrap: () => ({ mutateAsync: mocks.start, isPending: false }),
}))
// Etapa 1: só a chave nova importa aqui; os outros campos têm testes próprios.
vi.mock('@/features/project-bootstrap/components/new/RepoFields', () => ({ RepoFields: () => null }))
vi.mock('@/features/project-bootstrap/components/new/ContextField', () => ({ ContextField: () => null }))
vi.mock('@/features/project-bootstrap/components/new/HostFields', () => ({ HostFields: () => null }))
vi.mock('@/features/project-bootstrap/components/new/BlockersNotice', () => ({ BlockersNotice: () => null }))
vi.mock('@/features/project-bootstrap/hooks/useBootstrapInfoForm', async () => {
    const { useForm: useRealForm } = await import('react-hook-form')
    return {
        useBootstrapInfoForm: () => {
            const form = useRealForm({ defaultValues: { owner: 'org', name: 'plugin', visibility: 'private', context: 'Plugin', directory: '/home/u/code/plugin', entryColumnKey: 'todo', closedColumnKey: null, withEnvironment: true } })
            return { form, owners: [], repoCheck: null, repoPending: false, detected: [], board: { columns: [], isLoading: false }, dirCheck: null, dirPending: false, markDirectoryEdited: vi.fn(), blockers: [], blockReason: null }
        },
    }
})

import { BootstrapInfoForm } from '@/features/project-bootstrap/components/new/BootstrapInfoForm'
import { EnvironmentToggle } from '@/features/project-bootstrap/components/page/EnvironmentToggle'
import { DeployPanel } from '@/features/project-bootstrap/components/page/DeployPanel'
import { DonePanel } from '@/features/project-bootstrap/components/page/DonePanel'
import { BootstrapSkillsCard } from '@/features/project-bootstrap/components/settings/BootstrapSkillsCard'
import { DEFAULT_PROJECT_BOOTSTRAP_SETTINGS, type ProjectBootstrapSettings } from '@/features/project-bootstrap/schemas'
import type { ProjectBootstrapDto } from '@/features/project-bootstrap/types'

const CREATED = { repoUrl: 'https://github.com/org/plugin', projectId: 'p'.repeat(24), centralId: 'c'.repeat(24), environmentId: null, deployId: null, port: null }
const dto = (extra: Partial<ProjectBootstrapDto>) =>
    ({ id: 'b1', repo: 'org/plugin', visibility: 'private', branch: 'main', directory: '/home/u/code/plugin', step: 'provision', status: 'running', phase: 'turn', withEnvironment: true, created: CREATED, deploys: [], result: null, error: null, notice: null, pendingForms: [], pendingPermissions: [], running: true, ...extra }) as unknown as ProjectBootstrapDto

afterEach(() => cleanup())
beforeEach(() => {
    vi.clearAllMocks()
    mocks.skills.data = [{ id: 'bootstrap-docker', name: 'bootstrap-docker', description: 'Dockeriza', empty: false }]
})

describe('etapa 1', () => {
    it('a chave "Criar ambiente e container Docker" desligada envia withEnvironment: false', async () => {
        render(<BootstrapInfoForm initialRepo="org/plugin" />)
        const toggle = screen.getByRole('switch')
        expect(toggle.getAttribute('aria-checked')).toBe('true')
        fireEvent.click(toggle)
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Enviar ao Agente de Bootstrap/ }))
        })
        expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ withEnvironment: false }))
    })
})

describe('chave do ambiente na página', () => {
    it('aparece com o bootstrap aberto e muda pela mutação', () => {
        render(<EnvironmentToggle bootstrap={dto({})} />)
        fireEvent.click(screen.getByRole('switch'))
        expect(mocks.setEnvironment).toHaveBeenCalledWith(false)
    })

    it('some quando o bootstrap acabou e trava (com o motivo) fora da etapa 2 para ligar', () => {
        const { container, rerender } = render(<EnvironmentToggle bootstrap={dto({ status: 'done', step: 'done' })} />)
        expect(container.textContent).toBe('')
        rerender(<EnvironmentToggle bootstrap={dto({ step: 'link', status: 'failed', withEnvironment: false })} />)
        expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByText(/só vale enquanto o agente provisiona/)).toBeTruthy()
    })
})

describe('telas sem ambiente', () => {
    it('a etapa 4 diz que não se aplica', () => {
        render(<DeployPanel bootstrap={dto({ step: 'done', status: 'done', withEnvironment: false })} />)
        expect(screen.getByTestId('bootstrap-no-environment').textContent).toContain('não usa ambiente nem container')
        expect(screen.queryByTestId('deploy-log')).toBeNull()
    })

    it('a conclusão traz repositório e central, sem ambiente nem porta', () => {
        render(<DonePanel bootstrap={dto({ step: 'done', status: 'done', withEnvironment: false })} />)
        expect(screen.getByText('Projeto pronto!')).toBeTruthy()
        expect(screen.getByText('Central de desenvolvimento')).toBeTruthy()
        expect(screen.queryByText('Ambiente')).toBeNull()
    })

    it('com ambiente, a conclusão continua com o ambiente', () => {
        render(<DonePanel bootstrap={dto({ step: 'done', status: 'done', created: { ...CREATED, environmentId: 'e'.repeat(24), port: 4014 } })} />)
        expect(screen.getByText('Ambiente no ar!')).toBeTruthy()
        expect(screen.getByText('Ambiente')).toBeTruthy()
    })
})

function SkillsHarness({ onSubmit, values }: { onSubmit: (values: ProjectBootstrapSettings) => void; values?: Partial<ProjectBootstrapSettings> }) {
    const form = useForm<ProjectBootstrapSettings>({ defaultValues: { ...DEFAULT_PROJECT_BOOTSTRAP_SETTINGS, skills: ['bootstrap-docker'], environmentSkills: [], ...values } })
    return (
        <form onSubmit={form.handleSubmit(onSubmit)}>
            <BootstrapSkillsCard form={form} />
            <button type="submit">salvar</button>
        </form>
    )
}

describe('skills só com ambiente', () => {
    it('marca e desmarca a skill como "Só com ambiente" e tirar a skill tira a marca', async () => {
        const onSubmit = vi.fn()
        const { container } = render(<SkillsHarness onSubmit={onSubmit} />)
        const toggle = screen.getByRole('switch', { name: 'Só com ambiente: bootstrap-docker' })
        expect(toggle.getAttribute('aria-checked')).toBe('false')
        fireEvent.click(toggle)
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'salvar' }))
        })
        expect(onSubmit.mock.calls.at(-1)![0]).toMatchObject({ environmentSkills: ['bootstrap-docker'] })
        fireEvent.click(screen.getByRole('button', { name: 'Tirar a skill bootstrap-docker' }))
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'salvar' }))
        })
        expect(onSubmit.mock.calls.at(-1)![0]).toMatchObject({ skills: [], environmentSkills: [] })
        expect(container.querySelectorAll('form form')).toHaveLength(0)
    })
})
