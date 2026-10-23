/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import { defaultCentralConfig } from '@/features/agentic/schemas'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), useTaskDetail: vi.fn(), updateTask: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/lib/api', () => ({ apiErrorMessage: (_error: unknown, fallback: string) => fallback }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  useStartWorkbench: () => ({ mutate: mocks.mutate, isPending: false }),
  useAgenticSettings: () => ({ data: { availability: { available: true, reason: null } } }),
  useCentralQueue: () => ({ data: [] }),
}))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useTaskDetail: mocks.useTaskDetail, useUpdateTask: () => ({ mutate: mocks.updateTask, isPending: false }) }))

import { StartWorkbench } from '@/features/agentic/components/workbench/StartWorkbench'
import type { CentralDto } from '@/features/agentic/types'
import type { TaskDetailDto } from '@/features/tasks/types'

const central = (patch: Partial<CentralDto> = {}): CentralDto => ({
  id: 'c1',
  projectId: 'p1',
  projectName: 'Portal',
  sigla: 'APP',
  config: defaultCentralConfig('/home/u/app'),
  repo: 'org/app',
  repoUrl: null,
  lastTest: null,
  activeWorkbenches: 0,
  runningWorkbenches: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...patch,
})

const task = (patch: Partial<TaskDetailDto> = {}): TaskDetailDto => ({
  id: 't1',
  code: 'OPE-10',
  columnId: 'col',
  order: 0,
  title: 'Mesa de trabalho — estado inicial',
  taskType: null,
  priority: 'medium',
  archived: false,
  project: { id: 'p1', name: 'Portal', repo: 'org/app', sigla: 'OPX' },
  createdAt: null,
  updatedAt: null,
  description: 'Mostrar título e descrição da tarefa na abertura da mesa.',
  technicalSpec: null,
  comments: [],
  history: [],
  timeLogs: [],
  totalTimeLogged: 0,
  agenticFlow: 'preview',
  ...patch,
})

const renderStart = (patch: Partial<CentralDto> = {}, taskPatch: Partial<TaskDetailDto> = {}) => {
  mocks.useTaskDetail.mockReturnValue({ data: task(taskPatch), isLoading: false, error: null })
  return render(<StartWorkbench central={central(patch)} taskId="t1" />)
}

beforeEach(() => vi.clearAllMocks())

describe('StartWorkbench', () => {
  it('mostra a descrição da tarefa e envia as informações adicionais ao abrir', () => {
    renderStart()
    expect(screen.getByText('Mesa de trabalho — estado inicial')).toBeTruthy()
    expect(screen.getByText('Mostrar título e descrição da tarefa na abertura da mesa.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Informações adicionais (opcional)'), { target: { value: 'Use o componente X' } })
    fireEvent.click(screen.getByRole('button', { name: /Abrir mesa e gerar o plano/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ centralId: 'c1', taskId: 't1', text: 'Use o componente X' })
  })

  it('sem informações adicionais envia o texto indefinido', () => {
    renderStart()
    expect(screen.queryByLabelText('Informações adicionais (opcional)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Abrir mesa e gerar o plano/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ centralId: 'c1', taskId: 't1', text: undefined })
  })

  it('central desativada desabilita o botão com o motivo', () => {
    renderStart({ config: { ...defaultCentralConfig('/home/u/app'), enabled: false } })
    const button = screen.getByRole('button', { name: /Abrir mesa e gerar o plano/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText('A central está desativada')).toBeTruthy()
  })

  it('tarefa de outro projeto desabilita o botão com o motivo', () => {
    renderStart({}, { project: { id: 'p9', name: 'Outro', repo: 'org/x', sigla: 'OUT' } })
    const button = screen.getByRole('button', { name: /Abrir mesa e gerar o plano/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(/A tarefa não é do projeto Portal/)).toBeTruthy()
  })
})

describe('StartWorkbench · Gerar prévia', () => {
  const flow = () => screen.getByRole('switch') as HTMLButtonElement

  it('chave "Gerar prévia" começa ligada (Publicar prévia, o padrão)', () => {
    renderStart()
    expect(screen.getByText('Gerar prévia')).toBeTruthy()
    expect(flow().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('workbench-flow-status').textContent).toBe('Ligada')
  })

  it('tarefa salva com PR automático mostra a chave desligada', () => {
    renderStart({}, { agenticFlow: 'auto_pr' })
    expect(flow().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('workbench-flow-status').textContent).toBe('Desligada')
  })

  it('desligar grava o fluxo PR automático na tarefa, otimista e imediatamente', () => {
    renderStart()
    fireEvent.click(flow())
    expect(mocks.updateTask).toHaveBeenCalledWith({
      task: { id: 't1', code: 'OPE-10' },
      body: { agenticFlow: 'auto_pr' },
      patch: { agenticFlow: 'auto_pr' },
    })
  })

  it('religar volta ao padrão Publicar prévia', () => {
    renderStart({}, { agenticFlow: 'auto_pr' })
    fireEvent.click(flow())
    expect(mocks.updateTask).toHaveBeenCalledWith({
      task: { id: 't1', code: 'OPE-10' },
      body: { agenticFlow: 'preview' },
      patch: { agenticFlow: 'preview' },
    })
  })

  it('tarefa sem escolha segue o padrão da central (Publicar prévia) e oferece personalizar', () => {
    renderStart({}, { agenticFlow: null })
    expect(flow().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('workbench-flow-status').textContent).toBe('Ligada')
    expect(screen.getByText(/Seguindo o padrão da central/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Usar padrão da central' })).toBeNull()
  })

  it('central configurada em PR automático é o padrão herdado pela tarefa', () => {
    const base = defaultCentralConfig('/home/u/app')
    renderStart({ config: { ...base, environment: { ...base.environment, publishPreview: false } } }, { agenticFlow: null })
    expect(flow().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('workbench-flow-status').textContent).toBe('Desligada')
    expect(screen.getByText(/Seguindo o padrão da central/)).toBeTruthy()
  })

  it('a escolha da tarefa vence o padrão da central e pode voltar a herdar', () => {
    const base = defaultCentralConfig('/home/u/app')
    renderStart({ config: { ...base, environment: { ...base.environment, publishPreview: false } } }, { agenticFlow: 'preview' })
    expect(flow().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/Fluxo escolhido só para esta tarefa/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Usar padrão da central' }))
    expect(mocks.updateTask).toHaveBeenCalledWith({
      task: { id: 't1', code: 'OPE-10' },
      body: { agenticFlow: null },
      patch: { agenticFlow: null },
    })
  })
})
