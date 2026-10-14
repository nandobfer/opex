import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const mocks = vi.hoisted(() => ({ exec: vi.fn(), busy: false }))
vi.mock('node:child_process', () => ({ execFileSync: mocks.exec }))
vi.mock('node:net', () => ({ createServer: () => {
  let fail: () => void
  const server = { once: (_event: string, cb: () => void) => { fail = cb; return server }, listen: (_port: number, _host: string, cb: () => void) => { if (mocks.busy) fail(); else cb() }, close: (cb: () => void) => cb() }
  return server
} }))
import { runPreview, validateState, validateManifest, type PreviewState } from '../../scripts/preview-github'

let dir: string
let statePath: string
let state: PreviewState
let conclusion = 'success'
const sha = 'a'.repeat(40)

beforeEach(() => {
  vi.clearAllMocks()
  dir = mkdtempSync(join(tmpdir(), 'opex-preview-test-'))
  statePath = join(dir, 'state.json')
  state = { attempt: 'one', currentPath: join(dir, 'current'), active: true, repo: 'org/app', branch: 'feat/task', worktreePath: dir, composeProject: 'app-task', composeFile: 'docker-compose.yml', service: 'app', portEnvVar: 'PORT', port: 4010, min: 4001, max: 4098, workflow: 'preview.yml', timeoutMinutes: 20, healthPath: '/', previewHost: 'localhost', backupPath: join(dir, 'backup') }
  writeFileSync(state.currentPath, 'one')
  writeFileSync(statePath, JSON.stringify(state))
  writeFileSync(state.backupPath, 'backup')
  conclusion = 'success'
  mocks.busy = false
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200 })))
  mocks.exec.mockImplementation((name: string, args: string[]) => {
    if (name === 'git') {
      if (args[0] === 'status') return ''
      if (args[0] === 'rev-parse') return sha
      if (args[0] === 'branch') return state.branch
      return ''
    }
    if (name === 'gh') {
      if (args[0] === 'repo') return state.repo
      if (args[0] === 'api') return 'main'
      if (args[1] === 'list') return JSON.stringify([{ databaseId: 9, displayTitle: 'preview-one' }])
      if (args[1] === 'view') return JSON.stringify({ status: 'completed', conclusion })
      if (args[1] === 'download') {
        const target = args[args.indexOf('--dir') + 1]
        const archive = Buffer.from('image')
        writeFileSync(join(target, 'image.tar.gz'), archive)
        writeFileSync(join(target, 'manifest.json'), JSON.stringify({ attempt: 'one', sha, image: 'opex-preview:one', checksum: createHash('sha256').update(archive).digest('hex') }))
      }
      return ''
    }
    if (args[0] === 'image') return 'image-id'
    if (args[0] === 'inspect') return 'image-id'
    if (args.includes('ps')) return mocks.busy ? '' : 'container'
    return ''
  })
})
afterEach(() => { vi.unstubAllGlobals(); rmSync(dir, { recursive: true, force: true }) })

describe('prévia remota', () => {
  it('testa/builda via dispatch e publica somente a imagem validada na porta reservada', async () => {
    await runPreview(statePath, 'one')
    const saved = JSON.parse(readFileSync(statePath, 'utf8'))
    expect(saved).toMatchObject({ sha, runId: 9, published: true })
    expect(mocks.exec).toHaveBeenCalledWith('gh', expect.arrayContaining(['workflow', 'run', 'preview.yml', '--ref', 'main']), expect.anything())
    const up = mocks.exec.mock.calls.find(([name]) => name === 'flock')!
    expect(JSON.parse(up[1].at(-1))).toEqual(expect.arrayContaining(['--no-build', '--pull', 'never']))
    expect(up[2].env.PORT).toBe('4010')
  })

  it('testes falhando impedem download e publicação', async () => {
    conclusion = 'failure'
    await expect(runPreview(statePath, 'one')).rejects.toThrow('Testes/build remoto falharam')
    expect(mocks.exec.mock.calls.some(([name, args]) => args.includes('download') || name === 'flock')).toBe(false)
  })

  it('porta ocupada por outro processo impede publicação', async () => {
    mocks.busy = true
    await expect(runPreview(statePath, 'one')).rejects.toThrow('Porta reservada ocupada')
    expect(mocks.exec.mock.calls.some(([name]) => name === 'flock')).toBe(false)
  })

  it('estado invalidado não dispara workflow', async () => {
    writeFileSync(statePath, JSON.stringify({ ...state, active: false }))
    await expect(runPreview(statePath, 'one')).rejects.toThrow('cancelada')
    expect(mocks.exec).not.toHaveBeenCalled()
  })

  it('tentativa substituída não publica nem sobrescreve a nova reserva', async () => {
    writeFileSync(state.currentPath, 'new-attempt')
    await expect(runPreview(statePath, 'one')).rejects.toThrow('substituída')
    expect(mocks.exec).not.toHaveBeenCalled()
    expect(readFileSync(state.currentPath, 'utf8')).toBe('new-attempt')
  })

  it('backup vazio impede publicação mesmo com build aprovado', async () => {
    writeFileSync(state.backupPath, '')
    await expect(runPreview(statePath, 'one')).rejects.toThrow('Backup MongoDB')
    expect(mocks.exec.mock.calls.some(([name]) => name === 'flock')).toBe(false)
  })

  it('backup desligado na central publica sem o arquivo de dump (OPE-72)', async () => {
    writeFileSync(state.backupPath, '')
    writeFileSync(statePath, JSON.stringify({ ...state, dumpRequired: false }))
    await runPreview(statePath, 'one')
    expect(JSON.parse(readFileSync(statePath, 'utf8')).published).toBe(true)
  })

  it('reconexão reutiliza o run registrado, sem novo push/dispatch', async () => {
    writeFileSync(statePath, JSON.stringify({ ...state, sha, runId: 9 }))
    await runPreview(statePath, 'one')
    expect(mocks.exec.mock.calls.some(([, args]) => args.includes('push') || args.includes('workflow'))).toBe(false)
  })

  it('rejeita porta fora da janela, outro SHA e checksum adulterado', () => {
    expect(() => validateState({ ...state, port: 7000 }, 'one')).toThrow('faixa')
    const manifest = { attempt: 'one', sha: 'b'.repeat(40), image: 'opex-preview:one', checksum: 'valid' }
    expect(() => validateManifest(manifest, { ...state, sha }, 'valid')).toThrow('Artefato')
    expect(() => validateManifest({ ...manifest, sha }, { ...state, sha }, 'bad')).toThrow('checksum')
  })
})
