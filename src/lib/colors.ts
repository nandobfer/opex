import { z } from "zod"

/**
 * Cores escolhidas pelo usuário (seletor de cores, favoritas, centrais, colunas do quadro e Agente Maddox). Módulo
 * PURO (cliente e servidor). As cores são **dados do usuário** em hexadecimal `#RRGGBB` e vão para a
 * tela por `style` inline: é a exceção documentada à regra "cores só por tokens" (o valor não é
 * conhecido em tempo de build, então não pode virar classe do Tailwind).
 */

export const HEX_COLOR_RE = /^#[0-9A-F]{6}$/
export const HEX_COLOR_MESSAGE = "Use o formato #RRGGBB (ex.: #8000FF)"

/** Hex normalizado (`#RRGGBB` em maiúsculas) ou `null` quando inválido. Aceita sem `#`. */
export function parseHexColor(value: unknown): string | null {
    if (typeof value !== "string") return null
    const text = value.trim().toUpperCase()
    const hex = text.startsWith("#") ? text : `#${text}`
    return HEX_COLOR_RE.test(hex) ? hex : null
}

/** Paleta nomeada antiga (centrais, colunas e Maddox salvos antes do seletor) → hex do tom exibido (400). */
export const LEGACY_COLOR_HEX: Readonly<Record<string, string>> = {
    violet: "#A78BFA",
    sky: "#38BDF8",
    emerald: "#34D399",
    amber: "#FBBF24",
    rose: "#FB7185",
    cyan: "#22D3EE",
    orange: "#FB923C",
    pink: "#F472B6",
    lime: "#A3E635",
    zinc: "#A1A1AA",
}

/** Cor salva (hex ou nome antigo da paleta) → hex; desconhecida ou ausente → `null`. */
export function normalizeColor(value: unknown): string | null {
    if (typeof value === "string" && Object.hasOwn(LEGACY_COLOR_HEX, value)) return LEGACY_COLOR_HEX[value]!
    if (typeof value === "string" && value.trim().startsWith("#")) return parseHexColor(value)
    return null
}

/** Hex `#RRGGBB` (aceita minúsculas e espaços nas pontas). Mesmo schema na tela e na API. */
export const hexColorSchema = z
    .string({ error: HEX_COLOR_MESSAGE })
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(HEX_COLOR_RE, HEX_COLOR_MESSAGE))

/** Cor gravada: hex ou nome antigo da paleta (convertido para hex antes de validar). */
export const colorValueSchema = z
    .string({ error: HEX_COLOR_MESSAGE })
    .transform((value) => (Object.hasOwn(LEGACY_COLOR_HEX, value) ? LEGACY_COLOR_HEX[value]! : value))
    .pipe(hexColorSchema)

/** Cor padrão de uma coluna nova do quadro (Violeta). */
export const DEFAULT_COLUMN_COLOR = LEGACY_COLOR_HEX.violet!

export interface ColorSwatch {
    color: string
    name: string
}

/** Favoritas iniciais: as cores da paleta antiga, com os mesmos nomes (quem já as usa as reencontra). */
export const DEFAULT_FAVORITE_COLORS: readonly ColorSwatch[] = [
    { color: LEGACY_COLOR_HEX.violet!, name: "Violeta" },
    { color: LEGACY_COLOR_HEX.sky!, name: "Azul" },
    { color: LEGACY_COLOR_HEX.emerald!, name: "Verde" },
    { color: LEGACY_COLOR_HEX.amber!, name: "Âmbar" },
    { color: LEGACY_COLOR_HEX.rose!, name: "Rosa" },
    { color: LEGACY_COLOR_HEX.cyan!, name: "Ciano" },
    { color: LEGACY_COLOR_HEX.orange!, name: "Laranja" },
    { color: LEGACY_COLOR_HEX.pink!, name: "Pink" },
    { color: LEGACY_COLOR_HEX.lime!, name: "Lima" },
    { color: LEGACY_COLOR_HEX.zinc!, name: "Cinza" },
]

