import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), run: vi.fn() }))

vi.mock('@/features/ai/server/understand-task', () => ({ prepareUnderstandTask: mocks.prepare, runUnderstandTask: mocks.run }))

import { DomainError } from '@/lib/api/route'
import { POST } from '@/app/api/tasks/[id]/understand/route'

const call = () => POST(new NextRequest('http://localhost/api/tasks/t1/understand', { method: 'POST' }), { params: Promise.resolve({ id: 't1' }) })

beforeEach(() => vi.clearAllMocks())

describe('POST /api/tasks/[id]/understand', () => {
  it('responde NDJSON com os eventos da geração', async () => {
    mocks.prepare.mockResolvedValue({ taskId: 't1' })
    mocks.run.mockImplementation(async function* () {
      yield { type: 'start', provider: 'gemini', model: 'gemini-3-flash', agent: null }
      yield { type: 'delta', text: 'Olá' }
      yield { type: 'done', finishReason: 'stop', durationMs: 10, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: null } }
    })
    const res = await call()
    expect(res.headers.get('Content-Type')).toContain('application/x-ndjson')
    const lines = (await res.text()).trim().split('\n').map((line) => JSON.parse(line) as { type: string })
    expect(lines.map((line) => line.type)).toEqual(['start', 'delta', 'done'])
    expect(mocks.prepare).toHaveBeenCalledWith('t1')
  })

  it('feature indisponível responde 409 em JSON, sem abrir o stream', async () => {
    mocks.prepare.mockRejectedValue(new DomainError(409, 'Gemini não está conectado', 'AI_FEATURE_UNAVAILABLE'))
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ success: false, error: 'Gemini não está conectado' })
    expect(mocks.run).not.toHaveBeenCalled()
  })
})
