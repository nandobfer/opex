import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface Job {
  needs?: string | string[]
  strategy?: { 'fail-fast'?: boolean; matrix?: { shard?: number[] } }
  steps?: Array<{ name?: string; run?: string; uses?: string; with?: Record<string, unknown> }>
}

// Lido do disco em tempo de teste: o comportamento da prévia é o do YAML versionado.
const workflow = parse(
  readFileSync(new URL('../../.github/workflows/preview.yml', import.meta.url), 'utf8'),
) as { jobs?: Record<string, Job> }
const jobs = workflow.jobs ?? {}
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> }

const runs = (job: Job | undefined) => (job?.steps ?? []).map((step) => step.run ?? '')

describe('workflow Preview: testes em paralelo com o build', () => {
  it('roda a suíte em 4 shards, num job separado do build', () => {
    expect(jobs.vitest?.strategy?.matrix?.shard).toEqual([1, 2, 3, 4])
    expect(jobs.vitest?.strategy?.['fail-fast']).toBe(true)
    expect(runs(jobs.vitest).some((run) => run.includes('pnpm test --shard='))).toBe(true)
  })

  it('o build não espera os testes nem roda a suíte', () => {
    expect(jobs.preview?.needs).toBeUndefined()
    expect(runs(jobs.preview).some((run) => run.includes('pnpm test'))).toBe(false)
    expect(runs(jobs.preview).some((run) => run.includes('docker buildx build'))).toBe(true)
  })

  it('o artefato mantém o nome que o scripts/preview-github.ts baixa', () => {
    const upload = (jobs.preview?.steps ?? []).find((step) => step.uses?.startsWith('actions/upload-artifact@'))
    expect(upload?.with?.name).toBe('preview-${{ inputs.attempt }}')
  })

  it('os dois jobs validam os inputs antes do checkout do SHA', () => {
    for (const job of [jobs.vitest, jobs.preview]) {
      const steps = job?.steps ?? []
      const validate = steps.findIndex((step) => step.name === 'Validar inputs')
      const checkout = steps.findIndex((step) => step.uses?.startsWith('actions/checkout@'))
      expect(validate).toBeGreaterThan(-1)
      expect(checkout).toBeGreaterThan(validate)
    }
  })

  it('o build de produção usa Webpack', () => {
    expect(pkg.scripts.build).toBe('next build --webpack')
  })
})
