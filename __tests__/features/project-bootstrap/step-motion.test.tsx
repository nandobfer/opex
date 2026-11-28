/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ reduce: false }))

// `motion.div` expõe `initial`/`exit` em atributos, para conferir o ramo de movimento reduzido.
vi.mock('framer-motion', () => {
    const Motion = ({ children, initial, exit, animate: _animate, transition: _transition, layout: _layout, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
        React.createElement('div', { ...props, 'data-initial': JSON.stringify(initial), 'data-exit': JSON.stringify(exit) }, children)
    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, { get: () => Motion }),
        useReducedMotion: () => mocks.reduce,
    }
})
vi.mock('@/features/project-bootstrap/hooks/useProjectBootstrap', () => ({
    useProjectBootstrapRealtime: () => undefined,
    useProjectBootstrap: () => ({ data: BOOTSTRAP, isLoading: false, isError: false }),
    useProjectBootstrapAction: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/project-bootstrap/components/page/ProvisionPanel', () => ({ ProvisionPanel: () => <div>conversa</div> }))
vi.mock('@/features/project-bootstrap/components/BootstrapPageHeader', () => ({ BootstrapPageHeader: () => null }))
vi.mock('@/components/wizard/WizardStepper', () => ({ WizardStepper: () => null }))
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }))

const BOOTSTRAP = {
    id: 'b1',
    repo: 'org/app',
    directory: '/d',
    step: 'provision',
    status: 'running',
    phase: 'turn',
    attempt: 1,
    created: { repoUrl: null, projectId: null, centralId: null, environmentId: null, deployId: null, port: null },
    deploys: [],
    result: null,
}

import { ProjectBootstrapPage } from '@/features/project-bootstrap/components/page/ProjectBootstrapPage'

afterEach(() => cleanup())
beforeEach(() => {
    mocks.reduce = false
})

describe('troca de etapa da página do bootstrap', () => {
    it('desliza com animação normal', () => {
        render(<ProjectBootstrapPage id="b1" />)
        const panel = screen.getByTestId('bootstrap-step-panel')
        expect(JSON.parse(panel.getAttribute('data-initial')!)).toEqual({ opacity: 0, x: 12 })
        expect(JSON.parse(panel.getAttribute('data-exit')!)).toEqual({ opacity: 0, x: -12 })
    })

    it('com movimento reduzido, entra sem animação e sai só esmaecendo', () => {
        mocks.reduce = true
        render(<ProjectBootstrapPage id="b1" />)
        const panel = screen.getByTestId('bootstrap-step-panel')
        expect(panel.getAttribute('data-initial')).toBe('false')
        expect(JSON.parse(panel.getAttribute('data-exit')!)).toEqual({ opacity: 0 })
    })
})
