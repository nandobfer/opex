import { gzipSync } from 'node:zlib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const gh = vi.hoisted(() => ({
  githubRequest: vi.fn(async (_path: string, _options?: unknown): Promise<unknown> => ({})),
  githubPaginate: vi.fn(async (): Promise<unknown[]> => []),
  listCentrals: vi.fn(async () => [{ projectName: 'CRM', repo: 'Sipal/CRM', config: { git: { baseBranch: 'dev', prTargetBranch: 'main' } } }]),
  recordAudit: vi.fn(async () => {}),
}))

vi.mock('@/features/github/client', async (original) => ({
  ...(await original<object>()),
  githubRequest: gh.githubRequest,
  githubPaginate: gh.githubPaginate,
  githubBaseUrl: async () => 'https://api.github.com',
}))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => ({ token: 'tok', apiUrl: 'https://api.github.com' }) }))
vi.mock('@/features/agentic/server/centrals', () => ({ listCentrals: gh.listCentrals }))
vi.mock('@/features/github/server/lookups', () => ({ listGithubRepos: async () => [{ fullName: 'sipal/crm', private: true, description: null }, { fullName: 'sipal/site', private: false, description: 'Site' }] }))
vi.mock('@/lib/db', async (original) => ({ ...(await original<object>()), recordAudit: gh.recordAudit }))

import { clipPatches, globToRegExp, isValidBranchName, lineWindow, listTree, searchFiles, type RepoFile } from '@/features/opex-agent/repo-search'
import { readTar, type TarEntry } from '@/features/opex-agent/server/repo-tar'
import { resetRepoCaches, resolveRepoRef } from '@/features/opex-agent/server/repo-snapshot'
import { findOpexTool, needsConfirmation } from '@/features/opex-agent/server/tools/registry'

const context = { sessionId: 's1', actorId: 'local' }

function header(name: string, size: number, type = '0'): Buffer {
  const block = Buffer.alloc(512)
  block.write(name.slice(0, 100), 0, 'utf8')
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'ascii')
  block.write(type, 156, 'ascii')
  block.write('ustar\0', 257, 'ascii')
  return block
}

const pad = (data: Buffer) => Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)])

function paxRecord(key: string, value: string): Buffer {
  const body = ` ${key}=${value}\n`
  let length = body.length + 1
  while (`${length}${body}`.length !== length) length = `${length}${body}`.length
  return Buffer.from(`${length}${body}`)
}

