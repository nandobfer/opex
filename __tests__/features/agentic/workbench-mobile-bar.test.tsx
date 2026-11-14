/** @vitest-environment happy-dom */

import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Mesa no celular (OPE-166, opção B escolhida pelo dono: dock com a ação principal + folha "Mais ações",
 * valendo para tudo abaixo de `lg`). O desktop segue coberto por `ActionBar.test.tsx` (sem `matchMedia`).
 */

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), reconnect: vi.fn(), setPreview: vi.fn(), sendLive: vi.fn(), replyPermission: vi.fn(), remove: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/features/agentic/hooks/useForks', () => ({ useOpenFork: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  useWorkbenchAction: () => ({ mutate: mocks.mutate, isPending: false }),
  useWorkbenchReconnect: () => ({ mutateAsync: mocks.reconnect, isPending: false }),
  useSetWorkbenchModel: () => ({ mutate: vi.fn(), isPending: false }),
  useSetWorkbenchPreview: () => ({ mutate: mocks.setPreview, isPending: false }),
  useSendWorkbenchLiveMessage: () => ({ mutate: mocks.sendLive, isPending: false }),
  useReplyPermission: () => ({ mutate: mocks.replyPermission, isPending: false }),
  useReplyForm: () => ({ mutate: vi.fn(), isPending: false }),
  useSetWorkbenchStage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWorkbench: () => ({ mutate: mocks.remove, isPending: false }),
}))
vi.mock('@/features/adversarial-agent/components/workbench/AdversarialActions', () => ({ AdversarialActions: () => <p>decisões do adversário</p> }))
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => ({ data: [], isLoading: false, isError: false, error: null }) }))
vi.mock('@/features/agentic/components/WorkbenchStageBadge', () => ({ WorkbenchStageBadge: () => null }))
vi.mock('@/features/agentic/components/workbench/ForkStatusBadge', () => ({ ForksOpenBadge: () => null }))

import { ActionBar } from '@/features/agentic/components/workbench/ActionBar'
import { WorkbenchHeader } from '@/features/agentic/components/workbench/WorkbenchHeader'
import { WorkbenchBackHrefProvider } from '@/features/agentic/components/workbench/WorkbenchBackLink'
import { ReplyTargetProvider } from '@/components/agent-reply/ReplyTargetProvider'
import { Markdown } from '@/components/ui/markdown'
import { COMPACT_WORKBENCH_QUERY } from '@/features/agentic/hooks/useCompactWorkbench'
import type { CentralDto, WorkbenchDto } from '@/features/agentic/types'

const workbench = (patch: Partial<WorkbenchDto>): WorkbenchDto => ({
  id: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'OPE-166',
  taskTitle: 'Mesa no celular',
  stage: 'plan_review',
  runState: 'idle',
  error: null,
  sessionId: 's1',
  sessionDirectory: '/repo',
  branch: 'feat/ope-166',
  worktreePath: '/repo/worktrees/ope-166',
  port: 4001,
  previewUrl: null,
  previewHealthy: null,
  agenticFlow: 'preview',
  buildQueuePosition: null,
  slotQueue: null,
  plans: [{ version: 1, markdown: '# Plano', createdAt: '2026-11-14T12:00:00.000Z' }],
  pr: null,
  pendingPermissions: [],
  pendingForms: [],
  usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  lastStage: null,
  liveChat: false,
  adversarial: false,
  turnStartedAt: null,
  stoppedByUser: false,
  reconnect: null,
  deletionRequestedAt: null,
  startedAt: '2026-11-14T12:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-11-14T12:00:00.000Z',
  ...patch,
} as WorkbenchDto)
const central = { id: 'c1', projectName: 'opex' } as unknown as CentralDto

