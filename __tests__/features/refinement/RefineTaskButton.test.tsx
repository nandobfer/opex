/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ refinement: vi.fn(), dialog: vi.fn() }))

vi.mock('@/features/refinement/hooks/useRefinement', () => ({ useRefinementRealtime: vi.fn(), useTaskRefinement: mocks.refinement }))
vi.mock('@/features/refinement/components/RefineTaskDialog', () => ({
    RefineTaskDialog: (props: { open: boolean; taskId: string }) => {
        mocks.dialog(props)
        return null
    },
}))

import { RefineTaskButton } from '@/features/refinement/components/RefineTaskButton'

beforeEach(() => vi.clearAllMocks())

describe('RefineTaskButton', () => {
    it('é um botão só de ícone e abre o modal com o id da tarefa', () => {
        mocks.refinement.mockReturnValue({ data: { refinement: null, availability: { available: true, reason: null } }, isError: false })
        render(<RefineTaskButton taskId="t1" taskCode="OPX-1" />)
        const button = screen.getByRole('button', { name: 'Refinar tarefa' })
        expect(button.textContent).toBe('')
        fireEvent.click(button)
        expect(mocks.dialog).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, taskId: 't1' }))
    })

    it('indisponível (sem central) fica bloqueado e não abre o modal', () => {
        mocks.refinement.mockReturnValue({ data: { refinement: null, availability: { available: false, reason: 'Crie uma central de desenvolvimento para Opex' } }, isError: false })
        render(<RefineTaskButton taskId="t1" taskCode="OPX-1" />)
        const button = screen.getByRole('button', { name: 'Refinar tarefa' })
        expect(button.getAttribute('aria-disabled')).toBe('true')
        fireEvent.click(button)
        expect(mocks.dialog).not.toHaveBeenCalledWith(expect.objectContaining({ open: true }))
    })
})
