/** @vitest-environment happy-dom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDetailDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div> }))

/** Estado da fila de upload controlado pelo teste (o hook real é substituído por um dublê). */
const h = vi.hoisted(() => ({
  addComment: vi.fn(),
  enqueue: vi.fn(),
  retry: vi.fn(),
  dismiss: vi.fn(),
  items: [] as { id: string; name: string; progress: number; status: string; error?: string }[],
}))

vi.mock('@/features/tasks/hooks/useTasks', () => ({ useAddComment: () => ({ mutateAsync: h.addComment, isPending: false }) }))
vi.mock('@/features/tasks/attachments/hooks', () => ({
  useOwnerAttachmentClient: () => ({}),
  useTaskDescriptionUploads: () => ({
    media: { enqueue: h.enqueue, items: h.items, retry: h.retry, cancel: vi.fn(), dismiss: h.dismiss },
    active: h.items.filter((item) => item.status === 'queued' || item.status === 'uploading' || item.status === 'confirming').length,
  }),
}))

import { CommentsSection } from '@/features/tasks/components/detail/TaskDetailSections'

const task = (overrides: Partial<TaskDetailDto> = {}): TaskDetailDto => ({
  id: 'a'.repeat(24),
  code: 'OPX-1',
  columnId: 'todo',
  order: 0,
  title: 'Tarefa',
  summary: null,
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: null,
  createdAt: null,
  updatedAt: null,
  description: null,
  technicalSpec: null,
  comments: [],
  history: [],
  timeLogs: [],
  totalTimeLogged: 0,
  ...overrides,
})

const foto = () => new File(['x'], 'foto.png', { type: 'image/png' })
const textarea = () => screen.getByLabelText<HTMLTextAreaElement>('Novo comentário')
const comentar = () => screen.getByRole('button', { name: /Comentar/ }) as HTMLButtonElement

beforeEach(() => {
  vi.clearAllMocks()
  h.items = []
  h.addComment.mockResolvedValue(undefined)
})

describe('comentários: colar mídia no campo', () => {
  it('usa o mesmo campo Markdown com rótulos próprios dos comentários', () => {
    render(<CommentsSection task={task()} />)
    expect(screen.getByRole('tablist', { name: 'Editar ou visualizar o comentário' })).toBeTruthy()
    expect(textarea()).toBeTruthy()
  })

  it('envia a imagem colada e publica o comentário com a referência, sem perder o texto digitado', async () => {
    const markdown = `![foto.png](/api/attachments/${'d'.repeat(24)}/content)`
    h.items = [{ id: 'j1', name: 'foto.png', progress: 0, status: 'queued' }]
    let resolveUpload: (value: string) => void = () => {}
    h.enqueue.mockReturnValue({ id: 'j1', markdown: new Promise<string>((resolve) => { resolveUpload = resolve }) })

    render(<CommentsSection task={task()} />)
    fireEvent.change(textarea(), { target: { value: 'Veja a imagem:' } })
    fireEvent.paste(textarea(), { clipboardData: { files: [foto()] } })

    await waitFor(() => expect(h.enqueue).toHaveBeenCalledTimes(1))
    // Enquanto o envio não confirma, nada entra no texto e publicar fica bloqueado.
    expect(textarea().value).toBe('Veja a imagem:')
    expect(comentar().disabled).toBe(true)
    expect(screen.getByText(/Enviando anexos/)).toBeTruthy()
    expect(screen.getByLabelText('Mídias enviadas pelo comentário')).toBeTruthy()

    h.items = [{ id: 'j1', name: 'foto.png', progress: 100, status: 'done' }]
    resolveUpload(markdown)

    await waitFor(() => expect(textarea().value).toContain(markdown))
    expect(textarea().value).toContain('Veja a imagem:')
    await waitFor(() => expect(comentar().disabled).toBe(false))

    fireEvent.click(comentar())
    await waitFor(() => expect(h.addComment).toHaveBeenCalledTimes(1))
    expect(h.addComment.mock.calls[0][0]).toContain(markdown)
    // O comentário publicado limpa o campo.
    await waitFor(() => expect(textarea().value).toBe(''))
  })

  it('permite comentar só com a imagem colada', async () => {
    const markdown = `![foto.png](/api/attachments/${'e'.repeat(24)}/content)`
    h.items = [{ id: 'j1', name: 'foto.png', progress: 0, status: 'uploading' }]
    let resolveUpload: (value: string) => void = () => {}
    h.enqueue.mockReturnValue({ id: 'j1', markdown: new Promise<string>((resolve) => { resolveUpload = resolve }) })

    render(<CommentsSection task={task()} />)
    fireEvent.paste(textarea(), { clipboardData: { files: [foto()] } })
    await waitFor(() => expect(h.enqueue).toHaveBeenCalledTimes(1))

    h.items = [{ id: 'j1', name: 'foto.png', progress: 100, status: 'done' }]
    resolveUpload(markdown)
    await waitFor(() => expect(textarea().value).toContain(markdown))

    fireEvent.click(comentar())
    await waitFor(() => expect(h.addComment).toHaveBeenCalledTimes(1))
    expect(h.addComment.mock.calls[0][0]).toBe(markdown)
  })

  it('pede para resolver a mídia com falha antes de comentar', async () => {
    h.items = [{ id: 'j1', name: 'foto.png', progress: 100, status: 'error', error: 'Falha ao enviar' }]
    render(<CommentsSection task={task()} />)
    fireEvent.change(textarea(), { target: { value: 'Comentário' } })

    expect(comentar().disabled).toBe(true)
    expect(screen.getByText(/Tente novamente ou descarte a mídia com falha/)).toBeTruthy()

    // Resolvido o envio (nova tentativa/descarte), o botão volta a habilitar.
    h.items = []
    fireEvent.change(textarea(), { target: { value: 'Comentário com ajuste' } })
    expect(comentar().disabled).toBe(false)
  })

  it('colar texto comum não inicia upload', () => {
    render(<CommentsSection task={task()} />)
    fireEvent.paste(textarea(), { clipboardData: {} })
    expect(h.enqueue).not.toHaveBeenCalled()
  })
})
