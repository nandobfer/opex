import { execSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import { BOOTSTRAP_ENV_VARS_LIMIT, bootstrapCentralConfig, bootstrapEnvironmentInput, envVariableCount } from '@/features/project-bootstrap/environment-input'
import { missingDeliverables, requiredDeliverables, verificationCommand } from '@/features/project-bootstrap/host-checks'
import { buildBootstrapInstructions, buildEnvironmentChangePrompt, type BootstrapPromptInput } from '@/features/project-bootstrap/prompts'
import { parseBootstrapResult } from '@/features/project-bootstrap/result'
import { sessionSkills } from '@/features/project-bootstrap/skills'
import { resolvedTrackIndex, stepperState } from '@/features/project-bootstrap/steps'
import { environmentToggleState } from '@/features/project-bootstrap/view'

/** OPE-215 (v5): ambiente e deploy opcionais — projetos que não rodam em container pulam a etapa 4. */

const block = (body: string) => `pronto\n\`\`\`json bootstrap-result\n${body}\n\`\`\``

describe('resumo final do agente', () => {
  it('com ambiente, porta e health check continuam obrigatórios', () => {
    expect(parseBootstrapResult(block('{ "hasServer": false, "usesMongo": false, "branch": "main" }'))).toMatchObject({ ok: false, reason: 'invalid', detail: expect.stringContaining('port') })
    expect(parseBootstrapResult(block('{ "port": 4014, "hasServer": true, "usesMongo": false, "branch": "main" }'), { withEnvironment: true })).toMatchObject({ ok: false, detail: expect.stringContaining('healthPath') })
    expect(parseBootstrapResult(block('{ "port": 4014, "healthPath": "/api/health", "hasServer": true, "usesMongo": true, "branch": "main" }'))).toMatchObject({ ok: true, result: { port: 4014 } })
  })

  it('sem ambiente, aceita o bloco sem porta e ignora a que vier', () => {
    expect(parseBootstrapResult(block('{ "hasServer": false, "usesMongo": false, "branch": "main" }'), { withEnvironment: false })).toEqual({ ok: true, result: { hasServer: false, usesMongo: false, branch: 'main', port: null, healthPath: null } })
    expect(parseBootstrapResult(block('{ "port": 4014, "healthPath": "/x", "hasServer": true, "usesMongo": false, "branch": "main" }'), { withEnvironment: false })).toMatchObject({ ok: true, result: { port: null, healthPath: null } })
  })
})

describe('instruções do agente', () => {
  const input: BootstrapPromptInput = { repo: 'org/plugin', owner: 'org', name: 'plugin', visibility: 'private', mode: 'new', branch: 'main', directory: '/home/u/code/plugin', context: 'Plugin do OpenCode', technologies: [], skills: ['bootstrap-agents-md'], instructions: '' }

  it('sem ambiente: nada de Dockerfile, compose, porta, /home/used_ports nem deploy do Opex', () => {
    const text = buildBootstrapInstructions({ ...input, withEnvironment: false })
    expect(text).toContain('NÃO roda em container')
    expect(text).toContain('NÃO crie `Dockerfile`')
    expect(text).not.toContain('o Opex faz o deploy')
    expect(text).not.toContain('docker ps')
    expect(text).not.toMatch(/`<porta> ->/)
    expect(text).not.toContain('"port"')
  })

  it('com ambiente (padrão), igual a antes: compose, porta e deploy', () => {
    const text = buildBootstrapInstructions(input)
    expect(text).toContain('`docker-compose.yml`')
    expect(text).toContain('`<porta> -> plugin`')
    expect(text).toContain('o Opex faz o deploy')
    expect(text).toContain('"port": 4014')
  })

  it('o aviso de mudança diz ao agente o que fazer nos dois sentidos', () => {
    expect(buildEnvironmentChangePrompt(false)).toContain('DESLIGOU')
    expect(buildEnvironmentChangePrompt(true)).toContain('LIGOU')
  })
})

describe('conferência no host sem ambiente', () => {
  it('exige só o git e o .env ignorado (quando existe)', () => {
    expect(requiredDeliverables(false)).toEqual(['git', 'origin', 'push', 'clean', 'envIgnored'])
    expect(requiredDeliverables(true)).toEqual(expect.arrayContaining(['compose', 'port', 'portFree', 'env']))
    const output = 'GIT=ok\nORIGIN=https://github.com/org/plugin.git\nPUSH=ok\nCLEAN=ok\nENVIGNORED=ok'
    expect(missingDeliverables(output, 'org/plugin', false)).toEqual([])
    expect(missingDeliverables(output, 'org/plugin', true)).toEqual(expect.arrayContaining(['compose', 'port']))
  })

  const dirs: string[] = []
  const temp = (prefix: string) => {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    dirs.push(dir)
    return dir
  }
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('roda de verdade: sem .env passa, .env não ignorado falha, e não chama docker nem ss', () => {
    const bin = temp('bootstrap-bin-')
    const marker = join(bin, 'chamado')
    for (const tool of ['docker', 'ss']) {
      writeFileSync(join(bin, tool), `#!/bin/sh\ntouch '${marker}'\n`)
      chmodSync(join(bin, tool), 0o755)
    }
    const remote = temp('bootstrap-remote-')
    const dir = temp('bootstrap-repo-')
    const git = (args: string, cwd = dir) => execSync(`git ${args}`, { cwd, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
    git('init -q --bare', remote)
    git('init -q -b main')
    git(`remote add origin ${remote}`)
    writeFileSync(join(dir, 'README.md'), '# plugin\n')
    git('add -A')
    git('commit -qm init')
    git('push -q origin main')
    const run = () => execSync(verificationCommand({ directory: dir, branch: 'main', withEnvironment: false }), { shell: '/bin/sh', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }).toString()

    const clean = run()
    expect(clean).toContain('ENVIGNORED=ok')
    expect(clean).toContain('PUSH=ok')
    expect(clean).not.toMatch(/COMPOSE=|PORT=|PORTFREE=|ENV=/)

    writeFileSync(join(dir, '.env'), 'TOKEN=x\n')
    expect(run()).toContain('ENVIGNORED=missing')
    expect(existsSync(marker)).toBe(false)
  })
})

describe('skills da sessão', () => {
  it('sem ambiente, as skills só com ambiente saem; com ambiente, todas ficam', () => {
    const skills = ['bootstrap-agents-md', 'bootstrap-aicontext', 'bootstrap-docker']
    expect(sessionSkills(skills, ['bootstrap-docker'], false)).toEqual(['bootstrap-agents-md', 'bootstrap-aicontext'])
    expect(sessionSkills(skills, ['Bootstrap-Docker'], false)).not.toContain('bootstrap-docker')
    expect(sessionSkills(skills, ['bootstrap-docker'], true)).toEqual(skills)
    // Só conta o que está nas duas listas.
    expect(sessionSkills(['a'], ['b'], false)).toEqual(['a'])
  })
})

describe('stepper', () => {
  it('a trilha verde vai até a última etapa concluída ou pulada em sequência', () => {
    expect(resolvedTrackIndex(['done', 'running', 'idle'])).toBe(0)
    expect(resolvedTrackIndex(['done', 'done', 'skipped', 'done'])).toBe(3)
    expect(resolvedTrackIndex(['running', 'done'])).toBe(-1)
    expect(resolvedTrackIndex([])).toBe(-1)
  })

  it('concluído sem ambiente: a etapa de deploy aparece pulada com o rótulo', () => {
    const states = stepperState({ step: 'done', status: 'done', phase: null, attempt: 1, withEnvironment: false })
    expect(states.find((state) => state.id === 'deploy')).toEqual({ id: 'deploy', status: 'skipped', progress: 1, badge: 'Sem ambiente' })
    expect(stepperState({ step: 'done', status: 'done', phase: null, attempt: 1 }).find((state) => state.id === 'deploy')?.status).toBe('done')
  })
})

describe('chave do ambiente na página', () => {
  it('aparece com o bootstrap aberto; ligar de novo só na etapa 2; desligar não vale com deploy em andamento', () => {
    expect(environmentToggleState({ step: 'provision', status: 'running', withEnvironment: true })).toEqual({ visible: true, disabled: false, reason: null })
    expect(environmentToggleState({ step: 'provision', status: 'failed', withEnvironment: false }).disabled).toBe(false)
    expect(environmentToggleState({ step: 'link', status: 'failed', withEnvironment: false })).toMatchObject({ visible: true, disabled: true })
    expect(environmentToggleState({ step: 'deploy', status: 'running', withEnvironment: true })).toMatchObject({ disabled: true, reason: expect.stringContaining('deploy em andamento') })
    expect(environmentToggleState({ step: 'deploy', status: 'failed', withEnvironment: true }).disabled).toBe(false)
    expect(environmentToggleState({ step: 'done', status: 'done', withEnvironment: false }).visible).toBe(false)
    expect(environmentToggleState({ step: 'provision', status: 'cancelled', withEnvironment: true }).visible).toBe(false)
  })
})

describe('variáveis do .env', () => {
  it('conta sem repetir chave e nunca corta na importação', () => {
    expect(envVariableCount('A=1\nB=2\nA=3\n# comentário\n')).toBe(2)
    const text = Array.from({ length: BOOTSTRAP_ENV_VARS_LIMIT + 1 }, (_, index) => `V${index}=x`).join('\n')
    expect(envVariableCount(text)).toBe(101)
    const input = bootstrapEnvironmentInput({ repoName: 'app', centralId: 'c'.repeat(24), result: { port: 4014, healthPath: '/', hasServer: true, usesMongo: false, branch: 'main' } }, text)
    expect(input.env).toHaveLength(101)
  })
})

describe('central sem ambiente', () => {
  it('mantém branch e backup pelo MongoDB e não mexe no caminho de saúde sem porta', () => {
    const base = defaultCentralConfig('/home/u/code/plugin')
    const config = bootstrapCentralConfig(base, { branch: 'main', usesMongo: false, hasServer: false, healthPath: null, port: null })
    expect(config.git.baseBranch).toBe('main')
    expect(config.environment.backupDatabase).toBe(false)
    expect(config.environment.healthPath).toBe(base.environment.healthPath)
  })
})
