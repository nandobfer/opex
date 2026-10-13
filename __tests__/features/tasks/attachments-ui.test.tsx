/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

import { Markdown } from '@/components/ui/markdown'
import { MarkdownField, type MarkdownUploadItem, type MarkdownUploads } from '@/components/ui/markdown-field'
import { AttachmentDropzone } from '@/features/tasks/attachments/components/AttachmentDropzone'
import { AttachmentList } from '@/features/tasks/attachments/components/AttachmentList'
import type { TaskAttachmentDto } from '@/features/tasks/attachments/types'

const attachment = (overrides: Partial<TaskAttachmentDto> = {}): TaskAttachmentDto => ({
  id: 'a'.repeat(24),
  name: 'foto.png',
  size: 2048,
  mimeType: 'image/png',
  kind: 'image',
  url: `/api/attachments/${'a'.repeat(24)}/content`,
  markdown: `![foto.png](/api/attachments/${'a'.repeat(24)}/content)`,
  uploaderName: 'Dono',
  uploaderKind: 'owner',
  createdAt: '2026-10-13T10:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  // O jsdom desta versão não implementa createObjectURL.
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

describe('área de envio de anexos', () => {
  it('entrega os arquivos soltos na área', () => {
    const onFiles = vi.fn()
    render(<AttachmentDropzone onFiles={onFiles} />)

    const file = new File(['conteudo'], 'relatorio.pdf', { type: 'application/pdf' })
    const area = screen.getByLabelText('Escolher arquivos para anexar').parentElement!
    fireEvent.drop(area, { dataTransfer: { files: [file] } })

    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles.mock.calls[0][0]).toHaveLength(1)
  })

  it('avisa visualmente quando um arquivo está sobre a área', () => {
    render(<AttachmentDropzone onFiles={vi.fn()} />)
    const area = screen.getByLabelText('Escolher arquivos para anexar').parentElement!

    fireEvent.dragEnter(area, { dataTransfer: { files: [] } })
    expect(screen.getByText('Solte os arquivos aqui')).toBeTruthy()
    expect(area.getAttribute('data-dragging')).toBe('true')

    fireEvent.dragLeave(area, { dataTransfer: { files: [] } })
    expect(area.getAttribute('data-dragging')).toBeNull()
  })
})

describe('lista de anexos', () => {
  it('mostra nome, tamanho e autor e baixa pelo link', () => {
    render(<AttachmentList attachments={[attachment()]} />)

    expect(screen.getByText('foto.png')).toBeTruthy()
    expect(screen.getByText(/2 KB/)).toBeTruthy()
    expect(screen.getByText(/Dono/)).toBeTruthy()
    const download = screen.getByLabelText('Baixar foto.png') as HTMLAnchorElement
    expect(download.getAttribute('href')).toBe(`/api/attachments/${'a'.repeat(24)}/content?download=1`)
    expect(screen.queryByLabelText('Excluir foto.png')).toBeNull()
  })

  it('exclui só depois da confirmação (e avisa quando a descrição referencia o anexo)', async () => {
    const onDelete = vi.fn()
    const item = attachment()
    render(<AttachmentList attachments={[item]} canDelete onDelete={onDelete} description={`veja ![x](${item.url})`} />)

    fireEvent.click(screen.getByLabelText('Excluir foto.png'))
    await waitFor(() => expect(screen.getByText(/Excluir o anexo/)).toBeTruthy())
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(item))
  })

  it('mostra o estado vazio', () => {
    render(<AttachmentList attachments={[]} />)
    expect(screen.getByText('Nenhum anexo ainda.')).toBeTruthy()
  })
})

describe('mídia de anexo no Markdown', () => {
  it('renderiza imagem e áudio pela rota autenticada do app', () => {
    const { container } = render(
      <Markdown>{`![foto.png](/api/attachments/${'b'.repeat(24)}/content)\n\n![som.mp3](/api/attachments/${'c'.repeat(24)}/content#audio)`}</Markdown>,
    )

    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(`/api/attachments/${'b'.repeat(24)}/content`)
    const audio = container.querySelector('audio')!
    expect(audio.getAttribute('src')).toBe(`/api/attachments/${'c'.repeat(24)}/content`)
  })

  it('mantém imagens externas como imagem simples', () => {
    const { container } = render(<Markdown>{'![externa](https://exemplo.com/x.png)'}</Markdown>)
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://exemplo.com/x.png')
  })
})