const TONES = ["300", "400", "500", "600", "700"] as const

/** Matizes da grade padrão do seletor, cada um com 5 tons (do mais claro ao mais escuro). */
const HUES: readonly { name: string; tones: readonly [string, string, string, string, string] }[] = [
    { name: "Rosa", tones: ["#FDA4AF", "#FB7185", "#F43F5E", "#E11D48", "#BE123C"] },
    { name: "Laranja", tones: ["#FDBA74", "#FB923C", "#F97316", "#EA580C", "#C2410C"] },
    { name: "Âmbar", tones: ["#FCD34D", "#FBBF24", "#F59E0B", "#D97706", "#B45309"] },
    { name: "Lima", tones: ["#BEF264", "#A3E635", "#84CC16", "#65A30D", "#4D7C0F"] },
    { name: "Verde", tones: ["#6EE7B7", "#34D399", "#10B981", "#059669", "#047857"] },
    { name: "Ciano", tones: ["#67E8F9", "#22D3EE", "#06B6D4", "#0891B2", "#0E7490"] },
    { name: "Azul", tones: ["#7DD3FC", "#38BDF8", "#0EA5E9", "#0284C7", "#0369A1"] },
    { name: "Violeta", tones: ["#C4B5FD", "#A78BFA", "#8B5CF6", "#7C3AED", "#6D28D9"] },
    { name: "Pink", tones: ["#F9A8D4", "#F472B6", "#EC4899", "#DB2777", "#BE185D"] },
    { name: "Cinza", tones: ["#D4D4D8", "#A1A1AA", "#71717A", "#52525B", "#3F3F46"] },
]

/** Grade padrão do seletor: uma linha por tom, uma coluna por matiz. */
export const COLOR_MATRIX: readonly (readonly ColorSwatch[])[] = TONES.map((tone, row) => HUES.map((hue) => ({ color: hue.tones[row]!, name: `${hue.name} ${tone}` })))
export const COLOR_MATRIX_COLUMNS = HUES.length

function luminance(hex: string): number {
    const channel = (offset: number) => {
        const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** Razão de contraste WCAG entre duas cores hex (1 a 21). */
export function contrastRatio(a: string, b: string): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
    return (light + 0.05) / (dark + 0.05)
}

/** Fundo dos cards do tema escuro (`--card: 260 20% 9%`), referência do aviso de contraste. */
export const CARD_BACKGROUND_HEX = "#15121C"
/** Abaixo disso (WCAG para texto grande/elementos gráficos), a cor fica difícil de ver no tema escuro. */
export const MIN_CONTRAST = 3

/** A cor some no fundo escuro do app (texto e marcadores ficam difíceis de ler). */
export const hasLowContrast = (hex: string): boolean => contrastRatio(hex, CARD_BACKGROUND_HEX) < MIN_CONTRAST

/** Cor do ícone (✓) sobre a amostra: escura nas cores claras, clara nas escuras. */
export const readableTextOn = (hex: string): "dark" | "light" => (luminance(hex) > 0.4 ? "dark" : "light")

/**
 * Hex `#RRGGBB` → triplet HSL `"H S% L%"` (arredondado), o formato dos tokens do tema
 * (`--primary: 270 100% 50%`, consumidos como `hsl(var(--primary))`).
 */
export function hexToHslTriplet(hex: string): string {
    const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const lightness = (max + min) / 2
    const delta = max - min
    let hue = 0
    let saturation = 0
    if (delta > 0) {
        saturation = delta / (1 - Math.abs(2 * lightness - 1))
        if (max === r) hue = ((g - b) / delta) % 6
        else if (max === g) hue = (b - r) / delta + 2
        else hue = (r - g) / delta + 4
        hue = (hue * 60 + 360) % 360
    }
    return `${Math.round(hue) % 360} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`
}
