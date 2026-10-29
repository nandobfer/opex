/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Aba "Build (N)": o resumo do build e o seletor (igual às abas Plano e Adversário) na mesma linha —
 * mais recente primeiro, só com 2+ builds — e o log do selecionado no terminal.
 */

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  stream: { view: { loaded: true, end: 10, status: 'running', message: null }, connected: true, error: false, retry: vi.fn() } as Record<string, unknown>,
  streamCalls: [] as (string | null)[],
  written: [] as string[],
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/agentic/hooks/useBuilds', () => ({
  useWorkbenchBuilds: () => mocks.query,
  useBuildLogStream: (_workbenchId: string, buildId: string | null, sink: { reset: (text: string) => void }) => {
    mocks.streamCalls.push(buildId)
    React.useEffect(() => sink.reset(`log de ${buildId}`), [buildId, sink])
    return mocks.stream
  },
}))
vi.mock('@/features/integrations/components/IntegrationConsole', () => ({
  IntegrationConsole: React.forwardRef(function Console(props: { ariaLabel?: string }, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({ clear: () => mocks.written.splice(0), write: (text: string) => mocks.written.push(text), search: vi.fn(), clearSearch: vi.fn() }))
    return <div role="log" aria-label={props.ariaLabel} />
  }),
}))

// O Select do Radix não abre no DOM de teste: um <select> nativo com as mesmas opções.
vi.mock('@/components/ui/select', () => {
  const Ctx = React.createContext<{ value: string; onValueChange: (value: string) => void }>({ value: '', onValueChange: () => {} })
  return {
    Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>,
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx)
      return (
        <select aria-label="Build da prévia" value={ctx.value} onChange={(event) => ctx.onValueChange(event.target.value)}>
          {children}
        </select>
      )
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  }
})

import { BuildLogView } from '@/features/agentic/components/workbench/BuildLogView'

const build = (id: string, number: number, status: string, patch: Record<string, unknown> = {}) => ({
  id, number, status, startedAt: '2026-10-28T13:00:00.000Z', endedAt: null, port: 4015, local: false, commands: [], logChars: 10, droppedChars: 0, message: null, ...patch,
})

beforeEach(() => {
  mocks.streamCalls = []
  mocks.written = []
  mocks.stream = { view: { loaded: true, end: 10, status: 'running', message: null }, connected: true, error: false, retry: vi.fn() }
  mocks.query = { isPending: false, isError: false, data: [build('b1', 1, 'failed', { message: 'O build falhou' }), build('b2', 2, 'running')], refetch: vi.fn() }
})

function Harness() {
  const [selected, setSelected] = React.useState<string | null>(null)
  return <BuildLogView workbenchId="w1" selectedId={selected} onSelect={setSelected} />
}

describe('BuildLogView', () => {
  it('seletor na linha do resumo: mais recente primeiro (atual), já selecionado, sem botões de aba', () => {
    render(<Harness />)
    const select = screen.getByRole('combobox', { name: 'Build da prévia' }) as HTMLSelectElement
    const options = Array.from(select.options).map((option) => option.textContent)
    expect(options[0]).toMatch(/^Build #2 · .* \(atual\)$/)
    expect(options[1]).toMatch(/^Build #1 · /)
    expect(select.value).toBe('b2')
    expect(select.parentElement?.textContent).toContain('Em andamento')
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.getByRole('log', { name: 'Log do build #2' })).toBeTruthy()
    expect(mocks.written).toEqual(['log de b2'])
  })

  it('com um só build não há seletor', () => {
    mocks.query = { ...mocks.query, data: [build('b1', 1, 'succeeded', { endedAt: '2026-10-28T13:05:00.000Z' })] }
    render(<Harness />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Concluído')).toBeTruthy()
    expect(screen.getByText('Porta 4015')).toBeTruthy()
  })

  it('trocar de build abre o log dele, com o status e a mensagem', () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Build da prévia' }), { target: { value: 'b1' } })
    expect(mocks.streamCalls.at(-1)).toBe('b1')
    expect(mocks.written).toEqual(['log de b1'])
    expect(screen.getByText('Falhou')).toBeTruthy()
    expect(screen.getByText('O build falhou')).toBeTruthy()
  })

  it('build sem saída mostra o estado vazio', () => {
    mocks.stream = { ...mocks.stream, view: { loaded: true, end: 0, status: 'interrupted', message: null } }
    mocks.query = { ...mocks.query, data: [build('b1', 1, 'interrupted')] }
    render(<Harness />)
    expect(screen.getByText('Este build não produziu saída.')).toBeTruthy()
  })

  it('erro ao listar os builds permite tentar novamente', () => {
    const refetch = vi.fn()
    mocks.query = { isPending: false, isError: true, data: undefined, refetch }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('erro no log do build permite tentar novamente', () => {
    const retry = vi.fn()
    mocks.stream = { ...mocks.stream, error: true, retry }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(retry).toHaveBeenCalled()
  })
})
