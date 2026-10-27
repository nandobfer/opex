/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), reconnect: vi.fn(), openFork: vi.fn(), setPreview: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/agentic/hooks/useForks', () => ({ useOpenFork: () => ({ mutate: mocks.openFork, isPending: false }) }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  useWorkbenchAction: () => ({ mutate: mocks.mutate, isPending: false }),
  useWorkbenchReconnect: () => ({ mutateAsync: mocks.reconnect, isPending: false }),
  useSetWorkbenchModel: () => ({ mutate: vi.fn(), isPending: false }),
  useSetWorkbenchPreview: () => ({ mutate: mocks.setPreview, isPending: false }),
}))
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => ({ data: [{ id: 'anthropic/opus', name: 'Claude Opus', group: 'Anthropic', variants: [] }], isLoading: false, isError: false, error: null }) }))

import { ActionBar } from '@/features/agentic/components/workbench/ActionBar'
import { ReplyTargetProvider } from '@/components/agent-reply/ReplyTargetProvider'
import { Markdown } from '@/components/ui/markdown'
import type { WorkbenchDto } from '@/features/agentic/types'

const workbench = (patch: Partial<WorkbenchDto>): WorkbenchDto => ({
  id: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'GO-DEV-1',
  taskTitle: 'Tarefa',
  stage: 'plan_review',
  runState: 'idle',
  error: null,
  sessionId: 's1',
  sessionDirectory: '/repo',
  branch: null,
  worktreePath: null,
  port: null,
  previewUrl: null,
  previewHealthy: null,
  agenticFlow: 'preview',
  buildQueuePosition: null,
  slotQueue: null,
  plans: [],
  pr: null,
  pendingPermissions: [],
  pendingForms: [],
  usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  lastStage: null,
  turnStartedAt: null,
  stoppedByUser: false,
  reconnect: null,
  startedAt: '2026-10-09T12:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-10-09T12:00:00.000Z',
  ...patch,
})

beforeEach(() => vi.clearAllMocks())

