/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { SearchPicker } from '@/components/ui/search-picker'

interface Fruit {
  id: string
  nome: string
}
const FRUITS: Fruit[] = [
  { id: 'a', nome: 'Abacaxi' },
  { id: 'b', nome: 'Banana' },
  { id: 'c', nome: 'Caju' },
]

afterEach(() => cleanup())

function renderPicker(onPick = vi.fn(), disabledIds: string[] = [], options: { items?: Fruit[]; loading?: boolean; fetching?: boolean } = {}) {
  render(
    <SearchPicker<Fruit>
      trigger={<button type="button">Escolher fruta</button>}
      items={options.items ?? FRUITS}
      loading={options.loading}
      fetching={options.fetching}
      getKey={(fruit) => fruit.id}
      renderItem={(fruit) => <span>{fruit.nome}</span>}
      onPick={onPick}
      searchKeys={['nome']}
      disabledReason={(fruit) => (disabledIds.includes(fruit.id) ? 'Já escolhida' : false)}
      searchLabel="Buscar fruta"
      listLabel="Frutas"
      emptyText="Nenhuma fruta"
      emptySearchText="Nenhuma fruta encontrada"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Escolher fruta' }))
  return onPick
}

describe('SearchPicker', () => {
  it('Enter com busca escolhe o primeiro resultado sem precisar de setas', () => {
    const onPick = renderPicker()
    const input = screen.getByLabelText('Buscar fruta')
    fireEvent.change(input, { target: { value: 'a' } })
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(FRUITS[0])
  })

  it('Enter busca o primeiro habilitado, ignorando resultado bloqueado', () => {
    const onPick = renderPicker(vi.fn(), ['a'])
    const input = screen.getByLabelText('Buscar fruta')
    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(FRUITS[1])
  })

  it('sem busca não escolhe arbitrariamente entre vários resultados', () => {
    const onPick = renderPicker()
    fireEvent.keyDown(screen.getByLabelText('Buscar fruta'), { key: 'Enter' })
    expect(onPick).not.toHaveBeenCalled()
  })

  it('sem busca preserva a escolha quando só uma opção está habilitada', () => {
    const onPick = renderPicker(vi.fn(), ['a', 'c'])
    fireEvent.keyDown(screen.getByLabelText('Buscar fruta'), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(FRUITS[1])
  })

  it.each([{ loading: true }, { fetching: true }, { items: [] }, { disabled: true }])('não escolhe durante carga, busca ou sem opções disponíveis: %j', (options) => {
    const onPick = renderPicker(vi.fn(), 'disabled' in options ? ['a', 'b', 'c'] : [], options)
    const input = screen.getByLabelText('Buscar fruta')
    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).not.toHaveBeenCalled()
  })

  it('navegação explícita tem prioridade sobre o primeiro resultado da busca', () => {
    const onPick = renderPicker()
    const input = screen.getByLabelText('Buscar fruta')
    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(FRUITS[1])
  })

  it('busca local tolera erro de digitação e mostra estado vazio sem resultado', () => {
    renderPicker()
    fireEvent.change(screen.getByLabelText('Buscar fruta'), { target: { value: 'banaan' } })
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Banana'])
    fireEvent.change(screen.getByLabelText('Buscar fruta'), { target: { value: 'zzzzzz' } })
    expect(screen.getByText('Nenhuma fruta encontrada')).toBeTruthy()
  })

  it('↑/↓ e Enter escolhem a opção ativa e fecham a busca', () => {
    const onPick = renderPicker()
    const input = screen.getByLabelText('Buscar fruta')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(FRUITS[1])
    expect(screen.queryByLabelText('Buscar fruta')).toBeNull()
  })

  it('opção bloqueada mostra o motivo e não pode ser escolhida', () => {
    const onPick = renderPicker(vi.fn(), ['a'])
    const blocked = screen.getAllByRole('option')[0]
    expect(blocked.getAttribute('title')).toBe('Já escolhida')
    expect(blocked.hasAttribute('disabled')).toBe(true)
    fireEvent.click(blocked)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('onCloseAutoFocus com preventDefault mantém o foco fora do gatilho', async () => {
    const destino = document.createElement('textarea')
    document.body.appendChild(destino)
    render(
      <SearchPicker<Fruit>
        trigger={<button type="button">Escolher fruta</button>}
        items={FRUITS}
        getKey={(fruit) => fruit.id}
        renderItem={(fruit) => <span>{fruit.nome}</span>}
        onPick={() => {}}
        searchKeys={['nome']}
        searchLabel="Buscar fruta"
        listLabel="Frutas"
        emptyText="Nenhuma fruta"
        emptySearchText="Nenhuma fruta encontrada"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          destino.focus()
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Escolher fruta' }))
    fireEvent.click(screen.getByRole('option', { name: 'Banana' }))
    await waitFor(() => expect(document.activeElement).toBe(destino))
    destino.remove()
  })
})
