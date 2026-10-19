import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  state: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: mocks.config }))
vi.mock('@/lib/db/models/CronJobState', () => ({ CronJobState: { findOne: () => ({ select: () => ({ lean: mocks.state }) }) } }))

import { loadPrWatchSchedule } from '@/features/agentic/server/pr-watch-schedule'

const now = new Date('2026-10-16T12:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.config.mockResolvedValue({ schedulerEnabled: true, jobs: [{ id: 'agentic-pr-watch', enabled: true }] })
  mocks.state.mockResolvedValue({ nextRunAt: new Date('2026-10-16T12:02:00.000Z'), lockedUntil: null })
})

describe('loadPrWatchSchedule', () => {
  it('rotina ligada: próxima verificação e se está executando', async () => {
    expect(await loadPrWatchSchedule(now)).toEqual({ enabled: true, nextCheckAt: '2026-10-16T12:02:00.000Z', running: false })
    mocks.state.mockResolvedValue({ nextRunAt: new Date('2026-10-16T12:02:00.000Z'), lockedUntil: new Date('2026-10-16T12:15:00.000Z') })
    expect((await loadPrWatchSchedule(now)).running).toBe(true)
  })

  it('agendador ou rotina desligados: sem próxima verificação', async () => {
    mocks.config.mockResolvedValue({ schedulerEnabled: false, jobs: [{ id: 'agentic-pr-watch', enabled: true }] })
    expect(await loadPrWatchSchedule(now)).toMatchObject({ enabled: false, nextCheckAt: null })
    mocks.config.mockResolvedValue({ schedulerEnabled: true, jobs: [{ id: 'agentic-pr-watch', enabled: false }] })
    expect((await loadPrWatchSchedule(now)).enabled).toBe(false)
    mocks.config.mockResolvedValue({ schedulerEnabled: true, jobs: [] })
    expect((await loadPrWatchSchedule(now)).enabled).toBe(false)
  })

  it('sem estado gravado ainda: ligada, mas sem horário', async () => {
    mocks.state.mockResolvedValue(null)
    expect(await loadPrWatchSchedule(now)).toEqual({ enabled: true, nextCheckAt: null, running: false })
  })
})
