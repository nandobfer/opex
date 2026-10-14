import { describe, expect, it } from 'vitest'
import { newlySelected, orderByRecency } from '@/features/repository-recency/ordering'

interface Repo {
  id: string
  repo: string
}

const REPOS: Repo[] = [
  { id: 'a', repo: 'acme/alpha' },
  { id: 'b', repo: 'acme/beta' },
  { id: 'c', repo: 'acme/gamma' },
]

const ids = (items: readonly Repo[]) => items.map((item) => item.id)

describe('ordenação dos repositórios por uso recente', () => {
  it('coloca os usados recentemente primeiro, na ordem do histórico', () => {
    expect(ids(orderByRecency(REPOS, ['c', 'a'], (item) => item.id))).toEqual(['c', 'a', 'b'])
  })

  it('sem histórico, mantém a ordem original', () => {
    expect(ids(orderByRecency(REPOS, [], (item) => item.id))).toEqual(['a', 'b', 'c'])
  })

  it('mantém a ordem original dos não usados e não muta a lista recebida', () => {
    const before = [...REPOS]
    const ordered = orderByRecency(REPOS, ['a'], (item) => item.id)
    expect(ids(ordered)).toEqual(['a', 'b', 'c'])
    expect(REPOS).toEqual(before)
    expect(ordered).not.toBe(REPOS)
  })

  it('ignora ids repetidos no histórico e ids fora da lista', () => {
    expect(ids(orderByRecency(REPOS, ['b', 'b', 'inexistente', 'a'], (item) => item.id))).toEqual(['b', 'a', 'c'])
  })

  it('registra apenas os valores que entraram na seleção', () => {
    expect(newlySelected([], ['a', 'b'])).toEqual(['a', 'b'])
    expect(newlySelected(['a', 'b'], ['a', 'b', 'c'])).toEqual(['c'])
    expect(newlySelected(['a', 'b'], ['b'])).toEqual([])
    expect(newlySelected(['a'], [])).toEqual([])
  })
})
