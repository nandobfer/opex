import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface Job {
  name?: string
  needs?: string | string[]
  if?: string
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean | string }
  strategy?: { matrix?: { shard?: number[] } }
  steps?: Array<{ name?: string; run?: string }>
}

interface Workflow {
  on?: Record<string, unknown>
  jobs?: Record<string, Job>
}

// Lido do disco em tempo de teste: o comportamento do pipeline é o do YAML versionado.
const workflow = parse(
  readFileSync(new URL('../../.github/workflows/ci-cd.yml', import.meta.url), 'utf8'),
) as Workflow
const jobs = workflow.jobs ?? {}

describe('workflow CI/CD (OPE-140)', () => {
  it('não roda a suíte Vitest no push da main', () => {
    expect(jobs.vitest?.if).toBe("github.event_name == 'pull_request'")
  })

  it('o build não espera o job de testes', () => {
    const needs = jobs.build?.needs
    expect(needs).toBeUndefined()
  })

  it('o build e o deploy continuam restritos à main, encadeados entre si', () => {
    const mainOnly = "github.event_name != 'pull_request' && github.ref == 'refs/heads/main'"
    expect(jobs.build?.if).toBe(mainOnly)
    expect(jobs.deploy?.if).toBe(mainOnly)
    expect(jobs.deploy?.needs).toBe('build')
  })

  it('o pull request continua rodando a suíte nos 4 shards', () => {
    expect(jobs.vitest?.strategy?.matrix?.shard).toEqual([1, 2, 3, 4])
    expect(jobs.vitest?.concurrency?.group).toContain('matrix.shard')
    // O YAML escreve a condição booleana como expressão `${{ … }}`.
    expect(String(jobs.vitest?.concurrency?.['cancel-in-progress'])).toContain(
      "github.event_name == 'pull_request'",
    )
    const commands = (jobs.vitest?.steps ?? []).map((step) => step.run ?? '')
    expect(commands.some((run) => run.includes('pnpm test --shard='))).toBe(true)
  })

  it('mantém os gatilhos do workflow (push na main, pull request e dispatch)', () => {
    const push = workflow.on?.push as { branches?: string[] } | undefined
    expect(push?.branches).toEqual(['main'])
    expect(workflow.on).toHaveProperty('pull_request')
    expect(workflow.on).toHaveProperty('workflow_dispatch')
  })
})
