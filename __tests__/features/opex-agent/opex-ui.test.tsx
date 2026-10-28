/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { framerMotionMock } from '../../helpers/framer-motion'

const net = vi.hoisted(() => ({
  post: vi.fn(),
  del: vi.fn(async () => ({ data: { success: true } })),
  put: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('axios', () => ({ default: { put: net.put } }))
vi.mock('@/lib/api', () => ({
  api: { post: net.post, delete: net.del },
  unwrapApi: (response: { data: unknown }) => response.data,
  apiErrorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
}))

import { OpexToolCard } from '@/features/opex-agent/components/chat/OpexToolCard'
import { AssistantMessage, UserMessage } from '@/features/opex-agent/components/chat/OpexMessageItem'
import { OpexSessionTabs } from '@/features/opex-agent/components/OpexSessionTabs'
import { OpexAttachmentChips } from '@/features/opex-agent/components/chat/OpexAttachmentChips'
import { OpexComposer } from '@/features/opex-agent/components/chat/OpexComposer'
import { ReplyTargetProvider } from '@/components/agent-reply/ReplyTargetProvider'
import { OpexUploadsProvider, useOpexUploads, type OpexUploadItem } from '@/features/opex-agent/hooks/useOpexUploads'
import { ClienteOpexToolsCard } from '@/features/opex-agent/components/settings/client/ClienteOpexToolsCard'
import { OPEX_CLIENT_TOOLS } from '@/features/opex-agent/client-tools'
import type { OpexMessageDto, OpexPart, OpexSessionDto } from '@/features/opex-agent/types'

type ToolPart = Extract<OpexPart, { type: 'tool' }>

afterEach(cleanup)

const toolPart = (overrides: Partial<ToolPart> = {}): ToolPart => ({
  type: 'tool',
  id: 't1',
  name: 'delete_task',
  group: 'tasks',
  label: 'Excluir tarefa',
  state: 'done',
  input: '{"task":"OPX-1"}',
  output: null,
  error: null,
  confirmation: null,
  durationMs: 1500,
  ...overrides,
})

const message = (overrides: Partial<OpexMessageDto>): OpexMessageDto => ({
  id: 'm1',
  role: 'assistant',
  kind: 'message',
  job: null,
  text: '',
  files: [],
  parts: [],
  status: 'complete',
  error: null,
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  durationMs: 2300,
  model: 'anthropic/claude-x',
  createdAt: '2026-10-19T12:00:00.000Z',
  ...overrides,
})

describe('card de ferramenta', () => {
  it('confirmação pendente mostra o resumo e envia a decisão', () => {
    const onDecide = vi.fn()
    render(<OpexToolCard part={toolPart({ confirmation: { actionId: 'a1', summary: 'Excluir definitivamente a tarefa OPX-1', status: 'pending', error: null } })} onDecide={onDecide} />)
    expect(screen.getByText('Excluir definitivamente a tarefa OPX-1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }))
    expect(onDecide.mock.calls).toEqual([
      ['a1', 'confirm'],
      ['a1', 'cancel'],
    ])
  })

  it('decidida mostra a situação sem botões; falha mostra o erro', () => {
    render(<OpexToolCard part={toolPart({ confirmation: { actionId: 'a1', summary: 'Excluir', status: 'failed', error: 'Storage fora do ar' } })} />)
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
    expect(screen.getByText('Falhou: Storage fora do ar')).toBeTruthy()
  })

  it('detalhes da entrada abrem ao clicar e a duração aparece', () => {
    render(<OpexToolCard part={toolPart()} />)
    expect(screen.getByText('1,5 s')).toBeTruthy()
    const toggle = screen.getByRole('button', { expanded: false })
    fireEvent.click(toggle)
    expect(screen.getByText('{"task":"OPX-1"}')).toBeTruthy()
  })
})

describe('mensagens', () => {
  it('resposta ao vivo vazia mostra "Pensando…"', () => {
    render(<AssistantMessage parts={[]} streaming thinking={false} />)
    expect(screen.getByRole('status').textContent).toContain('Pensando…')
  })

  it('resposta com erro mostra a mensagem e "Tentar novamente"; o rodapé traz modelo, tokens e duração', () => {
    const onRetry = vi.fn()
    render(<AssistantMessage parts={[{ type: 'text', text: 'Parcial' }]} message={message({ status: 'error', error: 'Credencial recusada' })} onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toContain('Credencial recusada')
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByText('anthropic/claude-x')).toBeTruthy()
    expect(screen.getByText('15 tokens')).toBeTruthy()
  })

  it('decisão de confirmação aparece como nota, não como balão', () => {
    render(<UserMessage message={message({ role: 'user', kind: 'confirmation', text: 'Confirmado: Excluir x' })} />)
    expect(screen.getByText('Confirmado: Excluir x')).toBeTruthy()
  })

  it('prompt de job agendado mostra o selo com o título do job acima do balão', () => {
    render(<UserMessage message={message({ role: 'user', kind: 'job', job: { id: 'j1', title: 'Resumo dos PRs' }, text: 'Liste os PRs' })} />)
    expect(screen.getByTestId('opex-job-badge').textContent).toBe('Job agendado · Resumo dos PRs')
    expect(screen.getByText('Liste os PRs')).toBeTruthy()
  })
})

const upload = (overrides: Partial<OpexUploadItem>): OpexUploadItem => ({
  localId: 'u1',
  sessionId: 's1',
  file: new File(['x'], 'erro.log'),
  name: 'erro.log',
  size: 2048,
  mediaType: 'text/plain',
  kind: 'text',
  previewUrl: null,
  status: 'done',
  progress: 100,
  error: null,
  reservationId: 'f1',
  putDone: true,
  uploaded: { id: 'f1', name: 'erro.log', mediaType: 'text/plain', size: 2048, kind: 'text', url: '/api/opex/files/f1' },
  ...overrides,
})

describe('arquivos no chat', () => {
  it('chips mostram progresso, erro com nova tentativa e remoção', () => {
    const onRetry = vi.fn()
    const onRemove = vi.fn()
    render(<OpexAttachmentChips items={[upload({ localId: 'a', status: 'uploading', progress: 40 }), upload({ localId: 'b', name: 'b.png', status: 'error', error: 'Limite excedido' }), upload({ localId: 'c', name: 'c.pdf', status: 'confirming' })]} onRetry={onRetry} onRemove={onRemove} />)
    expect(screen.getByText('Enviando… 40%')).toBeTruthy()
    expect(screen.getByText('Confirmando…')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Limite excedido')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar b.png de novo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remover erro.log' }))
    expect(onRetry).toHaveBeenCalledWith('b')
    expect(onRemove).toHaveBeenCalledWith('a')
  })

  const composer = (items: OpexUploadItem[], onSend = vi.fn(), onFiles = vi.fn()) =>
    render(<OpexComposer onSend={onSend} attachments={{ items, onFiles, onRetry: vi.fn(), onRemove: vi.fn() }} onStop={vi.fn()} running={false} sending={false} stopping={false} />)

  it('só arquivos já enviados liberam o Enviar (sem texto); durante o envio fica bloqueado', () => {
    const onSend = vi.fn()
    composer([upload({ status: 'confirming' })], onSend)
    const send = screen.getByRole('button', { name: 'Enviar mensagem' })
    expect(send.hasAttribute('disabled')).toBe(true)
    expect(send.getAttribute('title')).toBe('Aguarde o envio dos arquivos')
    cleanup()
    composer([upload({})], onSend)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
    expect(onSend).toHaveBeenCalledWith('')
  })

  it('colar arquivos na caixa de texto os anexa', () => {
    const onFiles = vi.fn()
    composer([], vi.fn(), onFiles)
    const pasted = new File(['png'], 'image.png', { type: 'image/png' })
    fireEvent.paste(screen.getByRole('textbox', { name: 'Mensagem para o Agente Opex' }), { clipboardData: { files: [pasted] } })
    expect(onFiles).toHaveBeenCalledWith([pasted])
  })

  it('mensagem do usuário mostra a imagem (amplia ao clicar) e o arquivo para baixar', () => {
    render(
      <UserMessage
        message={message({
          role: 'user',
          text: 'Veja',
          files: [
            { id: 'i1', name: 'print.png', mediaType: 'image/png', size: 10, kind: 'image', url: '/api/opex/files/i1' },
            { id: 'f1', name: 'erro.log', mediaType: 'text/plain', size: 2048, kind: 'text', url: '/api/opex/files/f1' },
          ],
        })}
      />,
    )
    expect(screen.getByRole('img', { name: 'print.png' }).getAttribute('src')).toContain('/api/opex/files/i1')
    expect(screen.getByRole('link', { name: /erro\.log/ }).getAttribute('href')).toContain('/api/opex/files/f1?download=1')
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar print.png' }))
    expect(screen.getByRole('dialog').querySelector('img')?.getAttribute('alt')).toBe('print.png')
  })
})

describe('citar linha da resposta', () => {
  it('o botão no fim da linha da resposta insere a citação no campo do chat sem apagar o texto', async () => {
    render(
      <ReplyTargetProvider>
        <AssistantMessage parts={[{ type: 'text', text: 'Passo um\n\nPasso dois' }]} message={message({})} />
        <OpexComposer onSend={vi.fn()} attachments={{ items: [], onFiles: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn() }} onStop={vi.fn()} running={false} sending={false} stopping={false} initialText="Sobre isto:" />
      </ReplyTargetProvider>,
    )
    const field = screen.getByRole('textbox', { name: 'Mensagem para o Agente Opex' }) as HTMLTextAreaElement
    field.setSelectionRange(field.value.length, field.value.length)
    fireEvent.click(screen.getAllByRole('button', { name: 'Citar no campo de resposta' })[1]!)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(field.value).toBe('Sobre isto:\n\n> Passo dois\n\n')
  })
})

describe('abas de sessão', () => {
  it('mostra o título de cada sessão aberta, ativa ao clicar e fecha sem excluir', () => {
    const sessions = new Map<string, OpexSessionDto>([['s1', { id: 's1', title: 'Tarefa do CRM', summary: 'Resumo', status: 'running' } as OpexSessionDto]])
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<OpexSessionTabs open={['s1']} active="draft" sessions={sessions} onActivate={onActivate} onClose={onClose} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]!.textContent).toContain('Tarefa do CRM')
    expect(tabs[0]!.textContent).toContain('Respondendo')
    expect(tabs[1]!.textContent).toContain('Nova sessão')
    fireEvent.click(screen.getByRole('tab', { name: /Tarefa do CRM/ }))
    expect(onActivate).toHaveBeenCalledWith('s1')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar a aba Tarefa do CRM' }))
    expect(onClose).toHaveBeenCalledWith('s1')
  })
})

describe('fila de envio (PUT assinado no S3)', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <OpexUploadsProvider>{children}</OpexUploadsProvider>
  const limits = { maxPerMessage: 5, maxSizeMb: 10 }
  const fileDto = { id: 'f'.repeat(24), name: 'print.png', mediaType: 'image/png', size: 3, kind: 'image', url: '/api/opex/files/x' }

  it('reserva, envia direto ao storage com progresso real e confirma', async () => {
    net.post.mockImplementation(async (url: string) =>
      url.endsWith('/files') ? { data: { data: { id: 'f'.repeat(24), method: 'PUT', url: 'https://s3.local/put', headers: { 'Content-Type': 'image/png' }, expiresIn: 900 } } } : { data: { data: fileDto } },
    )
    let finishPut: () => void = () => {}
    net.put.mockImplementation((_url: string, _file: File, options: { onUploadProgress: (event: { loaded: number; total: number }) => void }) => {
      options.onUploadProgress({ loaded: 1, total: 2 })
      return new Promise<void>((resolve) => (finishPut = resolve))
    })
    const { result } = renderHook(() => useOpexUploads('s1'), { wrapper })
    act(() => result.current.enqueue('s1', [new File(['png'], 'print.png', { type: 'image/png' })], limits))
    await waitFor(() => expect(result.current.items[0]?.progress).toBe(50))
    expect(result.current.uploading).toBe(true)
    expect(net.post).toHaveBeenCalledWith('/opex/sessions/s1/files', { name: 'print.png', size: 3, mediaType: 'image/png' }, expect.anything())
    expect(net.put).toHaveBeenCalledWith('https://s3.local/put', expect.any(File), expect.objectContaining({ headers: { 'Content-Type': 'image/png' } }))
    await act(async () => finishPut())
    await waitFor(() => expect(result.current.items[0]?.status).toBe('done'))
    expect(net.post).toHaveBeenLastCalledWith(`/opex/files/${'f'.repeat(24)}/complete`, {}, expect.anything())
    expect(result.current.ready).toHaveLength(1)
  })

  it('falha na confirmação vira erro; tentar de novo só refaz a confirmação', async () => {
    let completes = 0
    net.post.mockImplementation(async (url: string) => {
      if (url.endsWith('/files')) return { data: { data: { id: 'g'.repeat(24), method: 'PUT', url: 'https://s3.local/put', headers: {}, expiresIn: 900 } } }
      completes += 1
      if (completes === 1) throw new Error('Storage indisponível')
      return { data: { data: { ...fileDto, id: 'g'.repeat(24) } } }
    })
    net.put.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOpexUploads('s2'), { wrapper })
    act(() => result.current.enqueue('s2', [new File(['png'], 'b.png', { type: 'image/png' })], limits))
    await waitFor(() => expect(result.current.items[0]?.status).toBe('error'))
    expect(result.current.items[0]?.error).toBe('Storage indisponível')
    net.put.mockClear()
    act(() => result.current.retry(result.current.items[0]!.localId))
    await waitFor(() => expect(result.current.items[0]?.status).toBe('done'))
    expect(net.put).not.toHaveBeenCalled()
  })
})

