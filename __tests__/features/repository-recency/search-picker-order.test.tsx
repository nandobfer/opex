/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { SearchPicker } from '@/components/ui/search-picker'
import { orderByRecency } from '@/features/repository-recency/ordering'

interface Repo {
  id: string
  repo: string
}

const REPOS: Repo[] = [
  { id: 'a', repo: 'acme/relatorio-mensal' },
  { id: 'b', repo: 'acme/backup-automatico' },
  { id: 'c', repo: 'acme/planilha-de-custos' },
]

afterEach(() => cleanup())

/** Ordena os repositórios por uso recente, como as telas fazem. */
function renderPicker(recents: string[]) {
  render(
    <SearchPicker<Repo>
      trigger={<button type="button">Escolher repositório</button>}
      items={REPOS}
      orderItems={(items) => orderByRecency(items, recents, (item) => item.id)}
      getKey={(item) => item.id}
      renderItem={(item) => <span>{item.repo}</span>}
      onPick={vi.fn()}
      searchKeys={['repo']}
      searchLabel="Buscar repositório"
      listLabel="Repositórios vinculados"
      emptyText="Nenhum repositório vinculado"
      emptySearchText="Nenhum repositório encontrado"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Escolher repositório' }))
}

const options = () => screen.getAllByRole('option').map((option) => option.textContent)

describe('SearchPicker com repositórios ordenados por uso recente', () => {
  it('abre com os repositórios usados recentemente primeiro', () => {
    renderPicker(['c'])
    expect(options()).toEqual(['acme/planilha-de-custos', 'acme/relatorio-mensal', 'acme/backup-automatico'])
  })

  it('sem histórico, mantém a ordem recebida', () => {
    renderPicker([])
    expect(options()).toEqual(['acme/relatorio-mensal', 'acme/backup-automatico', 'acme/planilha-de-custos'])
  })

  it('na busca, a relevância prevalece sobre o uso recente', () => {
    renderPicker(['b'])
    fireEvent.change(screen.getByLabelText('Buscar repositório'), { target: { value: 'planilha de custos' } })
    expect(options()[0]).toBe('acme/planilha-de-custos')
  })

  it('a busca não promove um repositório que não corresponde ao termo', () => {
    renderPicker(['c'])
    fireEvent.change(screen.getByLabelText('Buscar repositório'), { target: { value: 'backup' } })
    expect(options()).toEqual(['acme/backup-automatico'])
  })
})
