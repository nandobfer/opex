import { describe, expect, it } from 'vitest'
import { AGENTIC_PR_WATCH_JOB_ID, DEFAULT_CRON_JOBS, GITHUB_ISSUE_SYNC_JOB_ID, HEALTH_CHECK_JOB_ID, type CronJobConfig } from '@/lib/integrations/catalog'
import { withBuiltInJobs } from '@/lib/integrations/config'

describe('rotinas internas nos Crons salvos', () => {
  it('sem lista salva, usa as rotinas padrão', () => {
    expect(withBuiltInJobs(undefined)).toBe(DEFAULT_CRON_JOBS)
  })

  it('rotina interna que falta entra em quem já salvou os Crons; as salvas não mudam', () => {
    const saved: CronJobConfig[] = [
      { id: 'minha', label: 'HTTP', kind: 'http', path: '/api/routines/x', schedule: { type: 'daily', time: '03:00' }, enabled: true },
    ]
    const jobs = withBuiltInJobs(saved)
    expect(jobs[0]).toEqual(saved[0])
    expect(jobs.map((job) => job.id)).toEqual(['minha', HEALTH_CHECK_JOB_ID, GITHUB_ISSUE_SYNC_JOB_ID, AGENTIC_PR_WATCH_JOB_ID])
    expect(jobs[1]).toEqual(DEFAULT_CRON_JOBS[0])
    expect(jobs[2]).toEqual(DEFAULT_CRON_JOBS[1])
    expect(jobs[3]).toEqual(DEFAULT_CRON_JOBS[2])
  })

  it('rotina interna já salva mantém a configuração do usuário', () => {
    const saved: CronJobConfig[] = [
      { id: HEALTH_CHECK_JOB_ID, label: 'Verificação', kind: 'internal', schedule: { type: 'interval', minutes: 10 }, enabled: false },
      { id: GITHUB_ISSUE_SYNC_JOB_ID, label: 'GitHub', kind: 'internal', schedule: { type: 'interval', minutes: 10 }, enabled: false },
      { id: AGENTIC_PR_WATCH_JOB_ID, label: 'PRs', kind: 'internal', schedule: { type: 'interval', minutes: 5 }, enabled: true },
    ]
    expect(withBuiltInJobs(saved)).toBe(saved)
  })
})
