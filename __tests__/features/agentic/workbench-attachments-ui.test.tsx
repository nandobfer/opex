/** @vitest-environment happy-dom */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Anexos nos campos da mesa (MT-21): colar um arquivo cria o chip com o envio (reserva → PUT →
 * confirmação), o envio da ação espera o upload e leva os `fileIds`; a saída mostra os anexos.
 */

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), post: vi.fn(), del: vi.fn(async () => ({})), put: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('axios', () => ({ default: { put: mocks.put } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/api', () => ({
  api: { post: mocks.post, delete: mocks.del },
  unwrapApi: (body: { data: unknown }) => body.data,
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  useWorkbenchAction: () => ({ mutate: mocks.mutate, isPending: false }),
  useWorkbenchReconnect: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetWorkbenchModel: () => ({ mutate: vi.fn(), isPending: false }),
  useSetWorkbenchPreview: () => ({ mutate: vi.fn(), isPending: false }),
  useSendWorkbenchLiveMessage: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => ({ data: [], isLoading: false, isError: false, error: null }) }))
vi.mock('@/features/agentic/hooks/useForks', () => ({ useOpenFork: () => ({ mutate: vi.fn(), isPending: false }) }))

import { ActionBar } from '@/features/agentic/components/workbench/ActionBar'
import { TimelineItemView } from '@/features/agentic/components/workbench/TimelineItemView'
import { WorkbenchUploadsProvider } from '@/features/agentic/hooks/useWorkbenchFiles'
import type { WorkbenchDto } from '@/features/agentic/types'

const FILE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'

const workbench = (patch: Partial<WorkbenchDto> = {}): WorkbenchDto =>
  ({
    id: 'w1', centralId: 'c1', taskId: 't1', taskCode: 'MT-21', taskTitle: 'Anexos', stage: 'plan_review', runState: 'idle', error: null, sessionId: 's1', sessionDirectory: '/repo',
    branch: null, worktreePath: null, port: null, previewUrl: null, previewHealthy: null, agenticFlow: 'preview', buildQueuePosition: null, slotQueue: null, plans: [], pr: null,
    pendingPermissions: [], pendingForms: [], usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }, lastStage: null, forksDonePrompt: null, models: null,
    liveChat: false, turnStartedAt: null, stoppedByUser: false, reconnect: null, startedAt: '2026-10-28T12:00:00.000Z', completedAt: null, updatedAt: '2026-10-28T12:00:00.000Z',
    ...patch,
  }) as WorkbenchDto

let finishPut: () => void = () => undefined

beforeEach(() => {
  vi.clearAllMocks()
  mocks.post.mockImplementation(async (url: string) => {
    if (url === '/agentic/files') return { data: { data: { id: FILE_ID, method: 'PUT', url: 'http://storage.test/put', headers: { 'Content-Type': 'image/png' }, expiresIn: 900 } } }
    return { data: { data: { id: FILE_ID, name: 'tela.png', mediaType: 'image/png', size: 3, kind: 'image', url: `/api/agentic/files/${FILE_ID}` } } }
  })
  mocks.put.mockImplementation(() => new Promise<void>((resolve) => (finishPut = resolve)))
})

const openCorrection = () => {
  render(
    <WorkbenchUploadsProvider>
      <ActionBar workbench={workbench()} />
    </WorkbenchUploadsProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Solicitar correção do plano' }))
  return screen.getByLabelText('O que precisa mudar no plano?')
}

describe('campos da mesa com anexos', () => {
  it('colar um arquivo mostra o chip; o envio espera o upload e leva os fileIds', async () => {
    const field = openCorrection()
    fireEvent.change(field, { target: { value: 'Use o layout da imagem' } })
    fireEvent.paste(field, { clipboardData: { files: [new File(['abc'], 'tela.png', { type: 'image/png' })] } })

    expect(await screen.findByText('tela.png')).toBeTruthy()
    const submit = screen.getByRole('button', { name: /Enviar ao planejador/ })
    await waitFor(() => expect(mocks.put).toHaveBeenCalled())
    expect(submit.hasAttribute('disabled')).toBe(true)
    expect(submit.getAttribute('title')).toBe('Aguarde o envio dos arquivos')

    await act(async () => finishPut())
    await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false))
    expect(mocks.post).toHaveBeenCalledWith('/agentic/files', { name: 'tela.png', size: 3, mediaType: 'image/png' }, expect.anything())
    expect(mocks.post).toHaveBeenCalledWith(`/agentic/files/${FILE_ID}/complete`, {}, expect.anything())

    fireEvent.click(submit)
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'revise-plan', text: 'Use o layout da imagem', fileIds: [FILE_ID] }, expect.anything())
  })

  it('remover o chip apaga a reserva e libera o envio sem anexos', async () => {
    const field = openCorrection()
    fireEvent.change(field, { target: { value: 'Mude o plano' } })
    fireEvent.paste(field, { clipboardData: { files: [new File(['abc'], 'tela.png', { type: 'image/png' })] } })
    await waitFor(() => expect(mocks.put).toHaveBeenCalled())
    await act(async () => finishPut())
    await screen.findByText('tela.png')
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Remover tela.png' }))
    expect(mocks.del).toHaveBeenCalledWith(`/agentic/files/${FILE_ID}`)
    fireEvent.click(screen.getByRole('button', { name: /Enviar ao planejador/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'revise-plan', text: 'Mude o plano' }, expect.anything())
  })

  it('sem a fila montada, o campo segue só com texto (sem o clipe)', () => {
    render(<ActionBar workbench={workbench()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar correção do plano' }))
    expect(screen.queryByRole('button', { name: 'Anexar arquivos' })).toBeNull()
  })
})

describe('saída da mesa', () => {
  it('a mensagem do usuário mostra os anexos (miniatura e download)', () => {
    render(
      <TimelineItemView
        item={{
          kind: 'user',
          key: 'u1',
          text: 'veja',
          ts: '2026-10-28T12:00:00.000Z',
          files: [
            { id: 'i1', name: 'tela.png', mediaType: 'image/png', size: 3, kind: 'image', url: '/api/agentic/files/i1' },
            { id: 'z1', name: 'dados.zip', mediaType: 'application/zip', size: 9, kind: 'other', url: '/api/agentic/files/z1' },
          ],
        }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Ampliar tela.png' })).toBeTruthy()
    expect(screen.getByText('dados.zip').closest('a')?.getAttribute('href')).toBe('/api/agentic/files/z1?download=1')
  })
})