/** Abaixo de `lg`: a consulta da mesa compacta casa. */
function mockCompact(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({ matches: matches && query === COMPACT_WORKBENCH_QUERY, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
}

const sheet = (name: string) => within(screen.getByRole('dialog', { name }))

beforeEach(() => {
  vi.clearAllMocks()
  mockCompact(true)
})
afterEach(() => mockCompact(false))

describe('ActionBar no celular — dock e folha "Mais ações" (OPE-166, opção B)', () => {
  it('plano pronto: Implementar é o botão principal do dock; o resto (fork, correção, prévia, mesa) fica na folha', () => {
    render(<ActionBar workbench={workbench({})} central={central} />)
    const dock = within(screen.getByTestId('mobile-action-dock'))
    fireEvent.click(dock.getByRole('button', { name: 'Implementar' }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'implement', text: undefined }, expect.anything())
    // A linha de botões do desktop não é montada.
    expect(screen.queryByTestId('workbench-actions-divider')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Abrir fork' })).toBeNull()

    fireEvent.click(dock.getByRole('button', { name: 'Mais ações' }))
    const more = sheet('Mais ações')
    expect(more.getByRole('button', { name: 'Abrir fork' })).toBeTruthy()
    expect(more.getByRole('checkbox', { name: 'Gerar prévia' })).toBeTruthy()
    expect(more.getByRole('button', { name: 'Concluir mesa…' })).toBeTruthy()
    expect(more.getByRole('button', { name: 'Excluir mesa' })).toBeTruthy()
    // No toque não há dica: o motivo do bloqueio aparece em texto.
    const rebuild = more.getByRole('button', { name: 'Gerar nova prévia' })
    expect(rebuild.getAttribute('aria-disabled')).toBe('true')
    expect(rebuild.textContent).toContain('Disponível quando a prévia estiver pronta')

    fireEvent.click(more.getByRole('button', { name: 'Solicitar correção do plano' }))
    expect(screen.getByLabelText('O que precisa mudar no plano?')).toBeTruthy()
    // Com o campo de correção aberto o dock some (o campo tem Cancelar/Enviar), como no desktop.
    expect(screen.queryByTestId('mobile-action-dock')).toBeNull()
  })

  it('"Informações adicionais" começa recolhido e abre sozinho quando a citação de uma linha cai nele', () => {
    render(
      <ReplyTargetProvider>
        <Markdown>{'Use o componente X'}</Markdown>
        <ActionBar workbench={workbench({})} central={central} />
      </ReplyTargetProvider>,
    )
    const toggle = screen.getByRole('button', { name: 'Informações adicionais (opcional)' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('workbench-implement-info-panel')!.classList.contains('hidden')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Citar no campo de resposta' }))
    expect((screen.getByLabelText('Informações adicionais (opcional)', { selector: 'textarea' }) as HTMLTextAreaElement).value).toBe('> Use o componente X\n\n')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById('workbench-implement-info-panel')!.classList.contains('hidden')).toBe(false)
  })

  it('pedido do agente: vira o botão principal e a folha "Pedidos do agente" abre sozinha quando chega um novo', () => {
    const running = workbench({ stage: 'implementing', runState: 'running' })
    const { rerender } = render(<ActionBar workbench={running} central={central} />)
    expect(within(screen.getByTestId('mobile-action-dock')).getByRole('button', { name: 'Parar' })).toBeTruthy()
    const permission = { id: 'p1', action: 'bash', resources: ['pnpm test'], message: null }
    act(() => rerender(<ActionBar workbench={{ ...running, pendingPermissions: [permission] }} central={central} />))
    const requests = sheet('Pedidos do agente')
    fireEvent.click(requests.getByRole('button', { name: 'Aprovar uma vez' }))
    expect(mocks.replyPermission).toHaveBeenCalledWith({ requestId: 'p1', decision: 'once' })
    // Com a folha aberta o resto da tela fica inerte (aria-hidden): o dock continua lá por baixo.
    expect(within(screen.getByTestId('mobile-action-dock')).getByRole('button', { name: 'Responder pedido', hidden: true })).toBeTruthy()
  })

  it('bloqueio do adversário: o dock pede "Decidir revisão" e a folha mostra as decisões', () => {
    render(<ActionBar workbench={workbench({ stage: 'adversarial_blocked' })} central={central} />)
    expect(screen.queryByText('decisões do adversário')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Decidir revisão/ }))
    expect(sheet('Revisão adversária').getByText('decisões do adversário')).toBeTruthy()
  })

  it('avisos viram uma linha só; o toque expande os demais', () => {
    render(<ActionBar workbench={workbench({ stage: 'implementing', runState: 'failed', error: 'O agente caiu', sessionId: 's1' })} central={central} />)
    const line = screen.getByTestId('workbench-status-line')
    const toggle = within(line).getByRole('alert')
    expect(toggle.textContent).toContain('O agente caiu')
    expect(toggle.textContent).toContain('+1')
    fireEvent.click(toggle)
    expect(line.textContent).toContain('Reconectar acompanha a sessão existente')
    expect(within(screen.getByTestId('mobile-action-dock')).getByRole('button', { name: 'Tentar novamente' })).toBeTruthy()
  })

  it('chat durante a execução: campo de uma linha com "Enviar" ao lado', () => {
    render(<ActionBar workbench={workbench({ stage: 'implementing', runState: 'running', liveChat: true })} central={central} />)
    const field = screen.getByLabelText('Mensagem para o agente em execução') as HTMLTextAreaElement
    expect(field.getAttribute('rows')).toBe('1')
    fireEvent.change(field, { target: { value: 'use o helper Y' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao agente' }))
    expect(mocks.sendLive).toHaveBeenCalledWith({ text: 'use o helper Y' }, expect.anything())
  })

  it('"Excluir mesa" da folha pede a mesma confirmação do cabeçalho do desktop', () => {
    render(<ActionBar workbench={workbench({})} central={central} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(sheet('Mais ações').getByRole('button', { name: 'Excluir mesa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir mesa' }))
    expect(mocks.remove).toHaveBeenCalledTimes(1)
  })
})

describe('WorkbenchHeader no celular (OPE-166)', () => {
  it('"Voltar para tarefas" na linha do cabeçalho; prévia e PR como ícones; recursos atrás de "Detalhes"', () => {
    render(
      <WorkbenchBackHrefProvider href="/desenvolvimento">
        <WorkbenchHeader workbench={workbench({ previewUrl: 'http://host:4001', pr: { number: 12, url: 'https://github.com/x/y/pull/12', state: 'open' } as WorkbenchDto['pr'] })} central={central} connected />
      </WorkbenchBackHrefProvider>,
    )
    const back = screen.getByRole('link', { name: 'Voltar para tarefas' })
    expect(back.getAttribute('href')).toBe('/desenvolvimento')
    expect(back.className).toContain('lg:hidden')
    expect(screen.getByRole('link', { name: 'Abrir prévia' }).getAttribute('href')).toBe('http://host:4001')
    expect(screen.getByRole('link', { name: /Abrir PR #12/ }).getAttribute('href')).toBe('https://github.com/x/y/pull/12')
    // Excluir fica só no desktop (no celular está na folha "Mais ações").
    expect(screen.getByRole('button', { name: 'Excluir mesa' }).className).toContain('lg:inline-flex')
    expect(screen.queryByTestId('workbench-details')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes da mesa' }))
    expect(screen.getByTestId('workbench-details').textContent).toContain('feat/ope-166')
  })

  it('sem o provedor (fora da Central de desenvolvimento) não há botão de voltar', () => {
    render(<WorkbenchHeader workbench={workbench({})} central={central} connected />)
    expect(screen.queryByRole('link', { name: 'Voltar para tarefas' })).toBeNull()
  })
})
