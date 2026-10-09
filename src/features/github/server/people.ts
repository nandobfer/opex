import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { GithubPerson, GithubRepoLink, type IGithubPerson } from "@/lib/db/models/Github"
import { githubPaginate, githubRequest } from "../client"
import { GITHUB_AUDIT } from "../constants"
import { normalizeText, type DeveloperRef } from "../logic"
import type { GithubPersonDto } from "../types"
import { toTaskDomainError } from "@/features/tasks/server/service"
import { toGithubDomainError } from "./errors"
import { publishGithubUpdated } from "./events"
import { listGoDevelopers, type GoDeveloper } from "./go-sipal"

/** Aba Pessoas: login do GitHub → desenvolvedor do Go! Sipal. Somente servidor. */

const toDto = (doc: IGithubPerson): GithubPersonDto => ({
    login: doc.login,
    name: doc.name ?? null,
    avatarUrl: doc.avatarUrl ?? null,
    email: doc.email ?? null,
    developerId: doc.developerId ?? null,
    developerName: doc.developerName ?? null,
    suggestion: doc.suggestion ?? null,
    repos: doc.repos ?? [],
})

export async function listPeople(): Promise<GithubPersonDto[]> {
    await dbConnect()
    const people = await GithubPerson.find().sort({ login: 1 }).lean()
    return people.map(toDto)
}

/** Login → desenvolvedor (usado no mapeamento de assignee). */
export async function peopleMap(): Promise<Map<string, DeveloperRef>> {
    await dbConnect()
    const people = await GithubPerson.find({ developerId: { $ne: null } }).lean()
    return new Map(people.map((person) => [person.login, { id: person.developerId!, name: person.developerName ?? person.login, email: null }]))
}

export interface SeenPerson {
    login: string
    avatarUrl?: string | null
    name?: string | null
    repo?: string
}

/** Registra pessoas vistas (autores/assignees). Nova pessoa entra "sem correspondência". */
export async function upsertSeenPeople(people: readonly SeenPerson[]): Promise<number> {
    if (people.length === 0) return 0
    await dbConnect()
    let created = 0
    for (const person of people) {
        const login = person.login.toLowerCase()
        const result = await GithubPerson.updateOne(
            { login },
            {
                $setOnInsert: { login, developerId: null, developerName: null, suggestion: null },
                ...(person.avatarUrl || person.name ? { $set: { ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}), ...(person.name ? { name: person.name } : {}) } } : {}),
                ...(person.repo ? { $addToSet: { repos: person.repo } } : {}),
            },
            { upsert: true },
        )
        if (result.upsertedCount) created++
    }
    return created
}

/**
 * Atualiza a lista: assignees possíveis de cada repositório vinculado + autores configurados,
 * com o nome público do perfil (para sugerir correspondências).
 */
export async function refreshPeople(): Promise<GithubPersonDto[]> {
    await dbConnect()
    const links = await GithubRepoLink.find().lean()
    const seen: SeenPerson[] = []
    try {
        for (const link of links) {
            const assignees = await githubPaginate<{ login: string; avatar_url?: string }>(`/repos/${link.repo}/assignees?per_page=100`, { label: `assignees de ${link.repo}`, maxPages: 5 })
            for (const user of assignees) seen.push({ login: user.login, avatarUrl: user.avatar_url ?? null, repo: link.repo })
            for (const author of link.authors) seen.push({ login: author, repo: link.repo })
        }
    } catch (error) {
        toGithubDomainError(error)
    }
    await upsertSeenPeople(seen)
    // Nome e e-mail públicos de quem ainda não tem (uma chamada por pessoa, só na primeira vez).
    const missing = await GithubPerson.find({ name: null }).limit(100).lean()
    for (const person of missing) {
        try {
            const profile = await githubRequest<{ name?: string | null; email?: string | null; avatar_url?: string }>(`/users/${person.login}`, { label: `perfil de ${person.login}` })
            await GithubPerson.updateOne({ login: person.login }, { $set: { name: profile.name || person.login, email: profile.email ?? null, avatarUrl: profile.avatar_url ?? person.avatarUrl } })
        } catch {
            // Perfil indisponível não impede a lista.
        }
    }
    await publishGithubUpdated("people")
    return listPeople()
}

