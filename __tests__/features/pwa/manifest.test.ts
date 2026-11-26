import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildManifest } from "@/features/pwa/manifest"
import { PWA_BACKGROUND } from "@/features/pwa/constants"

function hslToHex(h: number, s: number, l: number): string {
    const a = s * Math.min(l, 1 - l)
    const channel = (n: number) => {
        const k = (n + h / 30) % 12
        const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
        return Math.round(value * 255).toString(16).padStart(2, "0")
    }
    return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase()
}

describe("manifest do PWA", () => {
    it("na raiz: abre em tela cheia em pt-BR, com escopo e in\u00edcio na raiz do app", () => {
        const manifest = buildManifest("")
        expect(manifest.name).toBe("Opex")
        expect(manifest.short_name).toBe("Opex")
        expect(manifest.lang).toBe("pt-BR")
        expect(manifest.display).toBe("standalone")
        expect(manifest.orientation).toBeUndefined()
        expect(manifest.start_url).toBe("/")
        expect(manifest.scope).toBe("/")
        expect(manifest.id).toBe("/")
        expect(manifest.theme_color).toBe(PWA_BACKGROUND)
        expect(manifest.background_color).toBe(PWA_BACKGROUND)
    })

    it("com subcaminho p\u00fablico: in\u00edcio, escopo, id e \u00edcones levam o BASE_PATH", () => {
        const manifest = buildManifest("/dev_automacao/tarefas-fernando")
        expect(manifest.start_url).toBe("/dev_automacao/tarefas-fernando/")
        expect(manifest.scope).toBe("/dev_automacao/tarefas-fernando/")
        expect(manifest.id).toBe("/dev_automacao/tarefas-fernando/")
        for (const icon of manifest.icons ?? []) expect(icon.src.startsWith("/dev_automacao/tarefas-fernando/pwa/")).toBe(true)
    })

    it("tem os \u00edcones 192, 512 e o maskable 512 em PNG, todos existentes em public/", () => {
        const icons = buildManifest("").icons ?? []
        expect(icons.map((icon) => [icon.src, icon.sizes, icon.purpose])).toEqual([
            ["/pwa/icon-192.png", "192x192", "any"],
            ["/pwa/icon-512.png", "512x512", "any"],
            ["/pwa/icon-maskable-512.png", "512x512", "maskable"],
        ])
        for (const icon of icons) {
            expect(icon.type).toBe("image/png")
            const data = readFileSync(join(process.cwd(), "public", icon.src))
            const [width, height] = (icon.sizes ?? "").split("x").map(Number)
            expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([width, height])
        }
    })

    it("a cor do PWA \u00e9 o --background do tema escuro (globals.css)", () => {
        const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
        const match = /\.dark\s*\{[^}]*--background:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(css)
        expect(match).not.toBeNull()
        const [, h, s, l] = match!.map(Number)
        expect(hslToHex(h, s / 100, l / 100)).toBe(PWA_BACKGROUND)
    })
})