describe('colar mídia na descrição', () => {
  const pastedFile = () => new File(['x'], 'foto.png', { type: 'image/png' })

  it('envia o arquivo colado e insere a referência sem perder o texto digitado', async () => {
    let resolveUpload: (markdown: string) => void = () => {}
    const enqueue = vi.fn(() => ({
      id: 'j1',
      markdown: new Promise<string>((resolve) => {
        resolveUpload = resolve
      }),
    }))
    const uploads: MarkdownUploads = {
      enqueue,
      items: [{ id: 'j1', name: 'foto.png', progress: 30, status: 'uploading' }],
      retry: vi.fn(),
      cancel: vi.fn(),
      dismiss: vi.fn(),
    }
    const onChange = vi.fn()
    const { rerender } = render(<MarkdownField value="texto inicial" onChange={onChange} uploads={uploads} />)

    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>('Markdown aceito')
    fireEvent.paste(textarea, { clipboardData: { files: [pastedFile()] } })

    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/Enviando foto.png/)).toBeTruthy()
    expect(screen.getByText('30%')).toBeTruthy()

    // O usuário continua digitando enquanto o upload acontece.
    rerender(<MarkdownField value="texto inicial e mais" onChange={onChange} uploads={uploads} />)
    resolveUpload('![foto.png](/api/attachments/' + 'd'.repeat(24) + '/content)')

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const inserted = onChange.mock.calls[0][0] as string
    expect(inserted).toContain('texto inicial e mais')
    expect(inserted).toContain(`/api/attachments/${'d'.repeat(24)}/content`)
    await waitFor(() => expect(screen.queryByText(/Enviando foto.png/)).toBeNull())
  })

  it('mostra a falha, deixa tentar de novo e só insere a referência quando a confirmação conclui', async () => {
    const erro = 'Não foi possível confirmar o arquivo no storage. Tente novamente em instantes.'
    let resolveUpload: (markdown: string) => void = () => {}
    const enqueue = vi.fn(() => ({
      id: 'j1',
      markdown: new Promise<string>((resolve) => {
        resolveUpload = resolve
      }),
    }))
    const retry = vi.fn()
    const base = { enqueue, retry, cancel: vi.fn(), dismiss: vi.fn() }
    const onChange = vi.fn()
    const { rerender } = render(<MarkdownField value="texto" onChange={onChange} uploads={{ ...base, items: [] }} />)

    fireEvent.paste(screen.getByPlaceholderText('Markdown aceito'), { clipboardData: { files: [pastedFile()] } })
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1))

    // A fila marca a falha: nada entrou na descrição e o erro fica visível com a ação de tentar de novo.
    const failed: MarkdownUploadItem[] = [{ id: 'j1', name: 'foto.png', progress: 100, status: 'error', error: erro }]
    rerender(<MarkdownField value="texto" onChange={onChange} uploads={{ ...base, items: failed }} />)
    expect(screen.getByText(/Falha ao enviar foto.png/)).toBeTruthy()
    expect(screen.getByText(erro)).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('Tentar enviar foto.png novamente'))
    expect(retry).toHaveBeenCalledWith('j1')

    // A nova tentativa reaproveita o arquivo já enviado: quando a confirmação conclui, a referência entra.
    resolveUpload(`![foto.png](/api/attachments/${'e'.repeat(24)}/content)`)
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0] as string).toContain(`/api/attachments/${'e'.repeat(24)}/content`)
  })

  it('sem uploads, colar arquivo não interfere', () => {
    const onChange = vi.fn()
    render(<MarkdownField value="texto" onChange={onChange} />)
    fireEvent.paste(screen.getByPlaceholderText('Markdown aceito'), { clipboardData: { files: [pastedFile()] } })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('rótulos do campo Markdown', () => {
  it('usa os rótulos da descrição por padrão e aceita os de comentários', () => {
    const { rerender } = render(<MarkdownField value="" onChange={vi.fn()} />)
    expect(screen.getByRole('tablist', { name: 'Editar ou visualizar a descrição' })).toBeTruthy()

    rerender(<MarkdownField value="" onChange={vi.fn()} ariaLabel="Novo comentário" tablistLabel="Editar ou visualizar o comentário" />)
    expect(screen.getByRole('tablist', { name: 'Editar ou visualizar o comentário' })).toBeTruthy()
    expect(screen.queryByRole('tablist', { name: 'Editar ou visualizar a descrição' })).toBeNull()
    expect(screen.getByLabelText('Novo comentário')).toBeTruthy()
  })
})
