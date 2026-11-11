/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { ActiveItemRow } from '@/components/list/ActiveItemRow'

afterEach(cleanup)

type Props = Partial<React.ComponentProps<typeof ActiveItemRow>>

const setup = (props: Props = {}) => {
  const handlers = { onActivate: vi.fn(), onRename: vi.fn(), onRemove: vi.fn(), onExtra: vi.fn() }
  render(
    <ul>
      <ActiveItemRow
        label="Trabalho"
        sublabel="OAuth"
        active={false}
        activateLabel="Usar a conta Trabalho"
        onActivate={handlers.onActivate}
        onRename={handlers.onRename}
        onRemove={handlers.onRemove}
        actions={<button type="button" aria-label="Substituir o segredo de Trabalho" onClick={handlers.onExtra} />}
        {...props}
      />
    </ul>,
  )
  return handlers
}

describe('ActiveItemRow (card de item em uso, OPE-159)', () => {
  it('o card inteiro é um botão nativo e acessível que ativa o item', () => {
    const handlers = setup()
    const card = screen.getByRole('button', { name: 'Usar a conta Trabalho' })
    expect(card.tagName).toBe('BUTTON')
    expect(card.getAttribute('tabindex')).not.toBe('-1')
    expect(card.classList.contains('cursor-pointer')).toBe(true)
    expect(screen.queryByText(/Usar esta/)).toBeNull()
    fireEvent.click(card)
    expect(handlers.onActivate).toHaveBeenCalledTimes(1)
  })

  it('item em uso mostra o selo, fica destacado e não oferece ativar de novo', () => {
    const handlers = setup({ active: true })
    expect(screen.getByText('Em uso')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Usar a conta Trabalho' })).toBeNull()
    const item = screen.getByRole('listitem')
    expect(item.getAttribute('data-active')).toBe('true')
    fireEvent.click(item)
    expect(handlers.onActivate).not.toHaveBeenCalled()
  })

  it('renomear, remover e ações extras não ativam o item', () => {
    const handlers = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Renomear Trabalho' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remover Trabalho' }))
    fireEvent.click(screen.getByRole('button', { name: 'Substituir o segredo de Trabalho' }))
    expect(handlers.onRename).toHaveBeenCalledTimes(1)
    expect(handlers.onRemove).toHaveBeenCalledTimes(1)
    expect(handlers.onExtra).toHaveBeenCalledTimes(1)
    expect(handlers.onActivate).not.toHaveBeenCalled()
  })

  it('ações ficam no DOM, ocultas até o hover ou o foco do card (visíveis no toque)', () => {
    setup()
    const group = screen.getByRole('button', { name: 'Renomear Trabalho' }).closest('[data-slot="item-actions"]')!
    for (const cls of ['opacity-0', 'group-hover:opacity-100', 'group-focus-within:opacity-100', '[@media(hover:none)]:opacity-100']) {
      expect(group.classList.contains(cls)).toBe(true)
    }
    expect(screen.getByRole('listitem').classList.contains('group')).toBe(true)
  })

  it('durante a edição não há card clicável e o conteúdo de edição aparece', () => {
    setup({ editing: <input aria-label="Nome da conta" /> })
    expect(screen.getByRole('textbox', { name: 'Nome da conta' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Usar a conta Trabalho' })).toBeNull()
  })

  it('ativação pendente desabilita o card e marca o item como ocupado', () => {
    const handlers = setup({ activateDisabled: true })
    const card = screen.getByRole('button', { name: 'Usar a conta Trabalho' })
    expect(card.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('listitem').getAttribute('aria-busy')).toBe('true')
    fireEvent.click(card)
    expect(handlers.onActivate).not.toHaveBeenCalled()
  })
})
