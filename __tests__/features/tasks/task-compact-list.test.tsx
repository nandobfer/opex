/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

import { TaskCompactList } from '@/features/tasks/components/TaskCompactList'
import { nextTableSort } from '@/features/tasks/components/table-columns'
import { useTaskSelection } from '@/features/tasks/hooks/useTaskSelection'
import { buildBoardColumns } from '@/features/tasks/board'
import { APP_SCROLL_CONTAINER_ID } from '@/hooks/usePageVirtualizer'

const board = {
  columns: [
    { key: 'todo', name: 'A Fazer', color: 'zinc' as const, icon: 'inbox' as const, description: null, wipLimit: null },
    { key: 'doing', name: 'Em Andamento', color: 'sky' as const, icon: 'clock' as const, description: null, wipLimit: null },
  ],
  layout: ['todo', 'doing'],
}
const columns = buildBoardColumns(board)

const task = (n: number, overrides: Partial<TaskDto> = {}): TaskDto => ({
  id: String(n).padStart(24, '0'),
  code: `OPX-${n}`,
  columnId: 'todo',
  order: n,
  title: `Tarefa ${n}`,
  summary: null,
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: { id: 'p1', name: 'CRM', repo: 'o/crm', sigla: 'CRM' },
  createdAt: null,
  updatedAt: null,
  ...overrides,
})

function List({
  tasks,
  sort = { column: 'code' as const, direction: 'asc' as const },
  onSortChange = vi.fn(),
  onOpen = vi.fn(),
  onUpdate = vi.fn(),
  select = false,
}: {
  tasks: TaskDto[]
  sort?: { column: 'code' | 'title'; direction: 'asc' | 'desc' }
  onSortChange?: (sort: { column: 'code' | 'title'; direction: 'asc' | 'desc' }) => void
  onOpen?: (task: TaskDto) => void
  onUpdate?: (task: TaskDto, change: { priority: TaskDto['priority'] }) => void
  select?: boolean
}) {
  const selection = useTaskSelection(tasks.map((t) => t.id))
  return (
    <>
      {select && (
        <button type="button" onClick={() => selection.setMany([tasks[0]!.id], true)}>
          selecionar
        </button>
      )}
      <TaskCompactList
        tasks={tasks}
        columns={columns}
        sort={sort as never}
        onSortChange={onSortChange as never}
        movingId={null}
        updatingId={null}
        selection={selection}
        onMove={vi.fn()}
        onUpdate={onUpdate as never}
        onOpen={onOpen}
      />
    </>
  )
}

const inPage = (ui: React.ReactNode) => render(<main id={APP_SCROLL_CONTAINER_ID}>{ui}</main>)
const openLabels = () => screen.queryAllByRole('button', { name: /^Abrir OPX-/ }).map((el) => el.getAttribute('aria-label')!)

describe('TaskCompactList — cards compactos do celular', () => {
  it('não renderiza tabela: cada tarefa vira um card com código, título e controles', () => {
    inPage(<List tasks={[task(1)]} />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('columnheader')).toBeNull()
    expect(openLabels()).toEqual(['Abrir OPX-1: Tarefa 1'])
    expect(screen.getByText('Tarefa 1')).toBeTruthy()
    // Coluna e prioridade continuam editáveis dentro do card.
    expect(screen.getByRole('button', { name: 'Coluna: mover OPX-1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Prioridade: alterar' })).toBeTruthy()
  })

  it('clicar no card abre a tarefa; o checkbox seleciona sem abrir', () => {
    const onOpen = vi.fn()
    inPage(<List tasks={[task(1), task(2)]} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir OPX-2: Tarefa 2' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0]![0].code).toBe('OPX-2')

    const checkbox = screen.getByRole('checkbox', { name: 'Selecionar OPX-2' })
    fireEvent.click(checkbox)
    expect(checkbox.getAttribute('aria-checked')).toBe('true')
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('"selecionar todas" marca todos os cards e reserva espaço para a barra flutuante', () => {
    inPage(<List tasks={[task(1), task(2), task(3)]} />)
    expect(screen.getByTestId('task-compact-list').className).not.toContain('pb-24')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas' }))
    for (const n of [1, 2, 3]) {
      expect(screen.getByRole('checkbox', { name: `Selecionar OPX-${n}` }).getAttribute('aria-checked')).toBe('true')
    }
    expect(screen.getByTestId('task-compact-list').className).toContain('pb-24')
  })

  it('títulos e resumos longos ficam contidos (limite de linhas, sem sobreposição)', () => {
    const long = task(1, {
      title: 'Um título bem longo que precisa quebrar em várias linhas dentro do card compacto do celular',
      summary: 'Um resumo ainda mais longo que também precisa ficar contido em uma linha só, sem empurrar os selos',
    })
    inPage(<List tasks={[long]} />)

    const title = screen.getByText(long.title)
    expect(title.className).toContain('line-clamp-2')
    expect(title.className).toContain('break-words')
    const summary = screen.getByText(long.summary!)
    expect(summary.className).toContain('line-clamp-1')
    expect(summary.className).toContain('break-words')
  })

  it('ordena pelos cards conforme a ordenação escolhida e mostra o critério no controle', () => {
    inPage(<List tasks={[task(1), task(2), task(3)]} sort={{ column: 'title', direction: 'desc' }} />)
    expect(screen.getByRole('button', { name: /Ordenar: Título/ })).toBeTruthy()
    expect(openLabels()).toEqual(['Abrir OPX-3: Tarefa 3', 'Abrir OPX-2: Tarefa 2', 'Abrir OPX-1: Tarefa 1'])
  })

  it('acima de 50 cards virtualiza com medição real (sem altura fixa de linha)', () => {
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800)
    const tasks = Array.from({ length: 300 }, (_, i) => task(i + 1))
    inPage(<List tasks={tasks} />)

    expect(openLabels().length).toBeGreaterThan(0)
    // O wrapper de cada card é marcado para o TanStack Virtual medir a altura real...
    expect(document.querySelectorAll('[data-index]').length).toBeGreaterThan(0)
    // ...e nenhum card recebe altura fixa (o antigo 64px da tabela causava sobreposição no celular).
    expect(document.querySelector('[data-index][style*="height"]')).toBeNull()
    height.mockRestore()
  })

  it('até 50 cards não virtualiza (todos montados, com animação)', () => {
    inPage(<List tasks={[task(1), task(2)]} />)
    expect(document.querySelectorAll('[data-index]').length).toBe(0)
    expect(openLabels()).toHaveLength(2)
  })
})

describe('nextTableSort', () => {
  it('alterna a direção na mesma coluna e começa crescente (decrescente em Atualizada)', () => {
    expect(nextTableSort({ column: 'code', direction: 'asc' }, 'code')).toEqual({ column: 'code', direction: 'desc' })
    expect(nextTableSort({ column: 'code', direction: 'desc' }, 'code')).toEqual({ column: 'code', direction: 'asc' })
    expect(nextTableSort({ column: 'code', direction: 'asc' }, 'priority')).toEqual({ column: 'priority', direction: 'asc' })
    expect(nextTableSort({ column: 'code', direction: 'asc' }, 'updatedAt')).toEqual({ column: 'updatedAt', direction: 'desc' })
  })
})
