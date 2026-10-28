/** @vitest-environment happy-dom */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({ progress: undefined as undefined | (() => { running: boolean; runState: string; waitingFor: string | null; centralId: string }) }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/time/components/TimerProvider', () => ({
  useTimer: () => ({ active: [], timerOf: () => undefined }),
}))
vi.mock('@/features/agentic/components/WorkbenchProgressProvider', () => ({
  useWorkbenchProgress: () => (mocks.progress ? { items: [], progressOf: mocks.progress } : null),
}))

import { TaskCardView } from '@/features/tasks/components/TaskCard'

const task = (overrides: Partial<TaskDto> = {}): TaskDto => ({
  id: 'a'.repeat(24),
  code: 'OPX-1',
  columnId: 'todo',
  order: 0,
  title: 'Tarefa com issue',
  summary: null,
  taskType: 'feature',
  priority: 'high',
  archived: false,
  project: { id: 'p1', name: 'Portal', repo: 'o/portal', sigla: 'POR' },
  createdAt: null,
  updatedAt: null,
  issue: { url: 'https://github.com/sipal/app/issues/123', repo: 'sipal/app', number: 123, state: 'open', notice: null },
  ...overrides,
})

const issueLink = () => screen.queryByRole('link', { name: 'Abrir issue sipal/app#123 no GitHub' })

beforeEach(() => {
  mocks.progress = undefined
})

describe('TaskCardView: issue no rodapé', () => {
  it('mostra o botão da issue com #N no rodapé', () => {
    render(<TaskCardView task={task()} />)
    const link = issueLink()!
    expect(link.getAttribute('href')).toBe('https://github.com/sipal/app/issues/123')
    expect(link.textContent).toBe('#123')
    const header = screen.getByText('OPX-1').parentElement!
    expect(within(header).queryByRole('link')).toBeNull()
  })

  it('clicar na issue não abre a tarefa', () => {
    const onOpen = vi.fn()
    render(<TaskCardView task={task()} onOpen={onOpen} />)
    fireEvent.click(issueLink()!)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('sem issue vinculada ou durante o arraste, não mostra o botão', () => {
    const { unmount } = render(<TaskCardView task={task({ issue: null })} />)
    expect(screen.queryByRole('link')).toBeNull()
    unmount()
    render(<TaskCardView task={task()} dragging />)
    expect(issueLink()).toBeNull()
  })
})

describe('TaskCardView: resumo de IA', () => {
  it('mostra a linha do resumo quando presente', () => {
    render(<TaskCardView task={task({ summary: 'Adiciona exportação em CSV' })} />)
    expect(screen.getByText('Adiciona exportação em CSV')).toBeTruthy()
  })

  it('sem resumo, não mostra a linha', () => {
    render(<TaskCardView task={task({ summary: null })} />)
    expect(screen.queryByText('Adiciona exportação em CSV')).toBeNull()
  })
})

describe('TaskCardView: prioridade e tipo no rodapé', () => {
  it('mostra a prioridade só como ícone colorido, sem o rótulo', () => {
    render(<TaskCardView task={task({ priority: 'high' })} />)
    const icon = screen.getByRole('img', { name: 'Prioridade Alta' })
    expect(icon.className).toContain('text-orange-300')
    expect(screen.queryByText('Alta')).toBeNull()
  })

  it('mostra o chip de tipo no rodapé e não no cabeçalho', () => {
    render(<TaskCardView task={task({ taskType: 'feature' })} />)
    const footer = screen.getByTestId('task-card-footer')
    const header = screen.getByTestId('task-card-header')
    expect(within(footer).getByText('Feature')).toBeTruthy()
    expect(within(header).queryByText('Feature')).toBeNull()
  })

  it('mantém o "Arquivada" no rodapé junto do ícone de prioridade baixa', () => {
    render(<TaskCardView task={task({ priority: 'low', archived: true })} />)
    const footer = screen.getByTestId('task-card-footer')
    expect(within(footer).getByRole('img', { name: 'Prioridade Baixa' })).toBeTruthy()
    expect(within(footer).getByText('Arquivada')).toBeTruthy()
  })
})

describe('TaskCardView: mesa aguardando ação', () => {
  const waitingLink = (code = 'OPX-1', reason = 'Aguardando revisão do plano') => screen.queryByRole('link', { name: `Abrir a mesa de ${code} — ${reason}` })

  it('destaca o card em warning e mostra o motivo', () => {
    mocks.progress = () => ({ running: false, runState: 'idle', waitingFor: 'Aguardando revisão do plano', centralId: 'c1' })
    render(<TaskCardView task={task()} />)
    expect(screen.getByText('Aguardando revisão do plano')).toBeTruthy()
  })

  it('o motivo é um link direto para a mesa de trabalho', () => {
    mocks.progress = () => ({ running: false, runState: 'idle', waitingFor: 'Aguardando revisão do plano', centralId: 'c1' })
    render(<TaskCardView task={task()} />)
    const link = waitingLink()!
    expect(link.getAttribute('href')).toBe(`/desenvolvimento/${task().id}`)
  })

  it('clicar no motivo abre a mesa e não a tarefa', () => {
    mocks.progress = () => ({ running: false, runState: 'idle', waitingFor: 'Aguardando revisão do plano', centralId: 'c1' })
    const onOpen = vi.fn()
    render(<TaskCardView task={task()} onOpen={onOpen} />)
    fireEvent.click(waitingLink()!)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('falha/interrupção também é link para a mesa', () => {
    mocks.progress = () => ({ running: false, runState: 'failed', waitingFor: 'A etapa falhou — use Tentar novamente', centralId: 'c1' })
    render(<TaskCardView task={task()} />)
    const link = waitingLink('OPX-1', 'A etapa falhou — use Tentar novamente')!
    expect(link.getAttribute('href')).toBe(`/desenvolvimento/${task().id}`)
    expect(link.className).toContain('text-destructive')
  })

  it('mesa executando não mostra o motivo de espera', () => {
    mocks.progress = () => ({ running: true, runState: 'running', waitingFor: null, centralId: 'c1' })
    render(<TaskCardView task={task()} />)
    expect(screen.queryByText('Aguardando revisão do plano')).toBeNull()
    expect(screen.queryByRole('link', { name: /Abrir a mesa de OPX-1/ })).toBeNull()
  })
})