export async function setPersonMapping(login: string, developer: { id: string; name: string } | null, actorId: string): Promise<GithubPersonDto> {
    await dbConnect()
    const key = login.toLowerCase()
    const before = await GithubPerson.findOne({ login: key }).lean()
    if (!before) throw new DomainError(404, "Pessoa não encontrada", "PERSON_NOT_FOUND")
    const after = await GithubPerson.findOneAndUpdate(
        { login: key },
        { $set: { developerId: developer?.id ?? null, developerName: developer?.name ?? null, suggestion: null } },
        { returnDocument: "after" },
    ).lean()
    await recordAudit({
        userId: actorId,
        entidade: GITHUB_AUDIT.person,
        entidadeId: key,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { login: key, desenvolvedor: before.developerName ?? null },
        depois: { login: key, desenvolvedor: developer?.name ?? null },
    })
    await publishGithubUpdated("people")
    const { remapPendingDrafts } = await import("./drafts")
    await remapPendingDrafts()
    return toDto(after ?? before)
}

const firstLast = (name: string) => {
    const parts = normalizeText(name).split(/\s+/).filter(Boolean)
    return parts.length > 1 ? `${parts[0]} ${parts.at(-1)}` : (parts[0] ?? "")
}

/**
 * Sugestão para uma pessoa: e-mail público igual, nome completo igual, ou primeiro + último nome
 * iguais. Puro (exportado para os testes).
 */
export function suggestDeveloper(person: Pick<GithubPersonDto, "login" | "name" | "email">, developers: readonly GoDeveloper[]): { developerId: string; developerName: string; reason: string } | null {
    if (person.email) {
        const byEmail = developers.find((developer) => developer.email && normalizeText(developer.email) === normalizeText(person.email!))
        if (byEmail) return { developerId: byEmail.id, developerName: byEmail.name, reason: "mesmo e-mail" }
    }
    const name = person.name && person.name !== person.login ? person.name : null
    if (name) {
        const full = developers.find((developer) => normalizeText(developer.name) === normalizeText(name))
        if (full) return { developerId: full.id, developerName: full.name, reason: "mesmo nome" }
        const short = firstLast(name)
        const partial = developers.filter((developer) => firstLast(developer.name) === short)
        if (partial.length === 1) return { developerId: partial[0]!.id, developerName: partial[0]!.name, reason: "primeiro e último nome" }
    }
    const loginMatch = developers.find((developer) => developer.email && normalizeText(developer.email.split("@")[0]!).replace(/[._-]/g, "") === person.login.replace(/[._-]/g, ""))
    if (loginMatch) return { developerId: loginMatch.id, developerName: loginMatch.name, reason: "login parecido com o e-mail" }
    return null
}

/** Grava sugestões (pendentes de aceite) para quem não tem correspondência. */
export async function suggestPeople(): Promise<{ suggested: number; people: GithubPersonDto[] }> {
    await dbConnect()
    let developers: GoDeveloper[]
    try {
        developers = await listGoDevelopers()
    } catch (error) {
        toTaskDomainError(error)
    }
    const people = await GithubPerson.find({ developerId: null }).lean()
    let suggested = 0
    for (const person of people) {
        const suggestion = suggestDeveloper(toDto(person), developers)
        if (suggestion) suggested++
        await GithubPerson.updateOne({ login: person.login }, { $set: { suggestion } })
    }
    await publishGithubUpdated("people")
    return { suggested, people: await listPeople() }
}

export async function acceptSuggestions(logins: readonly string[], actorId: string): Promise<GithubPersonDto[]> {
    await dbConnect()
    const people = await GithubPerson.find({ login: { $in: logins.map((login) => login.toLowerCase()) }, suggestion: { $ne: null } }).lean()
    for (const person of people) {
        await GithubPerson.updateOne({ login: person.login }, { $set: { developerId: person.suggestion!.developerId, developerName: person.suggestion!.developerName, suggestion: null } })
        await recordAudit({
            userId: actorId,
            entidade: GITHUB_AUDIT.person,
            entidadeId: person.login,
            acao: AcaoAuditoria.ATUALIZAR,
            antes: { login: person.login, desenvolvedor: person.developerName ?? null },
            depois: { login: person.login, desenvolvedor: person.suggestion!.developerName, sugestao: person.suggestion!.reason },
        })
    }
    await publishGithubUpdated("people")
    if (people.length) {
        const { remapPendingDrafts } = await import("./drafts")
        await remapPendingDrafts()
    }
    return listPeople()
}
