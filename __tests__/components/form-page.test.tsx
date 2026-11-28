/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Link from 'next/link'
import { Boxes, Tag } from 'lucide-react'
import { framerMotionMock } from '../helpers/framer-motion'

/** Páginas de formulário (OPE-211): cabeçalho, índice das seções e o guarda de alterações não salvas. */

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }), usePathname: () => '/x', useSearchParams: () => new URLSearchParams() }))

import { FormPageHeader } from '@/components/form-page/FormPageHeader'
import { FormSectionNav } from '@/components/form-page/FormSectionNav'
import { useUnsavedChangesGuard } from '@/components/form-page/useUnsavedChangesGuard'

function Guarded({ dirty, action }: { dirty: boolean; action: () => void }) {
  const { guard, dialog } = useUnsavedChangesGuard(dirty)
  return (
    <>
      <button type="button" onClick={() => guard(action)}>
        Cancelar
      </button>
      <Link href="/outra">Outra página</Link>
      {dialog}
    </>
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('FormPageHeader', () => {
  it('voltar, título, descrição, status e ações', () => {
    render(<FormPageHeader backHref="/lista" backLabel="Lista" title="Editar X" description="Desc" status={<span>Tudo salvo</span>} actions={<button type="button">Salvar</button>} />)
    expect(screen.getByRole('link', { name: /Lista/ }).getAttribute('href')).toBe('/lista')
    expect(screen.getByRole('heading', { name: 'Editar X' })).toBeTruthy()
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeTruthy()
  })
})

describe('FormSectionNav', () => {
  it('marca erro e alteração; clicar rola até a seção e a marca como atual', () => {
    render(
      <>
        <FormSectionNav label="Seções" items={[{ id: 'a', label: 'Identificação', icon: Tag, dirty: true }, { id: 'b', label: 'Serviços', icon: Boxes, error: true }]} />
        <section id="a" />
        <section id="b" />
      </>,
    )
    expect(screen.getByLabelText('alterada')).toBeTruthy()
    expect(screen.getByLabelText('com erro')).toBeTruthy()
    const target = document.getElementById('b')!
    const scroll = vi.fn()
    target.scrollIntoView = scroll
    fireEvent.click(screen.getByRole('link', { name: /Serviços/ }))
    expect(scroll).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /Serviços/ }).getAttribute('aria-current')).toBe('location')
  })
})

describe('useUnsavedChangesGuard', () => {
  it('sem alterações: sai direto; com alterações: pede confirmação e só sai ao descartar', () => {
    const action = vi.fn()
    const { rerender } = render(<Guarded dirty={false} action={action} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(action).toHaveBeenCalledTimes(1)
    rerender(<Guarded dirty action={action} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(action).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Descartar alterações?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar e sair' }))
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('link interno do app com alterações: confirma antes de navegar', () => {
    render(<Guarded dirty action={vi.fn()} />)
    fireEvent.click(screen.getByRole('link', { name: 'Outra página' }))
    expect(screen.getByText('Descartar alterações?')).toBeTruthy()
    expect(nav.push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar e sair' }))
    expect(nav.push).toHaveBeenCalledWith('/outra')
  })

  it('beforeunload só com alterações', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const { rerender } = render(<Guarded dirty={false} action={vi.fn()} />)
    expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(false)
    rerender(<Guarded dirty action={vi.fn()} />)
    expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true)
    add.mockRestore()
  })
})
