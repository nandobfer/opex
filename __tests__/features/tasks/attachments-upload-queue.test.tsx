/** @vitest-environment happy-dom */

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))
vi.mock('@/lib/pusher/client', () => ({ acquireChannel: () => ({ bind: vi.fn(), unbind: vi.fn() }), releaseChannel: vi.fn(), isPusherClientAvailable: () => false }))
// O erro da API chega ao navegador com `code` (DomainError serializado): basta isso para a fila.
vi.mock('@/lib/api', () => ({
  default: {},
  apiErrorMessage: (error: unknown, fallback = 'falha') => (error as { message?: string })?.message ?? fallback,
  apiErrorCode: (error: unknown) => (error as { code?: string })?.code ?? null,
}))

import type { AttachmentClient } from '@/features/tasks/attachments/client'
import { useAttachmentUploads } from '@/features/tasks/attachments/hooks'
import type { TaskAttachmentDto } from '@/features/tasks/attachments/types'

const ID = 'a'.repeat(24)

const ATTACHMENT: TaskAttachmentDto = {
  id: ID,
  name: 'foto.png',
  size: 8,
  mimeType: 'image/png',
  kind: 'image',
  url: `/api/attachments/${ID}/content`,
  markdown: `![foto.png](/api/attachments/${ID}/content)`,
  uploaderName: 'Dono',
  uploaderKind: 'owner',
  createdAt: '2026-10-13T10:00:00.000Z',
}

const foto = () => new File(['conteudo'], 'foto.png', { type: 'image/png' })

/** Erro de regra do servidor como o axios o entrega (`code` do `DomainError`). */
const apiError = (code: string, message: string) => Object.assign(new Error(message), { code })

function fakeClient(overrides: Partial<AttachmentClient> = {}): AttachmentClient {
  return {
    list: vi.fn(async () => []),
    reserve: vi.fn(async () => ({ id: 'r1', method: 'PUT' as const, url: 'https://minio.local/opex/attachments/tmp/r1/foto.png?sig', headers: { 'Content-Type': 'image/png' }, expiresIn: 900 })),
    complete: vi.fn(async () => ATTACHMENT),
    cancel: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    uploadToSignedUrl: vi.fn(async () => undefined),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // O DOM de teste não implementa createObjectURL (prévia local das imagens).
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

describe('fila de upload dos anexos', () => {
  it('envia a mídia colada e entrega a referência do Markdown', async () => {
    const client = fakeClient()
    const onUploaded = vi.fn()
    const { result } = renderHook(() => useAttachmentUploads({ client, onUploaded }))

    let media: { id: string; markdown: Promise<string> } | null = null
    await act(async () => {
      media = result.current.enqueueMedia(foto())
    })
    await act(async () => {
      await expect(media!.markdown).resolves.toBe(ATTACHMENT.markdown)
    })

    expect(client.reserve).toHaveBeenCalledWith(expect.objectContaining({ name: 'foto.png', size: 8, mimeType: 'image/png' }))
    expect(client.uploadToSignedUrl).toHaveBeenCalledTimes(1)
    expect(onUploaded).toHaveBeenCalledWith(ATTACHMENT)
    expect(result.current.items[0]?.status).toBe('done')
    expect(result.current.items[0]?.inline).toBe(true)
    expect(result.current.active).toBe(0)
  })

  it('dá nome padrão ao arquivo sem nome (mídia colada da área de transferência)', async () => {
    const client = fakeClient()
    const { result } = renderHook(() => useAttachmentUploads({ client }))

    await act(async () => {
      result.current.enqueueMedia(new File(['conteudo'], '', { type: 'image/png' }))
    })

    await waitFor(() => expect(client.reserve).toHaveBeenCalled())
    expect(client.reserve).toHaveBeenCalledWith(expect.objectContaining({ name: 'imagem-colada.png' }))
  })

  it('tentar de novo depois de uma falha de confirmação não reenvia o arquivo', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(apiError('ATTACHMENT_STORAGE_UNAVAILABLE', 'Não foi possível confirmar o arquivo no storage. Tente novamente em instantes.'))
      .mockResolvedValueOnce(ATTACHMENT)
    const client = fakeClient({ complete })
    const { result } = renderHook(() => useAttachmentUploads({ client }))

    let media: { id: string; markdown: Promise<string> } | null = null
    await act(async () => {
      media = result.current.enqueueMedia(foto())
    })
    await waitFor(() => expect(result.current.items[0]?.status).toBe('error'))
    expect(result.current.items[0]?.error).toContain('Não foi possível confirmar')

    const id = result.current.items[0]!.id
    await act(async () => {
      result.current.retry(id)
    })
    await waitFor(() => expect(result.current.items[0]?.status).toBe('done'))

    // A reserva é reaproveitada: nada foi transferido de novo, só a confirmação se repetiu.
    expect(client.reserve).toHaveBeenCalledTimes(1)
    expect(client.uploadToSignedUrl).toHaveBeenCalledTimes(1)
    expect(complete).toHaveBeenCalledTimes(2)
    await act(async () => {
      await expect(media!.markdown).resolves.toBe(ATTACHMENT.markdown)
    })
  })

  it('falha ao enviar o arquivo libera a reserva e a nova tentativa reserva de novo', async () => {
    const uploadToSignedUrl = vi.fn().mockRejectedValueOnce(new Error('rede caiu')).mockResolvedValueOnce(undefined)
    const client = fakeClient({ uploadToSignedUrl })
    const { result } = renderHook(() => useAttachmentUploads({ client }))

    await act(async () => {
      result.current.enqueueMedia(foto())
    })
    await waitFor(() => expect(result.current.items[0]?.status).toBe('error'))
    expect(client.cancel).toHaveBeenCalledWith('r1')

    const id = result.current.items[0]!.id
    await act(async () => {
      result.current.retry(id)
    })
    await waitFor(() => expect(result.current.items[0]?.status).toBe('done'))

    expect(client.reserve).toHaveBeenCalledTimes(2)
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(2)
  })

  it('erro definitivo (objeto ausente) descarta a reserva: a nova tentativa começa do zero', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(apiError('ATTACHMENT_NOT_UPLOADED', 'O arquivo não chegou ao storage. Envie de novo.'))
      .mockResolvedValueOnce(ATTACHMENT)
    const client = fakeClient({ complete })
    const { result } = renderHook(() => useAttachmentUploads({ client }))

    await act(async () => {
      result.current.enqueueMedia(foto())
    })
    await waitFor(() => expect(result.current.items[0]?.status).toBe('error'))

    const id = result.current.items[0]!.id
    await act(async () => {
      result.current.retry(id)
    })
    await waitFor(() => expect(result.current.items[0]?.status).toBe('done'))

    expect(client.reserve).toHaveBeenCalledTimes(2)
    expect(client.uploadToSignedUrl).toHaveBeenCalledTimes(2)
  })

  it('recusa arquivo vazio ou acima do limite antes de reservar', async () => {
    const client = fakeClient()
    const { result } = renderHook(() => useAttachmentUploads({ client, maxBytes: 4 }))

    await act(async () => {
      result.current.enqueueMedia(new File(['conteudo'], 'foto.png', { type: 'image/png' }))
    })

    expect(client.reserve).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(result.current.items).toHaveLength(0)
  })
})
