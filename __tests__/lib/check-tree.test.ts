import { describe, expect, it } from 'vitest'
import { countNodeLeaves, filterCheckNodes, getNodeState, toggleNode, type CheckBranch } from '@/lib/check-tree'

const tree: CheckBranch[] = [
  {
    id: 'tarefas',
    label: 'Tarefas',
    children: [
      { key: 'list_tasks', label: 'Listar tarefas' },
      { key: 'add_comment', label: 'Comentar tarefa', description: 'Registra um comentário' },
      { id: 'sub', label: 'Arquivo', children: [{ key: 'archive', label: 'Arquivar', sensitive: true }] },
    ],
  },
  { id: 'contexto', label: 'Contexto', children: [{ key: 'overview', label: 'Visão geral' }] },
]

describe('árvore de seleção (check-tree)', () => {
  it('estado tri-estado e contador por ramo, inclusive subgrupos', () => {
    const selected = new Set(['list_tasks'])
    expect(getNodeState(tree[0]!, selected)).toBe('indeterminate')
    expect(countNodeLeaves(tree[0]!, selected)).toEqual({ marked: 1, total: 3 })
    expect(getNodeState(tree[1]!, selected)).toBe('unchecked')
    expect(getNodeState(tree[0]!, new Set(['list_tasks', 'add_comment', 'archive']))).toBe('checked')
  })

  it('marcar o ramo marca todas as folhas; desmarcar preserva as travadas', () => {
    const all = toggleNode(tree[0]!, new Set(['overview']), true)
    expect([...all].sort()).toEqual(['add_comment', 'archive', 'list_tasks', 'overview'])
    const none = toggleNode(tree[0]!, all, false, new Set(['list_tasks']))
    expect([...none].sort()).toEqual(['list_tasks', 'overview'])
  })

  it('busca sem acento e sem caixa: ramo que casa fica inteiro, senão só os descendentes que casam', () => {
    expect(filterCheckNodes(tree, '')).toHaveLength(2)
    expect(filterCheckNodes(tree, 'contexto')).toEqual([tree[1]])
    const byLeaf = filterCheckNodes(tree, 'COMENTARIO') as CheckBranch[]
    expect(byLeaf).toHaveLength(1)
    expect(byLeaf[0]!.children.map((child) => child.label)).toEqual(['Comentar tarefa'])
    const nested = filterCheckNodes(tree, 'arquivar') as CheckBranch[]
    expect((nested[0]!.children[0] as CheckBranch).children).toHaveLength(1)
    expect(filterCheckNodes(tree, 'inexistente')).toEqual([])
  })
})
