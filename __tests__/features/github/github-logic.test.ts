import { describe, expect, it } from 'vitest'
import {
  buildTaskDescription,
  DEFAULT_PRIORITY_RULES,
  DEFAULT_TYPE_RULES,
  extractIssueImages,
  htmlBaseOf,
  htmlImageSources,
  imageExtension,
  mapAssignee,
  mapPriority,
  mapTaskType,
  mapWorkPackage,
  mentionsIssue,
  normalizeRepo,
  planIssueCommit,
  previewBody,
  replaceImagesWithAttachments,
  repoFromUrl,
  toIssueLite,
} from '@/features/github/logic'

const rawIssue = (overrides: Record<string, unknown> = {}) => ({
  number: 12,
  title: 'Bug no login',
  body: 'Corpo',
  html_url: 'https://github.com/sipal/app/issues/12',
  state: 'open',
  user: { login: 'Fernand-Sipal', avatar_url: 'https://avatars/x' },
  labels: [{ name: 'bug' }, 'P1'],
  assignees: [{ login: 'Ana' }],
  milestone: { title: 'Sprint 3' },
  type: { name: 'Bug' },
  ...overrides,
})

describe('leitura da issue', () => {
  it('normaliza login/labels/assignees e marca PR', () => {
    const issue = toIssueLite(rawIssue())!
    expect(issue).toMatchObject({ number: 12, author: { login: 'fernand-sipal' }, labels: ['bug', 'P1'], assignees: ['ana'], milestone: 'Sprint 3', type: 'Bug', isPullRequest: false })
    expect(toIssueLite(rawIssue({ pull_request: { url: 'x' } }))!.isPullRequest).toBe(true)
    expect(toIssueLite({ title: 'sem número' })).toBeNull()
  })

  it('repositório: normaliza nome/URL e acha o repo do repositoryUrl do produto', () => {
    expect(normalizeRepo('https://github.com/Sipal/App.git')).toBe('sipal/app')
    expect(normalizeRepo('inválido')).toBeNull()
    expect(repoFromUrl('git@github.com:Sipal/App.git')).toBe('sipal/app')
    expect(repoFromUrl('https://github.com/sipal/app/tree/main')).toBe('sipal/app')
    expect(repoFromUrl('https://gitlab.com/sipal/app')).toBeNull()
    expect(htmlBaseOf('https://api.github.com/')).toBe('https://github.com')
    expect(htmlBaseOf('https://ghe.sipal.com.br/api/v3')).toBe('https://ghe.sipal.com.br')
  })
})

describe('mapeamento issue → tarefa', () => {
  it('tipo: Issue Type vence label; sem regra usa o padrão do vínculo', () => {
    expect(mapTaskType({ type: 'Feature', labels: ['bug'] }, DEFAULT_TYPE_RULES, 'analysis')).toEqual({ value: 'feature', origin: 'Issue Type "Feature"' })
    expect(mapTaskType({ type: null, labels: ['Documentation'] }, DEFAULT_TYPE_RULES, 'feature')).toEqual({ value: 'analysis', origin: 'label "Documentation"' })
    expect(mapTaskType({ type: 'Épico', labels: ['outra'] }, DEFAULT_TYPE_RULES, 'devops')).toEqual({ value: 'devops', origin: 'padrão do vínculo' })
  })

  it('prioridade: primeira regra que casar; senão o padrão', () => {
    expect(mapPriority({ labels: ['p1', 'P0'] }, DEFAULT_PRIORITY_RULES, 'low').value).toBe('urgent')
    expect(mapPriority({ labels: [] }, DEFAULT_PRIORITY_RULES, 'low')).toEqual({ value: 'low', origin: 'padrão do vínculo' })
  })

  it('responsável: primeiro assignee com pessoa mapeada; sem nenhum, sem responsável', () => {
    const people = new Map([['bia', { id: 'd2', name: 'Bia', email: null }]])
    expect(mapAssignee({ assignees: ['ana', 'bia'] }, people)).toEqual({ value: { id: 'd2', name: 'Bia', email: null }, origin: 'assignee @bia' })
    expect(mapAssignee({ assignees: ['ana'] }, people)).toEqual({ value: null, origin: 'assignee sem pessoa mapeada' })
  })

  it('pacote: milestone com o mesmo nome (sem caixa/acento)', () => {
    const packages = [{ id: 'w1', name: 'Sprint Março' }]
    expect(mapWorkPackage('sprint marco', packages).value).toEqual(packages[0])
    expect(mapWorkPackage('Outro', packages).value).toBeNull()
    expect(mapWorkPackage(null, packages).origin).toBe('issue sem milestone')
  })

  it('descrição leva o corpo e o rodapé com a issue e quem abriu', () => {
    const text = buildTaskDescription('Passos', { url: 'https://github.com/sipal/app/issues/12', authorLogin: 'ana', authorName: 'Ana', createdAt: '2026-03-05T12:00:00Z' })
    expect(text).toBe('Passos\n\n---\nIssue: https://github.com/sipal/app/issues/12\nAberta por Ana (@ana) em 05/03/2026')
  })
})