describe('ActionBar', () => {
  it('citar uma linha da saída sem campo aberto abre o feedback da etapa já com a citação', () => {
    render(
      <ReplyTargetProvider>
        <Markdown>{'O botão fica no rodapé'}</Markdown>
        <ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001' })} />
      </ReplyTargetProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Citar no campo de resposta' }))
    expect((screen.getByLabelText('O que está errado?') as HTMLTextAreaElement).value).toBe('> O botão fica no rodapé\n\n')
  })

  it('na revisão do plano, a citação vai para "Informações adicionais"', () => {
    render(
      <ReplyTargetProvider>
        <Markdown>{'Passo 1'}</Markdown>
        <ActionBar workbench={workbench({})} />
      </ReplyTargetProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Citar no campo de resposta' }))
    expect((screen.getByLabelText('Informações adicionais (opcional)') as HTMLTextAreaElement).value).toBe('> Passo 1\n\n')
  })

  it('plano pronto: implementar ou pedir correção (texto vai ao planejador)', () => {
    render(<ActionBar workbench={workbench({})} />)
    fireEvent.click(screen.getByRole('button', { name: /Implementar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'implement', text: undefined }, expect.anything())

    fireEvent.click(screen.getByRole('button', { name: /Solicitar correção do plano/ }))
    const field = screen.getByLabelText('O que precisa mudar no plano?')
    fireEvent.change(field, { target: { value: 'Use o componente X' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar ao planejador/ }))
    expect(mocks.mutate).toHaveBeenLastCalledWith({ action: 'revise-plan', text: 'Use o componente X' }, expect.anything())
  })

  it('informações adicionais ao aprovar o plano vão no texto da ação implementar', () => {
    render(<ActionBar workbench={workbench({})} />)
    const field = screen.getByLabelText('Informações adicionais (opcional)')
    fireEvent.change(field, { target: { value: 'Use o componente X' } })
    fireEvent.click(screen.getByRole('button', { name: /Implementar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'implement', text: 'Use o componente X' }, expect.anything())
  })

  it('campo de informações adicionais só aparece na revisão do plano', () => {
    render(<ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001' })} />)
    expect(screen.queryByLabelText('Informações adicionais (opcional)')).toBeNull()
  })

  it('prévia pronta: sem Abrir prévia na barra; solicitar correção (ícone) e aprovar', () => {
    render(<ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001' })} />)
    expect(screen.queryByRole('link', { name: /Abrir prévia/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Aprovar e abrir PR' })).toBeTruthy()
    const correction = screen.getByRole('button', { name: 'Solicitar correção' })
    expect(correction.textContent?.trim()).toBe('')
    fireEvent.click(correction)
    expect(screen.getByLabelText('O que está errado?')).toBeTruthy()
  })

  it('sem PR aberto o botão é "Aprovar e abrir PR"; com PR aberto, só "Aprovar"', () => {
    const pr = { number: 12, url: 'https://github.com/org/app/pull/12', mergedAt: null }
    const { unmount } = render(<ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001' })} />)
    expect(screen.getByRole('button', { name: 'Aprovar e abrir PR' })).toBeTruthy()
    unmount()
    const open = render(<ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001', pr: { ...pr, state: 'open' } } as never)} />)
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Aprovar e abrir PR/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(screen.getByText(/atualizar o PR #12/)).toBeTruthy()
    open.unmount()
    render(<ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001', pr: { ...pr, state: 'closed' } } as never)} />)
    expect(screen.getByRole('button', { name: 'Aprovar e abrir PR' })).toBeTruthy()
  })

  it('divisor vertical entre o seletor de modelo e a chave Gerar prévia (oculto junto com a chave)', () => {
    const models = {
      planning: { model: 'anthropic/opus', variant: null, overridden: false },
      implementation: { model: null, variant: null, overridden: false },
      build: { model: null, variant: null, overridden: false },
      pr: { model: null, variant: null, overridden: false },
    }
    const { unmount } = render(<ActionBar workbench={workbench({ stage: 'plan_review', models } as never)} />)
    const divider = screen.getByTestId('workbench-actions-divider')
    expect(divider.getAttribute('aria-orientation')).toBe('vertical')
    const picker = screen.getByRole('button', { name: /Modelo do Plano/ })
    expect(picker.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(divider.compareDocumentPosition(screen.getByText('Gerar prévia')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Rótulo à esquerda da chave.
    const label = screen.getByText('Gerar prévia')
    expect(label.compareDocumentPosition(screen.getByRole('checkbox', { name: 'Gerar prévia' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    unmount()
    render(<ActionBar workbench={workbench({ stage: 'done' })} />)
    expect(screen.queryByTestId('workbench-actions-divider')).toBeNull()
  })

  it('seletor do modelo da etapa fica à esquerda, fora da linha de botões', () => {
    const models = {
      planning: { model: 'anthropic/opus', variant: null, overridden: false },
      implementation: { model: null, variant: null, overridden: false },
      build: { model: null, variant: null, overridden: false },
      pr: { model: null, variant: null, overridden: false },
    }
    render(<ActionBar workbench={workbench({ stage: 'plan_review', models } as never)} />)
    const picker = screen.getByRole('button', { name: /Modelo do Plano: Claude Opus \(padrão\)/ })
    const fork = screen.getByRole('button', { name: /Abrir fork/ })
    expect(picker.compareDocumentPosition(fork) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(fork.parentElement!.contains(picker)).toBe(false)
  })

  it('sem os modelos da central o seletor fica oculto', () => {
    render(<ActionBar workbench={workbench({ stage: 'plan_review', models: null } as never)} />)
    expect(screen.queryByRole('button', { name: /Modelo do Plano/ })).toBeNull()
  })

  it.each(['planning', 'implementing', 'build_queued', 'preview', 'pr_open'] as const)('chave "Gerar prévia" na etapa %s reflete o fluxo da mesa', (stage) => {
    const { unmount } = render(<ActionBar workbench={workbench({ stage })} />)
    expect((screen.getByRole('checkbox', { name: 'Gerar prévia' }) as HTMLInputElement).checked).toBe(true)
    unmount()
    render(<ActionBar workbench={workbench({ stage, agenticFlow: 'auto_pr' })} />)
    expect((screen.getByRole('checkbox', { name: 'Gerar prévia' }) as HTMLInputElement).checked).toBe(false)
  })

  it('chave "Gerar prévia" liga e desliga (inclusive com o agente trabalhando) e fica à esquerda', () => {
    const { unmount } = render(<ActionBar workbench={workbench({ stage: 'implementing', runState: 'running' })} />)
    const toggle = screen.getByRole('checkbox', { name: 'Gerar prévia' }) as HTMLInputElement
    expect(toggle.disabled).toBe(false)
    fireEvent.click(toggle)
    expect(mocks.setPreview).toHaveBeenCalledWith(false)
    unmount()
    render(<ActionBar workbench={workbench({ stage: 'pr_open', agenticFlow: 'auto_pr' })} />)
    const off = screen.getByRole('checkbox', { name: 'Gerar prévia' })
    fireEvent.click(off)
    expect(mocks.setPreview).toHaveBeenLastCalledWith(true)
    expect(off.compareDocumentPosition(screen.getByRole('button', { name: /Abrir fork/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each(['finishing', 'done'] as const)('chave "Gerar prévia" fica oculta em %s', (stage) => {
    render(<ActionBar workbench={workbench({ stage })} />)
    expect(screen.queryByRole('checkbox', { name: 'Gerar prévia' })).toBeNull()
  })

  it('sem Abrir prévia e Ver PR na barra: Abrir fork é o primeiro da linha', () => {
    const pr = { number: 12, url: 'https://github.com/org/app/pull/12', state: 'open', mergedAt: null }
    render(<ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001', pr } as never)} />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    const fork = screen.getByRole('button', { name: 'Abrir fork' })
    const order = Array.from(fork.parentElement!.children).map((element) => element.getAttribute('aria-label'))
    expect(order).toEqual(['Abrir fork', 'Solicitar correção', 'Aprovar'])
  })

  it.each(['pr_open', 'planning', 'implementing', 'preview', 'resolving_conflicts', 'done'] as const)('com PR a barra não mostra Ver PR (o link fica no cabeçalho) — etapa %s', (stage) => {
    const pr = { number: 12, url: 'https://github.com/org/app/pull/12', state: stage === 'done' ? 'merged' : 'open', mergedAt: null }
    render(<ActionBar workbench={workbench({ stage, runState: stage === 'planning' || stage === 'resolving_conflicts' ? 'running' : 'idle', pr } as never)} />)
    expect(screen.queryByRole('link', { name: /Ver PR/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /#12/ })).toBeNull()
  })

  it('Solicitar correção do plano é ícone com nome acessível e abre o campo', () => {
    render(<ActionBar workbench={workbench({ stage: 'plan_review' })} />)
    const button = screen.getByRole('button', { name: 'Solicitar correção do plano' })
    expect(button.textContent?.trim()).toBe('')
    fireEvent.click(button)
    expect(screen.getByLabelText('O que precisa mudar no plano?')).toBeTruthy()
  })

  it('celular: Abrir fork é ícone (sem texto), rótulos compactos nos demais e linha única com rolagem lateral', () => {
    render(<ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001' })} />)
    const fork = screen.getByRole('button', { name: 'Abrir fork' })
    expect(fork.textContent?.trim()).toBe('')
    const approve = screen.getByRole('button', { name: 'Aprovar e abrir PR' })
    expect(within(approve).getByText('Aprovar PR').className).toContain('md:hidden')
    expect(fork.parentElement!.className).toContain('max-md:flex-nowrap')
    expect(fork.parentElement!.className).toContain('max-md:overflow-x-auto')
  })

  it('Abrir fork fica bloqueado (com o motivo na dica) enquanto a mesa é excluída', () => {
    render(<ActionBar workbench={workbench({ deletionRequestedAt: '2026-10-09T12:00:00.000Z' } as never)} />)
    const fork = screen.getByRole('button', { name: 'Abrir fork' })
    expect(fork.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(fork)
    expect(screen.queryByLabelText(/O que você quer perguntar ou investigar no fork/)).toBeNull()
  })

  it('executando: só Parar (e Abrir fork); falha mostra o erro e Tentar novamente', () => {
    const { unmount } = render(<ActionBar workbench={workbench({ stage: 'implementing', runState: 'running' })} />)
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim())).toEqual(['Abrir fork', 'Parar'])
    unmount()
    render(<ActionBar workbench={workbench({ stage: 'building', runState: 'failed', error: 'A prévia não respondeu' })} />)
    expect(screen.getByRole('alert').textContent).toContain('A prévia não respondeu')
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'retry', text: undefined }, expect.anything())
    expect(screen.getByRole('button', { name: /Voltar ao planejamento/ })).toBeTruthy()
  })

  it('aguardando vaga: mostra a posição e só oferece cancelar a espera (com confirmação)', () => {
    render(<ActionBar workbench={workbench({ slotQueue: { position: 2, action: 'implement' } })} />)
    expect(screen.getByText(/Aguardando vaga na central — posição #2/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Implementar/ })).toBeNull()
    expect(screen.queryByLabelText('Informações adicionais (opcional)')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Cancelar espera/ }))
    expect(mocks.mutate).not.toHaveBeenCalled()
    const confirm = screen.getAllByRole('button', { name: /Cancelar espera/ }).at(-1)!
    fireEvent.click(confirm)
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'cancel-wait', text: undefined }, expect.anything())
  })

  it('PR com mudanças sem motivo já abre o campo de texto', () => {
    render(<ActionBar workbench={workbench({ stage: 'changes_requested' })} />)
    expect(screen.getByLabelText('O que o PR pediu?')).toBeTruthy()
  })

  it('mesa falha com sessão oferece Reconectar (sem reenviar) ao lado de Tentar novamente', () => {
    mocks.reconnect.mockResolvedValue({ runState: 'running', reconnect: { outcome: 'attached', message: null, at: '2026-10-09T12:00:00.000Z' } })
    render(<ActionBar workbench={workbench({ stage: 'planning', runState: 'interrupted', error: 'Conexão perdida' })} />)
    fireEvent.click(screen.getByRole('button', { name: /Reconect/ }))
    expect(mocks.reconnect).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy()
  })

  it.each(['plan_review', 'implementing', 'preview', 'pr_open', 'done'] as const)('Abrir fork disponível na etapa %s', (stage) => {
    render(<ActionBar workbench={workbench({ stage, runState: stage === 'implementing' ? 'running' : 'idle' })} />)
    expect(screen.getByRole('button', { name: /Abrir fork/ })).toBeTruthy()
  })

  it('Abrir fork pede a primeira mensagem (obrigatória) e abre o fork', () => {
    const onForkOpened = vi.fn()
    mocks.openFork.mockImplementation((_text: string, options: { onSuccess: (fork: { id: string }) => void }) => options.onSuccess({ id: 'f1' }))
    render(<ActionBar workbench={workbench({})} onForkOpened={onForkOpened} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir fork/ }))
    const submit = screen.getAllByRole('button', { name: /Abrir fork/ }).at(-1)!
    expect(submit.hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText(/O que você quer perguntar ou investigar no fork/), { target: { value: 'Por que o serviço X?' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Abrir fork/ }).at(-1)!)
    expect(mocks.openFork).toHaveBeenCalledWith({ text: 'Por que o serviço X?', parentForkId: undefined, readOnly: false }, expect.anything())
    expect(onForkOpened).toHaveBeenCalledWith({ id: 'f1' })
  })

  it('mesa falha sem sessão não oferece Reconectar', () => {
    render(<ActionBar workbench={workbench({ stage: 'planning', runState: 'interrupted', sessionId: null })} />)
    expect(screen.queryByRole('button', { name: /Reconectar ao agente/ })).toBeNull()
  })
})
