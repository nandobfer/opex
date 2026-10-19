import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  openFork: vi.fn(),
  listForks: vi.fn(),
  sendForkMessage: vi.fn(),
  closeFork: vi.fn(),
  reviseForkSummary: vi.fn(),
  applyForkIntegration: vi.fn(),
  discardFork: vi.fn(),
  resolveForksDonePrompt: vi.fn(),
  setForkMode: vi.fn(),
  lockFork: vi.fn(),
}))

vi.mock('@/features/agentic/server/forks', () => ({
  ...mocks,
  getFork: vi.fn(),
  resumeFork: vi.fn(),
  interruptFork: vi.fn(),
  retryFork: vi.fn(),
  integrateFork: vi.fn(),
  cancelForkIntegration: vi.fn(),
}))

import { GET as listRoute, POST as openRoute } from '@/app/api/agentic/workbenches/[id]/forks/route'
import { DELETE as discardRoute } from '@/app/api/agentic/workbenches/[id]/forks/[forkId]/route'
import { POST as messageRoute } from '@/app/api/agentic/workbenches/[id]/forks/[forkId]/messages/route'
import { POST as actionRoute } from '@/app/api/agentic/workbenches/[id]/forks/[forkId]/actions/[action]/route'
import { POST as donePromptRoute } from '@/app/api/agentic/workbenches/[id]/forks/done-prompt/route'

const request = (path: string, method = 'POST', body?: unknown) => new NextRequest(`http://localhost/api/agentic/workbenches/w1/forks${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
const action = (name: string, body?: unknown) => actionRoute(request(`/f1/actions/${name}`, 'POST', body), { params: Promise.resolve({ id: 'w1', forkId: 'f1', action: name }) })

beforeEach(() => vi.clearAllMocks())

describe('rotas dos forks da conversa', () => {
  it('abrir exige a primeira mensagem; listar devolve os forks', async () => {
    mocks.openFork.mockResolvedValue({ id: 'f1' })
    mocks.listForks.mockResolvedValue([])
    expect((await openRoute(request('', 'POST', { text: '  ' }), { params: Promise.resolve({ id: 'w1' }) })).status).toBe(400)
    expect((await openRoute(request('', 'POST', { text: 'Por que X?' }), { params: Promise.resolve({ id: 'w1' }) })).status).toBe(200)
    expect(mocks.openFork).toHaveBeenCalledWith('w1', 'Por que X?', { parentForkId: undefined, readOnly: undefined, mode: undefined })
    expect((await openRoute(request('', 'POST', { text: 'E o Y?', parentForkId: 'f1' }), { params: Promise.resolve({ id: 'w1' }) })).status).toBe(200)
    expect(mocks.openFork).toHaveBeenLastCalledWith('w1', 'E o Y?', { parentForkId: 'f1', readOnly: undefined, mode: undefined })
    expect((await listRoute(request('', 'GET'), { params: Promise.resolve({ id: 'w1' }) })).status).toBe(200)
  })

  it('mensagem no fork e ações sem corpo', async () => {
    mocks.sendForkMessage.mockResolvedValue({ id: 'f1' })
    mocks.closeFork.mockResolvedValue({ id: 'f1' })
    expect((await messageRoute(request('/f1/messages', 'POST', { text: 'e Y?' }), { params: Promise.resolve({ id: 'w1', forkId: 'f1' }) })).status).toBe(200)
    expect(mocks.sendForkMessage).toHaveBeenCalledWith('w1', 'f1', 'e Y?')
    expect((await action('close')).status).toBe(200)
    expect(mocks.closeFork).toHaveBeenCalledWith('w1', 'f1')
    expect((await action('apagar-tudo')).status).toBe(404)
  })

  it('modificar o resumo exige texto; aplicar exige um destino válido', async () => {
    mocks.reviseForkSummary.mockResolvedValue({ id: 'f1' })
    mocks.applyForkIntegration.mockResolvedValue({ id: 'f1' })
    expect((await action('revise-summary', { text: 'x' })).status).toBe(400)
    expect((await action('revise-summary', { text: 'Inclua o Y' })).status).toBe(200)
    expect((await action('apply', { target: 'lixo' })).status).toBe(400)
    expect((await action('apply', { target: 'context' })).status).toBe(200)
    expect(mocks.applyForkIntegration).toHaveBeenCalledWith('w1', 'f1', 'context')
  })

  it('abrir aceita readOnly e mode; recusa valores inválidos', async () => {
    mocks.openFork.mockResolvedValue({ id: 'f1' })
    const open = (body: unknown) => openRoute(request('', 'POST', body), { params: Promise.resolve({ id: 'w1' }) })
    expect((await open({ text: 'Investigue', readOnly: true })).status).toBe(200)
    expect(mocks.openFork).toHaveBeenLastCalledWith('w1', 'Investigue', { parentForkId: undefined, readOnly: true, mode: undefined })
    expect((await open({ text: 'Altere', mode: 'build' })).status).toBe(200)
    expect(mocks.openFork).toHaveBeenLastCalledWith('w1', 'Altere', { parentForkId: undefined, readOnly: undefined, mode: 'build' })
    expect((await open({ text: 'x', readOnly: 'sim' })).status).toBe(400)
    expect((await open({ text: 'x', mode: 'edit' })).status).toBe(400)
  })

  it('set-mode exige Plan ou Build; lock não tem corpo', async () => {
    mocks.setForkMode.mockResolvedValue({ id: 'f1', mode: 'build' })
    mocks.lockFork.mockResolvedValue({ id: 'f1', mode: 'plan', readOnly: true })
    expect((await action('set-mode', { mode: 'write' })).status).toBe(400)
    expect((await action('set-mode', {})).status).toBe(400)
    expect((await action('set-mode', { mode: 'build' })).status).toBe(200)
    expect(mocks.setForkMode).toHaveBeenCalledWith('w1', 'f1', 'build')
    expect((await action('lock')).status).toBe(200)
    expect(mocks.lockFork).toHaveBeenCalledWith('w1', 'f1')
  })

  it('descartar e responder à pergunta da mesa concluída', async () => {
    mocks.resolveForksDonePrompt.mockResolvedValue({ id: 'w1' })
    expect((await discardRoute(request('/f1', 'DELETE'), { params: Promise.resolve({ id: 'w1', forkId: 'f1' }) })).status).toBe(200)
    expect(mocks.discardFork).toHaveBeenCalledWith('w1', 'f1')
    expect((await donePromptRoute(request('/done-prompt', 'POST', { decision: 'talvez' }), { params: Promise.resolve({ id: 'w1' }) })).status).toBe(400)
    expect((await donePromptRoute(request('/done-prompt', 'POST', { decision: 'keep' }), { params: Promise.resolve({ id: 'w1' }) })).status).toBe(200)
    expect(mocks.resolveForksDonePrompt).toHaveBeenCalledWith('w1', 'keep')
  })
})
