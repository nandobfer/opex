/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('regressão (F5): voltar do navegador com alterações pede confirmação e fica na página; descartar volta duas entradas', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const { rerender } = render(<Guarded dirty={false} action={vi.fn()} />)
    expect(push).not.toHaveBeenCalled()
    rerender(<Guarded dirty action={vi.fn()} />)
    // Com alterações: uma sentinela com a mesma URL.
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0]![2]).toBe(window.location.href)
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(screen.getByText('Descartar alterações?')).toBeTruthy()
    // Fica na página: a sentinela volta.
    expect(push).toHaveBeenCalledTimes(2)
    expect(go).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
    expect(go).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar e sair' }))
    expect(go).toHaveBeenCalledWith(-2)
    expect(back).not.toHaveBeenCalled()
    push.mockRestore()
    go.mockRestore()
    back.mockRestore()
  })

  it('depois de salvar (sem alterações), o voltar que consome a sentinela segue direto, sem perguntar', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const { rerender } = render(<Guarded dirty action={vi.fn()} />)
    rerender(<Guarded dirty={false} action={vi.fn()} />)
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(screen.queryByText('Descartar alterações?')).toBeNull()
    expect(back).toHaveBeenCalledTimes(1)
    // Outro voltar (já sem sentinela): o guarda não interfere.
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(back).toHaveBeenCalledTimes(1)
    push.mockRestore()
    back.mockRestore()
  })

  /**
   * Histórico simulado (pilha de URLs com índice): `pushState` corta o "avançar" e empilha, `back`/`go` mudam o
   * índice e disparam `popstate` de forma assíncrona, como o navegador; o `router.push` empilha o destino.
   */
  function fakeHistory(start: string[]) {
    const stack = [...start]
    let index = stack.length - 1
    const move = (delta: number) => {
      index = Math.max(0, Math.min(stack.length - 1, index + delta))
      setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 0)
    }
    const spies = [
      vi.spyOn(window.history, 'pushState').mockImplementation(() => {
        stack.splice(index + 1, Infinity, stack[index]!)
        index = stack.length - 1
      }),
      vi.spyOn(window.history, 'back').mockImplementation(() => move(-1)),
      vi.spyOn(window.history, 'go').mockImplementation((delta?: number) => move(delta ?? 0)),
    ]
    nav.push.mockImplementation((href: string) => {
      stack.splice(index + 1, Infinity, href)
      index = stack.length - 1
    })
    return {
      current: () => stack[index],
      entries: () => stack.slice(0, index + 1),
      restore: () => spies.forEach((spy) => spy.mockRestore()),
    }
  }
  const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })

  it('regressão (F7): Cancelar confirmado consome a sentinela; um voltar a partir do destino chega ao editor, sem duplicata', async () => {
    const history = fakeHistory(['/lista', '/editor'])
    try {
      const { rerender } = render(<Guarded dirty={false} action={() => nav.push('/lista')} />)
      rerender(<Guarded dirty action={() => nav.push('/lista')} />)
      expect(history.entries()).toEqual(['/lista', '/editor', '/editor'])
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      fireEvent.click(screen.getByRole('button', { name: 'Descartar e sair' }))
      await flush()
      expect(history.entries()).toEqual(['/lista', '/editor', '/lista'])
      cleanup()
      window.history.back()
      await flush()
      expect(history.current()).toBe('/editor')
      window.history.back()
      await flush()
      expect(history.current()).toBe('/lista')
    } finally {
      history.restore()
      nav.push.mockReset()
    }
  })

  it('regressão (F7): link interno confirmado também não deixa o editor duplicado', async () => {
    const history = fakeHistory(['/lista', '/editor'])
    try {
      render(<Guarded dirty action={vi.fn()} />)
      fireEvent.click(screen.getByRole('link', { name: 'Outra página' }))
      fireEvent.click(screen.getByRole('button', { name: 'Descartar e sair' }))
      await flush()
      expect(history.entries()).toEqual(['/lista', '/editor', '/outra'])
      expect(nav.push).toHaveBeenCalledTimes(1)
    } finally {
      history.restore()
      nav.push.mockReset()
    }
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
