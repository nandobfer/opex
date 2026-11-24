import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Registro de MCP remoto por diretório (OPE-178): com `requireConnected` (MCP da mesa), só conta o
 * diretório em que o OpenCode informa o servidor `connected` — URL pública inalcançável ou segredo
 * divergente deixam o servidor `failed` e o registro falha (o turno manda os dados da mesa no prompt).
 */

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { ensureRemoteMcp, REMOTE_MCP_STATUS_POLLS } from '@/features/ai/server/opencode-mcp'
import type { OpencodeClient } from '@/lib/ai/opencode-client'

type Status = { status: string; error?: string }

function fakeClient(statusAfterAdd: Status) {
  const servers = new Map<string, Status>()
  const client = {
    mcp: {
      list: vi.fn(async () => ({ data: [...servers].map(([name, status]) => ({ name, status })) })),
      add: vi.fn(async ({ server }: { server: string }) => void servers.set(server, statusAfterAdd)),
      remove: vi.fn(async ({ server }: { server: string }) => void servers.delete(server)),
    },
  }
  return { client: client as unknown as OpencodeClient, raw: client, servers }
}

let seq = 0
const target = (requireConnected: boolean) => ({ server: `opex_mesa_${++seq}`, url: `https://opex.local/api/agentic/mcp?${seq}`, secret: 's', label: 'MCP da mesa', requireConnected })

beforeEach(() => vi.clearAllMocks())

describe('ensureRemoteMcp com requireConnected', () => {
  it('servidor conectado: registro ok', async () => {
    const { client } = fakeClient({ status: 'connected' })
    expect(await ensureRemoteMcp(client, target(true), ['/w'])).toEqual({ ok: true, error: null, skipped: [] })
  })

  it('servidor registrado mas em failed: registro falha com o motivo do OpenCode', async () => {
    const { client } = fakeClient({ status: 'failed', error: 'fetch failed' })
    const result = await ensureRemoteMcp(client, target(true), ['/w'])
    expect(result.ok).toBe(false)
    expect(result.error).toContain('status: failed — fetch failed')
  })

  it('já registrado neste processo, mas o servidor caiu: refaz o registro em vez de confiar no cache', async () => {
    const { client, raw, servers } = fakeClient({ status: 'connected' })
    const t = target(true)
    await ensureRemoteMcp(client, t, ['/w'])
    servers.set(t.server, { status: 'failed', error: 'down' })
    raw.mcp.add.mockImplementationOnce(async ({ server }: { server: string }) => void servers.set(server, { status: 'failed', error: 'down' }))
    const result = await ensureRemoteMcp(client, t, ['/w'])
    expect(raw.mcp.remove).toHaveBeenCalledTimes(1)
    expect(raw.mcp.add).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(false)
  })

  it('pending nas primeiras leituras e connected depois: espera a conexão e o registro fica ok', async () => {
    const { client, raw, servers } = fakeClient({ status: 'pending' })
    const t = target(true)
    let reads = 0
    raw.mcp.list.mockImplementation(async () => {
      // Depois do registro, as duas primeiras leituras do status ainda estão pending.
      if (servers.has(t.server) && ++reads > 2) servers.set(t.server, { status: 'connected' })
      return { data: [...servers].map(([name, status]) => ({ name, status })) }
    })
    expect(await ensureRemoteMcp(client, t, ['/w'])).toEqual({ ok: true, error: null, skipped: [] })
    expect(reads).toBe(3)
  })

  it('pending em todas as leituras: esgota as tentativas e falha com o status pending', async () => {
    const { client, raw } = fakeClient({ status: 'pending' })
    const result = await ensureRemoteMcp(client, target(true), ['/w'])
    expect(result.ok).toBe(false)
    expect(result.error).toContain('status: pending')
    // Uma leitura antes do registro + todas as leituras do status depois dele.
    expect(raw.mcp.list).toHaveBeenCalledTimes(1 + REMOTE_MCP_STATUS_POLLS)
  })

  it('sem requireConnected (MCP de memórias) o comportamento continua o de antes', async () => {
    const { client } = fakeClient({ status: 'failed' })
    expect((await ensureRemoteMcp(client, target(false), ['/w'])).ok).toBe(true)
  })
})
