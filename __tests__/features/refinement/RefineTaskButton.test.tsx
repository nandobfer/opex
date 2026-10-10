/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ refinement: vi.fn() }))

vi.mock('@/features/refinement/hooks/useRefinement', () => ({ useRefinementRealtime: vi.fn(), useTaskRefinement: mocks.refinement }))

import { RefineTaskButton } from '@/features/refinement/components/RefineTaskButton'

beforeEach(() => vi.clearAllMocks())

describe('RefineTaskButton', () => {
    it('é um botão só de ícone e chama onOpen ao clicar', () => {
        mocks.refinement.mockReturnValue({ data: { refinement: null, availability: { available: true, reason: null } }, isError: false })
        const onOpen = vi.fn()
        render(<RefineTaskButton taskId="t1" onOpen={onOpen} />)
        const button = screen.getByRole('button', { name: 'Refinar tarefa' })
        expect(button.textContent).toBe('')
        fireEvent.click(button)
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('indisponível (sem central) fica bloqueado e não chama onOpen', () => {
        mocks.refinement.mockReturnValue({ data: { refinement: null, availability: { available: false, reason: 'Crie uma central de desenvolvimento para Opex' } }, isError: false })
        const onOpen = vi.fn()
        render(<RefineTaskButton taskId="t1" onOpen={onOpen} />)
        const button = screen.getByRole('button', { name: 'Refinar tarefa' })
        expect(button.getAttribute('aria-disabled')).toBe('true')
        fireEvent.click(button)
        expect(onOpen).not.toHaveBeenCalled()
    })
})