describe('ferramentas do Agente Opex no cliente (árvore compartilhada)', () => {
  const taskTools = OPEX_CLIENT_TOOLS.filter((tool) => tool.group === 'tasks').map((tool) => tool.name)
  const openModule = (label: string) => fireEvent.click(screen.getByText(label).closest('[role="button"]')!)

  it('marca e desmarca o grupo inteiro, mostrando o total selecionado', () => {
    const onChange = vi.fn()
    render(<ClienteOpexToolsCard value={['list_tasks']} onChange={onChange} />)
    expect(screen.getByText(`1/${taskTools.length}`)).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Tarefas' }).getAttribute('aria-checked')).toBe('mixed')

    // De "mixed" o clique marca tudo.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tarefas' }))
    expect(new Set(onChange.mock.calls[0]![0] as string[])).toEqual(new Set([...taskTools, 'get_portal_overview']))
  })

  it('desmarcar o grupo cheio tira todas as ferramentas dele', () => {
    const onChange = vi.fn()
    render(<ClienteOpexToolsCard value={taskTools} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tarefas' }))
    expect(onChange.mock.calls[0]![0]).toEqual(['get_portal_overview'])
  })

  it('o contexto fica sempre ligado e travado; os grupos de admin aparecem com o selo', () => {
    const onChange = vi.fn()
    render(<ClienteOpexToolsCard value={[]} onChange={onChange} />)
    expect(screen.getAllByText('Só admin do cliente').length).toBeGreaterThan(0)
    openModule('Contexto')
    const context = screen.getByRole('checkbox', { name: 'Visão geral' })
    expect(context.getAttribute('aria-checked')).toBe('true')
    expect(context.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Sempre ligada')).toBeTruthy()
    // Desmarcar o módulo não tira o contexto.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Contexto' }))
    expect(onChange).toHaveBeenCalledWith(['get_portal_overview'])
  })

  it('marcar uma ferramenta individual mantém as demais', () => {
    const onChange = vi.fn()
    render(<ClienteOpexToolsCard value={['list_tasks']} onChange={onChange} />)
    openModule('Tarefas')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Comentar tarefa' }))
    expect(new Set(onChange.mock.calls[0]![0] as string[])).toEqual(new Set(['list_tasks', 'add_comment', 'get_portal_overview']))
  })

  it('a busca abre os módulos e filtra as ferramentas', () => {
    render(<ClienteOpexToolsCard value={[]} onChange={() => undefined} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar ferramenta' }), { target: { value: 'comentario' } })
    expect(screen.getByRole('checkbox', { name: 'Comentar tarefa' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Listar tarefas' })).toBeNull()
  })
})
