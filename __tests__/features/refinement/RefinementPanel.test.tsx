/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

const mocks = vi.hoisted(() => ({
    refinement: vi.fn(),
    start: vi.fn(),
    action: vi.fn(),
    stream: vi.fn(),
    reconnect: vi.fn(),
    sendLive: vi.fn(),
}))

vi.mock('@/features/refinement/hooks/useRefinement', () => ({
    useRefinementRealtime: vi.fn(),
    useTaskRefinement: mocks.refinement,
    useStartRefinement: mocks.start,
    useRefinementAction: mocks.action,
    useRefinementReconnect: () => ({ mutateAsync: mocks.reconnect, isPending: false }),
    useSendRefinementMessage: () => ({ mutate: mocks.sendLive, isPending: false }),
}))
vi.mock('@/features/refinement/hooks/useRefinementStream', () => ({ useRefinementStream: mocks.stream }))
vi.mock('@/features/agentic/components/workbench/Timeline', () => ({ Timeline: () => <div data-testid="timeline" /> }))
vi.mock('@/features/refinement/components/RefinementRequests', () => ({ RefinementRequests: () => <div data-testid="requests" /> }))

import { RefinementPanel } from '@/features/refinement/components/RefinementPanel'

const startMutate = vi.fn()

const state = (overrides: { availability?: { available: boolean; reason: string | null }; refinement?: unknown }) => ({
    data: { refinement: overrides.refinement ?? null, availability: overrides.availability ?? { available: true, reason: null } },
    isLoading: false,
    isError: false,
})

beforeEach(() => {
    vi.clearAllMocks()
    mocks.refinement.mockReturnValue(state({}))
    mocks.start.mockReturnValue({ mutate: startMutate, isPending: false })
    mocks.action.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.stream.mockReturnValue({ timeline: { loaded: true, items: [], reasoning: false }, connected: true })
})

afterEach(cleanup)

describe('RefinementPanel', () => {
    it('sem refinamento e disponível mostra o CTA e inicia ao clicar', () => {
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        const cta = screen.getByRole('button', { name: 'Refinar tarefa OPX-1' })
        fireEvent.click(cta)
        expect(startMutate).toHaveBeenCalledTimes(1)
    })

    it('indisponível mostra o motivo e não oferece o CTA', () => {
        mocks.refinement.mockReturnValue(state({ availability: { available: false, reason: 'Crie uma central de desenvolvimento para Opex' } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.getAllByText(/central de desenvolvimento/).length).toBeGreaterThan(0)
        expect(screen.queryByRole('button', { name: /Refinar tarefa/ })).toBeNull()
    })

    it('com refinamento rodando mostra a saída, as perguntas e o botão Parar', () => {
        mocks.refinement.mockReturnValue(state({ refinement: { runState: 'running', resolved: false, sessionDirectory: '/repo/opex', pendingForms: [], pendingPermissions: [] } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.getByTestId('timeline')).not.toBeNull()
        expect(screen.getByTestId('requests')).not.toBeNull()
        expect(screen.getByRole('button', { name: /Parar/ })).not.toBeNull()
    })

    it('chat durante a execução ligado: com o agente refinando, envia a mensagem ao turno atual', () => {
        mocks.refinement.mockReturnValue(state({ refinement: { id: 'r1', runState: 'running', resolved: false, finalizing: false, liveChat: true, sessionDirectory: '/repo/opex', pendingForms: [], pendingPermissions: [] } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        fireEvent.change(screen.getByLabelText('Mensagem para o agente em execução'), { target: { value: 'considere o módulo de pagamentos' } })
        fireEvent.click(screen.getByRole('button', { name: /Enviar ao agente/ }))
        expect(mocks.sendLive).toHaveBeenCalledWith('considere o módulo de pagamentos', expect.anything())
    })

    it('chat durante a execução: desligado ou na consolidação da especificação, o campo não aparece', () => {
        mocks.refinement.mockReturnValue(state({ refinement: { id: 'r1', runState: 'running', resolved: false, finalizing: false, liveChat: false, pendingForms: [], pendingPermissions: [] } }))
        const { unmount } = render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.queryByLabelText('Mensagem para o agente em execução')).toBeNull()
        unmount()
        mocks.refinement.mockReturnValue(state({ refinement: { id: 'r1', runState: 'running', resolved: false, finalizing: true, liveChat: true, pendingForms: [], pendingPermissions: [] } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.queryByLabelText('Mensagem para o agente em execução')).toBeNull()
    })

    it('no turno de consolidação mostra "Consolidando a especificação técnica…"', () => {
        mocks.refinement.mockReturnValue(state({ refinement: { runState: 'running', resolved: false, finalizing: true, sessionDirectory: '/repo/opex', pendingForms: [], pendingPermissions: [] } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.getByText(/Consolidando a especificação técnica/)).not.toBeNull()
    })

    it('com intenção de iniciar (autoStart) inicia uma vez e avisa o pai', () => {
        const onAutoStarted = vi.fn()
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" autoStart onAutoStarted={onAutoStarted} />)
        expect(startMutate).toHaveBeenCalledTimes(1)
        expect(onAutoStarted).toHaveBeenCalledTimes(1)
    })

    it('esclarecido mostra o aviso de especificação salva', () => {
        mocks.refinement.mockReturnValue(state({ refinement: { runState: 'idle', resolved: true, sessionDirectory: '/repo/opex', pendingForms: [], pendingPermissions: [] } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.getByText(/esclarecida e salva na tarefa/)).not.toBeNull()
        expect(screen.queryByRole('button', { name: /Continuar/ })).toBeNull()
    })

    it('interrompido/falho com sessão oferece Reconectar ao lado de Continuar', () => {
        mocks.reconnect.mockResolvedValue({ refinement: { runState: 'running', reconnect: { outcome: 'attached', message: null, at: '2026-10-09T12:00:00.000Z' } }, availability: { available: true } })
        mocks.refinement.mockReturnValue(state({ refinement: { id: 'r1', runState: 'interrupted', resolved: false, sessionId: 's1', sessionDirectory: '/repo/opex', pendingForms: [], pendingPermissions: [] } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.getByRole('button', { name: /Continuar/ })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /Reconect/ }))
        expect(mocks.reconnect).toHaveBeenCalled()
    })

    it('sem sessão do OpenCode não oferece Reconectar', () => {
        mocks.refinement.mockReturnValue(state({ refinement: { id: 'r1', runState: 'interrupted', resolved: false, sessionId: null, sessionDirectory: '/repo/opex', pendingForms: [], pendingPermissions: [] } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.queryByRole('button', { name: /Reconect/ })).toBeNull()
    })
})
