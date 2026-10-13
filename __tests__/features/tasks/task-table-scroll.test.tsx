/** @vitest-environment jsdom */

import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

import { sortTaskRows, TaskTable, TASK_TABLE_ROW_HEIGHT } from '@/features/tasks/components/TaskTable'
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

const task = (n: number): TaskDto => ({
  id: String(n).padStart(24, '0'),
  code: `OPX-${n}`,
  columnId: 'todo',
  order: n,
  title: `Tarefa ${n}`,
  summary: null,
  taskType: 'feature',
  priority: 'high',
  archived: false,
  project: { id: 'p1', name: 'CRM', repo: 'o/crm', sigla: 'CRM' },
  createdAt: null,
  updatedAt: null,
})

function Table({ tasks, select = false }: { tasks: TaskDto[]; select?: boolean }) {
  const selection = useTaskSelection(tasks.map((t) => t.id))
  return (
    <>
      {select && (
        <button type="button" onClick={() => selection.setMany([tasks[0]!.id], true)}>
          selecionar
        </button>
      )}
      <TaskTable
        tasks={tasks}
        columns={buildBoardColumns(board)}
        sort={{ column: 'code', direction: 'asc' }}
        onSortChange={vi.fn()}
        movingId={null}
        updatingId={null}
        selection={selection}
        onMove={vi.fn()}
        onUpdate={vi.fn()}
        onOpen={vi.fn()}
      />
    </>
  )
}

/** Como no app: a página rola pelo `<main id="main-content">` do AppShell. */
const inPage = (ui: React.ReactNode) => render(<main id={APP_SCROLL_CONTAINER_ID}>{ui}</main>)
const renderedCodes = () => screen.queryAllByRole('row', { name: /^Abrir OPX-/ }).map((row) => row.getAttribute('aria-label')!.replace('Abrir ', ''))

describe('TaskTable rolando com a página', () => {
  it('sem altura máxima nem rolagem própria; cabeçalho fixo no topo da página', () => {
    inPage(<Table tasks={[task(1), task(2)]} />)
    const wrapper = screen.getByTestId('task-table')
    expect(wrapper.className).not.toMatch(/max-h|overflow/)
    const thead = wrapper.querySelector('thead')!
    expect(thead.className).toContain('sticky')
    expect(thead.className).toContain('top-0')
  })

  it('acima de 50 linhas desenha só as visíveis e acompanha a rolagem da página (#main-content)', async () => {
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800)
    const tasks = Array.from({ length: 300 }, (_, i) => task(i + 1))
    inPage(<Table tasks={tasks} />)
    const first = renderedCodes()
    expect(first.length).toBeGreaterThan(0)
    expect(first.length).toBeLessThan(300)
    expect(first[0]).toBe('OPX-1')

    const main = document.getElementById(APP_SCROLL_CONTAINER_ID)!
    await act(async () => {
      Object.defineProperty(main, 'scrollTop', { configurable: true, value: TASK_TABLE_ROW_HEIGHT * 200 })
      const table = screen.getByTestId('task-table')
      table.getBoundingClientRect = () => ({ top: -main.scrollTop, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: -main.scrollTop, toJSON: () => ({}) })
      fireEvent.scroll(main)
    })
    const after = renderedCodes()
    expect(after).toContain('OPX-201')
    expect(after).not.toContain('OPX-1')
    height.mockRestore()
  })

  it('colunas somem em telas estreitas (mesma classe no cabeçalho e na célula); prioridade vira ponto', () => {
    inPage(<Table tasks={[task(1)]} />)
    const header = (name: RegExp) => screen.getByRole('columnheader', { name })
    expect(header(/Atualizada/).className).toContain('hidden xl:table-cell')
    expect(header(/Tipo/).className).toContain('hidden lg:table-cell')
    expect(header(/Repositório/).className).toContain('hidden lg:table-cell')
    expect(header(/Issue/).className).toContain('hidden sm:table-cell')
    expect(header(/Prioridade/).className).toContain('hidden md:table-cell')
    expect(header(/Coluna/).className).not.toContain('hidden')
    expect(screen.getByTitle('o/crm').className).toContain('hidden lg:table-cell')
  })

  it('título: tooltip com o texto inteiro ao passar o mouse', async () => {
    const long = { ...task(1), title: 'Um título bem longo que não cabe na coluna da tabela e precisa aparecer inteiro' }
    inPage(<Table tasks={[long]} />)
    const cell = screen.getByText(long.title)
    expect(cell.className).toContain('truncate')
    await act(async () => {
      fireEvent.pointerMove(cell)
      fireEvent.focus(cell)
    })
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip.textContent).toBe(long.title)
  })

  it('mostra a prévia do resumo sob o título quando presente', () => {
    const withSummary = { ...task(1), summary: 'Exporta as tarefas em CSV' }
    inPage(<Table tasks={[withSummary]} />)
    const cell = screen.getByText('Exporta as tarefas em CSV')
    expect(cell.className).toContain('truncate')
    expect(cell.getAttribute('title')).toBe('Exporta as tarefas em CSV')
  })

  it('coluna Issue: link com #N depois do código; "—" sem issue', () => {
    const withIssue = { ...task(1), issue: { url: 'https://github.com/sipal/app/issues/42', repo: 'sipal/app', number: 42, state: 'open' as const, notice: null } }
    inPage(<Table tasks={[withIssue, task(2)]} />)
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers.indexOf('Issue')).toBe(headers.indexOf('Código') + 1)
    const link = screen.getByRole('link', { name: 'Abrir issue sipal/app#42 no GitHub' })
    expect(link.textContent).toBe('#42')
    expect(link.closest('td')!.className).toContain('hidden sm:table-cell')
    const row2 = screen.getByRole('row', { name: 'Abrir OPX-2' })
    expect(row2.querySelector('a')).toBeNull()
  })

  it('ordena pela issue (número); sem issue fica depois na ordem crescente', () => {
    const issue = (number: number) => ({ url: `https://github.com/sipal/app/issues/${number}`, repo: 'sipal/app', number, state: 'open' as const, notice: null })
    const tasks = [task(1), { ...task(2), issue: issue(30) }, { ...task(3), issue: issue(7) }]
    expect(sortTaskRows(tasks, { column: 'issue', direction: 'asc' }).map((t) => t.code)).toEqual(['OPX-3', 'OPX-2', 'OPX-1'])
  })

  it('com seleção, abre espaço no fim para a barra de ações flutuante', () => {
    inPage(<Table tasks={[task(1), task(2)]} select />)
    expect(screen.getByTestId('task-table').className).not.toContain('pb-24')
    fireEvent.click(screen.getByRole('button', { name: 'selecionar' }))
    expect(screen.getByTestId('task-table').className).toContain('pb-24')
  })

  it('é a apresentação de desktop: sem colapso mobile (o celular usa cards compactos, TaskCompactList)', () => {
    inPage(<Table tasks={[task(1)]} />)
    const wrapper = screen.getByTestId('task-table')
    expect(wrapper.querySelector('thead')!.className).not.toContain('max-md:hidden')
    expect(wrapper.querySelector('tbody')!.className).not.toContain('max-md:block')
    expect(wrapper.querySelector('table')!.className).not.toContain('max-md:block')
    expect(screen.queryByTestId('task-compact-list')).toBeNull()
  })
})
