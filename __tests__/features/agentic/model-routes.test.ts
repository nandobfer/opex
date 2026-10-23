import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ setWorkbenchModel: vi.fn(), setForkModel: vi.fn(), setWorkbenchPreview: vi.fn() }))

vi.mock('@/features/agentic/server/workflow', () => ({ setWorkbenchModel: mocks.setWorkbenchModel, setWorkbenchPreview: mocks.setWorkbenchPreview }))
vi.mock('@/features/agentic/server/forks', () => ({ setForkModel: mocks.setForkModel }))

import { PUT as workbenchModelRoute } from '@/app/api/agentic/workbenches/[id]/model/route'
import { PUT as forkModelRoute } from '@/app/api/agentic/workbenches/[id]/forks/[forkId]/model/route'
import { PUT as previewRoute } from '@/app/api/agentic/workbenches/[id]/preview/route'

const request = (path: string, body: unknown) => new NextRequest(`http://localhost/api/agentic/workbenches/w1${path}`, { method: 'PUT', body: JSON.stringify(body) })
const putWorkbench = (body: unknown) => workbenchModelRoute(request('/model', body), { params: Promise.resolve({ id: 'w1' }) })
const putFork = (body: unknown) => forkModelRoute(request('/forks/f1/model', body), { params: Promise.resolve({ id: 'w1', forkId: 'f1' }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.setWorkbenchModel.mockResolvedValue({ id: 'w1' })
  mocks.setForkModel.mockResolvedValue({ id: 'f1' })
})

describe('rotas de troca de modelo', () => {
  it('mesa: aceita os papéis da conversa principal e o modelo (ou null para voltar ao padrão)', async () => {
    expect((await putWorkbench({ role: 'implementation', model: 'openai/gpt-5', variant: 'high' })).status).toBe(200)
    expect(mocks.setWorkbenchModel).toHaveBeenCalledWith('w1', { role: 'implementation', model: 'openai/gpt-5', variant: 'high' })
    expect((await putWorkbench({ role: 'pr', model: null })).status).toBe(200)
    expect(mocks.setWorkbenchModel).toHaveBeenLastCalledWith('w1', { role: 'pr', model: null, variant: null })
  })

  it('mesa: papel do fork ou desconhecido é recusado (400)', async () => {
    expect((await putWorkbench({ role: 'fork', model: 'openai/gpt-5', variant: null })).status).toBe(400)
    expect((await putWorkbench({ role: 'deploy', model: 'openai/gpt-5', variant: null })).status).toBe(400)
    expect((await putWorkbench({ model: 'openai/gpt-5' })).status).toBe(400)
    expect(mocks.setWorkbenchModel).not.toHaveBeenCalled()
  })

  it('fork: troca o modelo; modelo vazio é recusado (400)', async () => {
    expect((await putFork({ model: 'openai/gpt-5', variant: null })).status).toBe(200)
    expect(mocks.setForkModel).toHaveBeenCalledWith('w1', 'f1', { model: 'openai/gpt-5', variant: null })
    expect((await putFork({ model: '', variant: null })).status).toBe(400)
  })
})

describe('rota da chave "Gerar prévia"', () => {
  const putPreview = (body: unknown) => previewRoute(request('/preview', body), { params: Promise.resolve({ id: 'w1' }) })

  it('liga e desliga a geração de prévia da mesa', async () => {
    mocks.setWorkbenchPreview.mockResolvedValue({ id: 'w1' })
    expect((await putPreview({ enabled: false })).status).toBe(200)
    expect(mocks.setWorkbenchPreview).toHaveBeenCalledWith('w1', { enabled: false })
  })

  it('payload sem booleano é recusado (400)', async () => {
    expect((await putPreview({ enabled: 'sim' })).status).toBe(400)
    expect((await putPreview({})).status).toBe(400)
    expect(mocks.setWorkbenchPreview).not.toHaveBeenCalled()
  })
})
