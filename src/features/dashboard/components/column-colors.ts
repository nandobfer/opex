import { LEGACY_COLOR_HEX, normalizeColor } from "@/lib/colors"

/** Cinza das fatias de coluna sem cor reconhecível (coluna órfã ou cor inválida). */
export const UNKNOWN_COLUMN_CHART_COLOR = LEGACY_COLOR_HEX.zinc!

/** Cor da fatia da coluna na rosca de distribuição: o hex da coluna (nome antigo vira hex; desconhecida = cinza). */
export function columnChartColor(color: string | null | undefined): string {
    return normalizeColor(color) ?? UNKNOWN_COLUMN_CHART_COLOR
}