describe('menção da issue numa tarefa', () => {
  it('#999 casa sozinho, mas não #9990 nem âncoras de URL', () => {
    expect(mentionsIssue('Corrige (#999) no login', 'sipal/app', 999)).toBe(true)
    expect(mentionsIssue('Ver #9990', 'sipal/app', 999)).toBe(false)
    expect(mentionsIssue('https://site.com/page#999', 'sipal/app', 999)).toBe(false)
    expect(mentionsIssue('ref sipal/app#999', 'sipal/app', 999)).toBe(true)
    expect(mentionsIssue('Issue: https://github.com/Sipal/App/issues/999', 'sipal/app', 999)).toBe(true)
    expect(mentionsIssue('https://github.com/sipal/app/issues/9991', 'sipal/app', 999)).toBe(false)
    expect(mentionsIssue(null, 'sipal/app', 1)).toBe(false)
  })

  it('ignora âncoras de sumário Markdown (#9-titulo)', () => {
    const sumario = '- [9. Esforço relativo](#9-esforço-relativo)\n- [3. Dependências](#3-dependencias-externas)\n[Seção](#9)'
    expect(mentionsIssue(sumario, 'sipal/app', 9)).toBe(false)
    expect(mentionsIssue(sumario, 'sipal/app', 3)).toBe(false)
    expect(mentionsIssue('Corrige #9.', 'sipal/app', 9)).toBe(true)
    expect(mentionsIssue('Fecha #9, #10', 'sipal/app', 9)).toBe(true)
  })
})

describe('imagens do corpo', () => {
  const body = 'Antes ![tela](https://github.com/user-attachments/assets/abc) e <img alt="log" src="https://user-images.githubusercontent.com/1/x.png"> e ![externa](https://exemplo.com/a.png)'

  it('só imagens hospedadas pelo GitHub, na ordem', () => {
    const images = extractIssueImages(body)
    expect(images.map((image) => [image.alt, image.url])).toEqual([
      ['tela', 'https://github.com/user-attachments/assets/abc'],
      ['log', 'https://user-images.githubusercontent.com/1/x.png'],
    ])
  })

  it('troca as anexadas pela referência ao anexo; a que falhou fica como estava', () => {
    const images = extractIssueImages(body)
    const result = replaceImagesWithAttachments(body, images, new Map([[0, 'issue-12-imagem-1.png']]))
    expect(result).toContain('📎 Imagem 1 (anexo issue-12-imagem-1.png)')
    expect(result).toContain('<img alt="log"')
  })

  it('prévia usa as URLs assinadas do body_html quando as quantidades batem', () => {
    const signed = htmlImageSources('<p><img src="https://private-user-images.githubusercontent.com/a?jwt=1&amp;x=2"></p><img src="https://private-user-images.githubusercontent.com/b?jwt=2">')
    expect(signed[0]).toBe('https://private-user-images.githubusercontent.com/a?jwt=1&x=2')
    expect(previewBody(body, signed)).toContain('![tela](https://private-user-images.githubusercontent.com/a?jwt=1&x=2)')
    expect(previewBody(body, signed.slice(0, 1))).toBe(body)
    expect(imageExtension('image/jpeg')).toBe('jpg')
    expect(imageExtension('image/png; charset=binary')).toBe('png')
  })
})

describe('commit que fechou a issue', () => {
  const closedBy = { event: 'closed', commit_id: 'abc123', commit_url: 'https://api.github.com/repos/sipal/app/commits/abc123' }
  const mergedPr = { event: 'cross-referenced', source: { type: 'issue', issue: { number: 625, repository: { full_name: 'Sipal/App' }, pull_request: { merged_at: '2026-01-01T00:00:00Z' } } } }
  const openPr = { event: 'cross-referenced', source: { type: 'issue', issue: { number: 630, repository: { full_name: 'sipal/app' }, pull_request: { merged_at: null } } } }
  const referenced = { event: 'referenced', commit_id: 'def456', commit_url: 'https://api.github.com/repos/sipal/app/commits/def456' }

  it('1º commit que fechou (com o PR mergeado para conferir), 2º PR mergeado, 3º commit que cita, 4º PR que cita', () => {
    expect(planIssueCommit([openPr, referenced, mergedPr, closedBy], 'sipal/app')).toEqual({ commitSha: 'abc123', commitRepo: 'sipal/app', pr: { repo: 'sipal/app', number: 625, merged: true }, source: 'commit que fechou a issue' })
    expect(planIssueCommit([referenced, mergedPr, { event: 'closed', commit_id: null }], 'sipal/app')).toMatchObject({ commitSha: null, pr: { number: 625, merged: true } })
    expect(planIssueCommit([openPr, referenced], 'sipal/app')).toMatchObject({ commitSha: 'def456', pr: null, source: 'commit que cita a issue' })
    expect(planIssueCommit([openPr], 'sipal/app')).toMatchObject({ commitSha: null, pr: { number: 630, merged: false } })
    expect(planIssueCommit([{ event: 'labeled' }], 'sipal/app')).toBeNull()
  })
})
