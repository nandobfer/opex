import { DomainError } from "@/lib/api/route"
import { DEFAULT_FAVORITE_COLORS, parseHexColor } from "@/lib/colors"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { ColorPalette } from "@/lib/db/models/ColorPalette"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { COLOR_FAVORITES_MAX, COLOR_PALETTE_AUDIT_ENTITY, COLOR_PALETTE_KEY, COLOR_PALETTE_UPDATED_EVENT } from "../constants"
import type { ColorPaletteDto, FavoriteColorDto } from "../schemas"

/** Cores favoritas do seletor de cores. Somente servidor. */

/**
 * As mutações leem a lista inteira e gravam a lista nova: duas ao mesmo tempo (a tela e o Agente Opex,
 * ou várias ferramentas em paralelo) perderiam uma das mudanças. O app roda num processo só (sem
 * filas nem workers), então uma fila em memória serializa ler → validar → gravar.
 */
let mutationQueue: Promise<unknown> = Promise.resolve()

function serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = mutationQueue.then(task, task)
    mutationQueue = run.catch(() => undefined)
    return run
}

const DEFAULTS: FavoriteColorDto[] = DEFAULT_FAVORITE_COLORS.map((item) => ({ color: item.color, name: item.name }))

async function readFavorites(): Promise<FavoriteColorDto[]> {
    await dbConnect()
    const doc = await ColorPalette.findOne({ key: COLOR_PALETTE_KEY }).lean()
    // Sem documento salvo valem as padrão; uma lista salva vazia continua vazia (o usuário removeu todas).
    if (!doc) return DEFAULTS.map((item) => ({ ...item }))
    return (doc.colors ?? []).flatMap((item) => {
        const color = parseHexColor(item.color)
        return color ? [{ color, name: item.name || null }] : []
    })
}

type PaletteAction = "added" | "removed" | "updated"

async function saveFavorites(before: FavoriteColorDto[], after: FavoriteColorDto[], actorId: string, color: string, action: PaletteAction, previousColor?: string): Promise<ColorPaletteDto> {
    await ColorPalette.updateOne({ key: COLOR_PALETTE_KEY }, { $set: { colors: after } }, { upsert: true })
    await recordAudit({
        userId: actorId,
        entidade: COLOR_PALETTE_AUDIT_ENTITY,
        entidadeId: COLOR_PALETTE_KEY,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { favorites: before },
        depois: { favorites: after },
    })
    const event = previousColor ? { color, previousColor, action } : { color, action }
    loggerFor({ userId: actorId }).info(event, "Cores favoritas atualizadas")
    await publishAppEvent(COLOR_PALETTE_UPDATED_EVENT, event)
    return { favorites: after }
}

export async function getColorPalette(): Promise<ColorPaletteDto> {
    return { favorites: await readFavorites() }
}

/** Adiciona uma favorita no fim da lista; a mesma cor não entra duas vezes. */
export function addFavoriteColor(input: FavoriteColorDto, actorId: string): Promise<ColorPaletteDto> {
    return serialized(async () => {
        const before = await readFavorites()
        if (before.some((item) => item.color === input.color)) throw new DomainError(409, "Esta cor já está nas favoritas", "COLOR_FAVORITE_EXISTS")
        if (before.length >= COLOR_FAVORITES_MAX) throw new DomainError(409, `Limite de ${COLOR_FAVORITES_MAX} cores favoritas: remova uma para adicionar outra`, "COLOR_FAVORITES_LIMIT")
        return saveFavorites(before, [...before, { color: input.color, name: input.name }], actorId, input.color, "added")
    })
}

/** Remove uma favorita. Quem já usa a cor (central, coluna, Maddox) continua com ela: guarda o próprio hex. */
export function removeFavoriteColor(color: string, actorId: string): Promise<ColorPaletteDto> {
    return serialized(async () => {
        const before = await readFavorites()
        if (!before.some((item) => item.color === color)) throw new DomainError(404, "Cor favorita não encontrada", "COLOR_FAVORITE_NOT_FOUND")
        return saveFavorites(before, before.filter((item) => item.color !== color), actorId, color, "removed")
    })
}

/**
 * Edita nome e cor de uma favorita, mantendo a posição na lista. Quem já usa a cor antiga (central,
 * coluna, Maddox) continua com ela: guarda o próprio hex. `name` ausente (`undefined`) mantém o nome
 * atual; `null` (ou vazio) limpa o nome.
 */
export function updateFavoriteColor(currentColor: string, input: { color: string; name?: string | null }, actorId: string): Promise<ColorPaletteDto> {
    return serialized(async () => {
        const before = await readFavorites()
        const index = before.findIndex((item) => item.color === currentColor)
        if (index < 0) throw new DomainError(404, "Cor favorita não encontrada", "COLOR_FAVORITE_NOT_FOUND")
        if (input.color !== currentColor && before.some((item) => item.color === input.color)) throw new DomainError(409, "Esta cor já está nas favoritas", "COLOR_FAVORITE_EXISTS")
        const current = before[index]!
        const name = input.name === undefined ? current.name : input.name || null
        if (current.color === input.color && current.name === name) return { favorites: before }
        const after = before.map((item, position) => (position === index ? { color: input.color, name } : item))
        return saveFavorites(before, after, actorId, input.color, "updated", currentColor)
    })
}
