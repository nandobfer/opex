import { describe, expect, it } from 'vitest'
import { AGENTIC_PR_WATCH_JOB_ID, AGENTIC_QUEUE_JOB_ID, ATTACHMENT_CLEANUP_JOB_ID, DEFAULT_CRON_JOBS, ENVIRONMENTS_JOB_ID, GITHUB_ISSUE_SYNC_JOB_ID, HEALTH_CHECK_JOB_ID, TASK_SUMMARY_JOB_ID, TASK_TAGS_CONCLUDED_JOB_ID, TASK_TAGS_JOB_ID, type CronJobConfig } from '@/lib/integrations/catalog'
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
    expect(jobs.map((job) => job.id)).toEqual(['minha', HEALTH_CHECK_JOB_ID, GITHUB_ISSUE_SYNC_JOB_ID, AGENTIC_PR_WATCH_JOB_ID, AGENTIC_QUEUE_JOB_ID, TASK_SUMMARY_JOB_ID, TASK_TAGS_JOB_ID, TASK_TAGS_CONCLUDED_JOB_ID, ATTACHMENT_CLEANUP_JOB_ID, ENVIRONMENTS_JOB_ID])
    expect(jobs[1]).toEqual(DEFAULT_CRON_JOBS[0])
    expect(jobs[2]).toEqual(DEFAULT_CRON_JOBS[1])
    expect(jobs[3]).toEqual(DEFAULT_CRON_JOBS[2])
    expect(jobs[4]).toEqual(DEFAULT_CRON_JOBS[3])
    expect(jobs[5]).toEqual(DEFAULT_CRON_JOBS[4])
    expect(jobs[6]).toEqual(DEFAULT_CRON_JOBS[5])
    expect(jobs[7]).toEqual(DEFAULT_CRON_JOBS[6])
    expect(jobs[8]).toEqual(DEFAULT_CRON_JOBS[7])
    expect(jobs[9]).toEqual(DEFAULT_CRON_JOBS[8])
  })

  it('rotina interna já salva mantém a configuração do usuário', () => {
    const saved: CronJobConfig[] = [
      { id: HEALTH_CHECK_JOB_ID, label: 'Verificação', kind: 'internal', schedule: { type: 'interval', minutes: 10 }, enabled: false },
      { id: GITHUB_ISSUE_SYNC_JOB_ID, label: 'GitHub', kind: 'internal', schedule: { type: 'interval', minutes: 10 }, enabled: false },
      { id: AGENTIC_PR_WATCH_JOB_ID, label: 'PRs', kind: 'internal', schedule: { type: 'interval', minutes: 5 }, enabled: true },
      { id: AGENTIC_QUEUE_JOB_ID, label: 'Fila', kind: 'internal', schedule: { type: 'interval', minutes: 2 }, enabled: true },
      { id: TASK_SUMMARY_JOB_ID, label: 'Resumos', kind: 'internal', schedule: { type: 'interval', minutes: 2 }, enabled: true },
      { id: TASK_TAGS_JOB_ID, label: 'Tags', kind: 'internal', schedule: { type: 'interval', minutes: 3 }, enabled: true },
      { id: TASK_TAGS_CONCLUDED_JOB_ID, label: 'Tags concluídas', kind: 'internal', schedule: { type: 'interval', minutes: 60 }, enabled: false, scope: 'pending' },
      { id: ATTACHMENT_CLEANUP_JOB_ID, label: 'Anexos', kind: 'internal', schedule: { type: 'interval', minutes: 30 }, enabled: true },
      { id: ENVIRONMENTS_JOB_ID, label: 'Ambientes', kind: 'internal', schedule: { type: 'interval', minutes: 1 }, enabled: true },
    ]
    expect(withBuiltInJobs(saved)).toBe(saved)
  })
})
