import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai/opencode-client', () => ({ runOpencodeShell: vi.fn() }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: {} }))

import { REMOTE_BUILD_MIN_MINUTES, remotePreviewTimeoutMinutes } from '@/features/agentic/server/remote-preview'

/**
 * Prazo da prévia remota: o script do GitHub Action espera testes + build (mín. 25 min). Antes, a tentativa gravava
 * o valor cru de `buildTimeoutMinutes` (20) e o script cancelava o run no meio do build.
 */
describe('remotePreviewTimeoutMinutes', () => {
  it('nunca fica abaixo do mínimo do GitHub Action, mesmo com o build configurado menor', () => {
    expect(REMOTE_BUILD_MIN_MINUTES).toBe(25)
    expect(remotePreviewTimeoutMinutes(20)).toBe(25)
    expect(remotePreviewTimeoutMinutes(2)).toBe(25)
  })

  it('mantém o prazo configurado quando ele é maior que o mínimo', () => {
    expect(remotePreviewTimeoutMinutes(40)).toBe(40)
    expect(remotePreviewTimeoutMinutes(120)).toBe(120)
  })
})
