/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import { DEFAULT_TASK_REFINEMENT_SETTINGS, type TaskRefinementSettings } from '@/features/ai/schemas'
import type { RefinementSkillStateDto } from '@/features/ai/types'

const mocks = vi.hoisted(() => ({
    settings: null as unknown as TaskRefinementSettings,
    skillState: null as RefinementSkillStateDto | null,
    query: null as unknown,
    skills: { data: [] as unknown[], isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/ai/hooks/useAi', () => ({
    useTaskRefinementSettings: () => mocks.query,
    useSaveTaskRefinementSettings: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useAiProviderStatuses: () => ({ providers: [] }),
    useAiSkills: () => mocks.skills,
    useRefreshAiSkills: () => vi.fn(),
}))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useCentrals: () => ({ isLoading: false, data: [] }) }))
vi.mock('@/features/ai/components/understand-task/ProviderModelCard', () => ({ ProviderModelCard: () => null }))

import { TaskRefinementTab } from '@/features/ai/components/task-refinement/TaskRefinementTab'

// Objeto estável entre renders (como o cache do TanStack Query): a aba reseta o formulário quando ele muda.
function setQuery() {
    mocks.query = { isLoading: false, isError: false, data: { settings: mocks.settings, isDefault: false, availability: { available: true, reason: null }, skill: mocks.skillState, updatedAt: null } }
}

const noop = () => {}
const grill = { id: 'grill-me', name: 'Grill me', description: 'Interroga até ficar claro', path: '/s/SKILL.md', empty: false }

beforeEach(() => {
    mocks.settings = { ...DEFAULT_TASK_REFINEMENT_SETTINGS, instructions: 'Meu texto' }
    mocks.skillState = null
    mocks.skills.data = [grill]
    mocks.skills.isError = false
    setQuery()
})
afterEach(cleanup)

describe('aba "Agente Refinador"', () => {
    it('origem texto mostra o campo; trocar para skill lista as skills do OpenCode e voltar preserva o texto', () => {
        render(<TaskRefinementTab onDirtyChange={noop} />)
        expect(screen.getByText('Agente Refinador')).toBeTruthy()
        expect((screen.getByLabelText('Instruções (prompt de sistema)') as HTMLTextAreaElement).value).toBe('Meu texto')
        fireEvent.click(screen.getByRole('radio', { name: 'Skill do OpenCode' }))
        expect(screen.queryByLabelText('Instruções (prompt de sistema)')).toBeNull()
        expect(screen.getByText('Escolha a skill')).toBeTruthy()
        fireEvent.click(screen.getByRole('radio', { name: 'Texto' }))
        expect((screen.getByLabelText('Instruções (prompt de sistema)') as HTMLTextAreaElement).value).toBe('Meu texto')
    })

    it('skill configurada e encontrada: mostra o nome, sem aviso nem "não encontrada"', () => {
        mocks.settings = { ...mocks.settings, instructionsSource: 'skill', skill: 'grill-me' }
        mocks.skillState = { status: 'ok', name: 'Grill me', message: null }
        setQuery()
        render(<TaskRefinementTab onDirtyChange={noop} />)
        expect(screen.getByText('Grill me')).toBeTruthy()
        expect(screen.queryByText(/não encontrada/)).toBeNull()
        expect(screen.queryByRole('status')).toBeNull()
    })

    it('mostra a skill salva e o aviso quando ela sumiu do OpenCode', () => {
        mocks.settings = { ...mocks.settings, instructionsSource: 'skill', skill: 'sumiu' }
        mocks.skillState = { status: 'not_found', name: null, message: 'A skill "sumiu" não está instalada no OpenCode: o refinamento usa as instruções de texto até você escolher outra.' }
        setQuery()
        render(<TaskRefinementTab onDirtyChange={noop} />)
        expect(screen.getByText('sumiu (não encontrada)')).toBeTruthy()
        expect(screen.getByRole('status').textContent).toContain('não está instalada no OpenCode')
    })

    it('sem skills instaladas mostra o estado vazio com a opção de usar texto', () => {
        mocks.settings = { ...mocks.settings, instructionsSource: 'skill', skill: null }
        mocks.skills.data = []
        setQuery()
        render(<TaskRefinementTab onDirtyChange={noop} />)
        expect(screen.getByText('Nenhuma skill instalada no OpenCode')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Usar instruções de texto' }))
        expect(screen.getByLabelText('Instruções (prompt de sistema)')).toBeTruthy()
    })
})
