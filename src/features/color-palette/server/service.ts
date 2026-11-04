import { DomainError } from "@/lib/api/route"
import { DEFAULT_FAVORITE_COLORS, parseHexColor } from "@/lib/colors"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { ColorPalette } from "@/lib/db/models/ColorPalette"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { COLOR_FAVORITES_MAX, COLOR_PALETTE_AUDIT_ENTITY, COLOR_PALETTE_KEY, COLOR_PALETTE_UPDATED_EVENT } from "../constants"
import type { ColorPaletteDto, FavoriteColorDto } from "../schemas"

/** Cores favoritas do seletor de cores. Somente servidor. */

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
export async function addFavoriteColor(input: FavoriteColorDto, actorId: string): Promise<ColorPaletteDto> {
    const before = await readFavorites()
    if (before.some((item) => item.color === input.color)) throw new DomainError(409, "Esta cor já está nas favoritas", "COLOR_FAVORITE_EXISTS")
    if (before.length >= COLOR_FAVORITES_MAX) throw new DomainError(409, `Limite de ${COLOR_FAVORITES_MAX} cores favoritas: remova uma para adicionar outra`, "COLOR_FAVORITES_LIMIT")
    return saveFavorites(before, [...before, { color: input.color, name: input.name }], actorId, input.color, "added")
}

/** Remove uma favorita. Quem já usa a cor (central, coluna, Maddox) continua com ela: guarda o próprio hex. */
export async function removeFavoriteColor(color: string, actorId: string): Promise<ColorPaletteDto> {
    const before = await readFavorites()
    if (!before.some((item) => item.color === color)) throw new DomainError(404, "Cor favorita não encontrada", "COLOR_FAVORITE_NOT_FOUND")
    return saveFavorites(before, before.filter((item) => item.color !== color), actorId, color, "removed")
}

/**
 * Edita nome e cor de uma favorita, mantendo a posição na lista. Quem já usa a cor antiga (central,
 * coluna, Maddox) continua com ela: guarda o próprio hex.
 */
export async function updateFavoriteColor(currentColor: string, input: FavoriteColorDto, actorId: string): Promise<ColorPaletteDto> {
    const before = await readFavorites()
    const index = before.findIndex((item) => item.color === currentColor)
    if (index < 0) throw new DomainError(404, "Cor favorita não encontrada", "COLOR_FAVORITE_NOT_FOUND")
    if (input.color !== currentColor && before.some((item) => item.color === input.color)) throw new DomainError(409, "Esta cor já está nas favoritas", "COLOR_FAVORITE_EXISTS")
    const current = before[index]!
    if (current.color === input.color && current.name === input.name) return { favorites: before }
    const after = before.map((item, position) => (position === index ? { color: input.color, name: input.name } : item))
    return saveFavorites(before, after, actorId, input.color, "updated", currentColor)
}