/** Tarball no formato do GitHub: pasta raiz `owner-repo-sha/`, cabeçalho global e PAX de caminho longo. */
function tarball(files: Record<string, string | Buffer>, root = 'Sipal-crm-abc123'): Buffer {
  const parts: Buffer[] = []
  const comment = paxRecord('comment', 'abc123')
  parts.push(header('pax_global_header', comment.length, 'g'), pad(comment))
  parts.push(header(`${root}/`, 0, '5'))
  for (const [path, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
    const full = `${root}/${path}`
    if (full.length > 100) {
      const pax = paxRecord('path', full)
      parts.push(header('PaxHeader', pax.length, 'x'), pad(pax))
    }
    parts.push(header(full, data.length), pad(data))
  }
  parts.push(Buffer.alloc(1024))
  return Buffer.concat(parts)
}

async function* chunks(buffer: Buffer, size: number) {
  for (let offset = 0; offset < buffer.length; offset += size) yield buffer.subarray(offset, offset + size)
}

const LONG_PATH = `src/${'muito-longo/'.repeat(10)}arquivo.ts`
const REPO_FILES: Record<string, string | Buffer> = {
  'README.md': '# CRM\n',
  'src/app.ts': 'export const total = 1\nfunction calcularTotal() {\n  return total\n}\n',
  'src/lib/util.ts': 'export function calcularDesconto() {}\n',
  'node_modules/pkg/index.js': 'calcularTotal()\n',
  'public/logo.png': Buffer.from([0x89, 0x50, 0x00, 0x01]),
  [LONG_PATH]: 'export const calcularTotalLongo = 2\n',
}

describe('busca e leitura (puro)', () => {
  const files: RepoFile[] = [
    { path: 'src/app.ts', size: 10, text: 'const a = 1\nconst Alvo = 2\nconst c = 3' },
    { path: 'src/other.tsx', size: 10, text: 'alvo()' },
    { path: 'node_modules/x/i.js', size: 10, text: 'alvo' },
    { path: 'img.png', size: 10, text: null },
  ]

  it('glob: ** atravessa pastas, sem barra casa o nome em qualquer pasta, chaves alternam', () => {
    expect(globToRegExp('**/*.ts').test('src/a/b.ts')).toBe(true)
    expect(globToRegExp('*.ts').test('src/a/b.ts')).toBe(true)
    expect(globToRegExp('src/*.ts').test('src/a/b.ts')).toBe(false)
    expect(globToRegExp('{src,lib}/**/*.tsx').test('lib/x/y.tsx')).toBe(true)
  })

  it('busca sem diferenciar maiúsculas, pula node_modules e binários, com contexto', () => {
    const result = searchFiles(files, { query: 'alvo', contextLines: 1 })
    expect(result.matches.map((match) => `${match.path}:${match.line}`)).toEqual(['src/app.ts:2', 'src/other.tsx:1'])
    expect(result.matches[0]).toMatchObject({ before: ['const a = 1'], after: ['const c = 3'] })
    expect(result).toMatchObject({ filesScanned: 2, filesMatched: 2, filesSkipped: 1, truncated: false })
  })

  it('busca dentro de node_modules quando path aponta para lá; regex e limite', () => {
    expect(searchFiles(files, { query: 'alvo', path: 'node_modules/x' }).matches).toHaveLength(1)
    expect(searchFiles(files, { query: 'const [a-c] =', regex: true, caseSensitive: true }).matches).toHaveLength(2)
    expect(searchFiles(files, { query: 'const', limit: 1 })).toMatchObject({ truncated: true })
    expect(() => searchFiles(files, { query: '(', regex: true })).toThrow(/Expressão regular inválida/)
  })

  it('janela de linhas numeradas com continuação', () => {
    const window = lineWindow('a\nb\nc\nd\n', 2, 2)
    expect(window).toEqual({ startLine: 2, endLine: 3, totalLines: 4, truncated: true, text: '2: b\n3: c' })
  })

  it('árvore: pasta, não recursiva e pasta inexistente', () => {
    const snapshot = { files: new Map(files.map((file) => [file.path, file])), dirs: new Set(['src', 'node_modules', 'node_modules/x']) }
    expect(listTree(snapshot, { path: 'src' }).entries).toEqual(['src/app.ts', 'src/other.tsx'])
    expect(listTree(snapshot, { recursive: false }).entries).toEqual(['img.png', 'node_modules/', 'src/'])
    expect(() => listTree(snapshot, { path: 'nada' })).toThrow(/não existe/)
  })

  it('corta diffs por arquivo e no total; valida nome de branch', () => {
    const clipped = clipPatches([{ patch: 'x'.repeat(10) }, { patch: 'y'.repeat(10) }, { patch: null }], 6, 8)
    expect(clipped[0]!.patch).toMatch(/^x{6}\n…\(diff cortado/)
    expect(clipped[1]!.patch).toMatch(/^y{2}\n…/)
    expect(clipped[2]!.patch).toBeNull()
    expect(isValidBranchName('feature/GO-DEV-1')).toBe(true)
    expect(isValidBranchName('a..b')).toBe(false)
    expect(isValidBranchName('com espaço')).toBe(false)
  })
})

describe('leitor de tar', () => {
  it('entrega caminhos sem a pasta raiz, aplica PAX e pula o conteúdo não pedido', async () => {
    const seen: { entry: TarEntry; data: string | null }[] = []
    await readTar(chunks(tarball(REPO_FILES), 333), {
      wantData: (entry) => entry.path !== 'README.md',
      onEntry: (entry, data) => seen.push({ entry, data: data ? data.toString('utf8') : null }),
    })
    const byPath = new Map(seen.map((item) => [item.entry.path, item]))
    expect(byPath.get('README.md')).toMatchObject({ data: null, entry: { size: 6 } })
    expect(byPath.get('src/app.ts')!.data).toContain('calcularTotal')
    expect(byPath.get(LONG_PATH)!.data).toContain('calcularTotalLongo')
    expect([...byPath.keys()]).not.toContain('')
  })
})

describe('ferramentas de repositório', () => {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes('/commits/')) return new Response('abc123def\n', { status: 200 })
    if (url.includes('/tarball/')) return new Response(gzipSync(tarball(REPO_FILES)), { status: 200 })
    return new Response('{}', { status: 404 })
  })

  beforeEach(() => {
    resetRepoCaches()
    fetchMock.mockClear()
    gh.githubRequest.mockReset()
    gh.recordAudit.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('branch de consulta: a pedida; senão a base da central; senão a padrão do repositório', async () => {
    gh.githubRequest.mockResolvedValue({ default_branch: 'master' })
    expect(await resolveRepoRef('sipal/crm', 'feature/x')).toMatchObject({ ref: 'feature/x', refSource: 'requested' })
    expect(await resolveRepoRef('https://github.com/Sipal/CRM.git')).toMatchObject({ repo: 'sipal/crm', ref: 'dev', refSource: 'central' })
    expect(await resolveRepoRef('sipal/site')).toMatchObject({ ref: 'master', refSource: 'default' })
  })

  it('search_repo_code busca na branch base da central (não na padrão) e reaproveita o snapshot', async () => {
    const tool = findOpexTool('search_repo_code')!
    const result = (await tool.execute({ repo: 'sipal/crm', query: 'calcularTotal' }, context)) as { ref: string; refSource: string; sha: string; matches: { path: string; line: number }[] }
    expect(result).toMatchObject({ ref: 'dev', refSource: 'central', sha: 'abc123def' })
    expect(result.matches.map((match) => `${match.path}:${match.line}`)).toEqual(['src/app.ts:2', `${LONG_PATH}:1`])
    expect(fetchMock.mock.calls[0]![0]).toContain('/repos/sipal/crm/commits/dev')

    const read = (await findOpexTool('read_repo_file')!.execute({ repo: 'sipal/crm', path: '/src/app.ts', startLine: 2, maxLines: 1 }, context)) as { text: string; totalLines: number }
    expect(read).toMatchObject({ text: '2: function calcularTotal() {', totalLines: 4 })
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/tarball/'))).toHaveLength(1)
  })

  it('read_repo_file recusa binário e sugere caminhos parecidos', async () => {
    const tool = findOpexTool('read_repo_file')!
    await expect(tool.execute({ repo: 'sipal/crm', ref: 'feature/x', path: 'public/logo.png' }, context)).rejects.toThrow(/binário/)
    await expect(tool.execute({ repo: 'sipal/crm', ref: 'feature/x', path: 'util.ts' }, context)).rejects.toThrow(/src\/lib\/util\.ts/)
  })

  it('escritas pedem confirmação por padrão; leituras não', () => {
    for (const name of ['create_branch', 'write_repo_file', 'delete_repo_file', 'delete_branch']) expect(needsConfirmation(findOpexTool(name)!)).toBe(true)
    for (const name of ['list_repositories', 'get_repo_tree', 'read_repo_file', 'search_repo_code', 'list_branches', 'list_commits', 'get_commit', 'compare_refs']) {
      expect(needsConfirmation(findOpexTool(name)!)).toBe(false)
    }
    expect(needsConfirmation(findOpexTool('write_repo_file')!, { write_repo_file: false })).toBe(false)
  })

  it('write_repo_file atualiza na branch base da central com o SHA atual e audita', async () => {
    gh.githubRequest.mockImplementation(async (path: string, options?: unknown) => {
      if ((options as { method?: string } | undefined)?.method === 'PUT') return { commit: { sha: 'c0ffee', html_url: 'https://github.com/x' } }
      return { type: 'file', sha: 'old-sha' }
    })
    const result = await findOpexTool('write_repo_file')!.execute({ repo: 'sipal/crm', path: 'src/app.ts', content: 'novo', message: 'feat: x' }, context)
    expect(result).toMatchObject({ ref: 'dev', created: false, commit: 'c0ffee' })
    const put = gh.githubRequest.mock.calls.find(([, options]) => (options as { method?: string }).method === 'PUT')!
    expect(put[0]).toBe('/repos/sipal/crm/contents/src/app.ts')
    expect((put[1] as { body: unknown }).body).toEqual({ message: 'feat: x', content: Buffer.from('novo').toString('base64'), branch: 'dev', sha: 'old-sha' })
    expect(gh.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'RepositorioGithub', entidadeId: 'sipal/crm' }))
  })

  it('delete_branch recusa a branch padrão e as da central', async () => {
    gh.githubRequest.mockResolvedValue({ default_branch: 'master' })
    const tool = findOpexTool('delete_branch')!
    for (const name of ['master', 'dev', 'main']) await expect(tool.execute({ repo: 'sipal/crm', name }, context)).rejects.toThrow(/não pode ser excluída/)
    await tool.execute({ repo: 'sipal/crm', name: 'feature/x' }, context)
    expect(gh.githubRequest).toHaveBeenLastCalledWith('/repos/sipal/crm/git/refs/heads/feature/x', expect.objectContaining({ method: 'DELETE' }))
  })
})
