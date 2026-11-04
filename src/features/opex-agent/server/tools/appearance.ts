import { z } from "zod"
import { hexColorSchema } from "@/lib/colors"
import { COLOR_NAME_MAX } from "@/features/color-palette/constants"
import { favoriteColorSchema } from "@/features/color-palette/schemas"
import { addFavoriteColor, getColorPalette, removeFavoriteColor, updateFavoriteColor } from "@/features/color-palette/server/service"
import { defineTool } from "./define"

/**
 * Configurações › Aparência: cores favoritas do seletor de cores (as mesmas funções de serviço da tela).
 * Por decisão do dono (OPE-136), nenhuma pede confirmação nem é destrutiva — remover inclusive: quem já
 * usa a cor (central, coluna, Maddox) guarda o próprio hex e não muda.
 */

const hex = z.string().trim().min(1).max(7).describe("Cor em hexadecimal #RRGGBB (ex.: #8000FF)")
const name = z.string().trim().max(COLOR_NAME_MAX).nullish().describe("Nome da favorita (opcional; sem nome, a tela mostra o hex)")

export const appearanceTools = [
    defineTool({
        name: "list_favorite_colors",
        group: "appearance",
        label: "Cores favoritas",
        risk: "read",
        description: "Cores favoritas do seletor de cores (Configurações › Aparência), na ordem exibida, com hex e nome. Sem nada salvo, valem as 10 cores padrão.",
        input: z.object({}),
        execute: async () => getColorPalette(),
    }),
    defineTool({
        name: "add_favorite_color",
        group: "appearance",
        label: "Adicionar cor favorita",
        risk: "write",
        description: "Adiciona uma cor no fim das favoritas. Cor repetida ou mais de 40 favoritas é recusado.",
        input: z.object({ color: hex, name }),
        summarize: (input) => `Adicionar ${input.color} às cores favoritas`,
        execute: async (input, context) => addFavoriteColor(favoriteColorSchema.parse(input), context.actorId),
    }),
    defineTool({
        name: "update_favorite_color",
        group: "appearance",
        label: "Editar cor favorita",
        risk: "write",
        description: "Edita nome e/ou cor de uma favorita, mantendo a posição. Quem já usa a cor antiga continua com ela. Sem mudança, nada é gravado.",
        input: z.object({ currentColor: hex.describe("Hex atual da favorita (#RRGGBB)"), color: hex.describe("Nova cor (#RRGGBB); repita a atual para mudar só o nome"), name }),
        summarize: (input) => `Editar a cor favorita ${input.currentColor}`,
        execute: async (input, context) => updateFavoriteColor(hexColorSchema.parse(input.currentColor), favoriteColorSchema.parse({ color: input.color, name: input.name }), context.actorId),
    }),
    defineTool({
        name: "remove_favorite_color",
        group: "appearance",
        label: "Remover cor favorita",
        risk: "write",
        description: "Remove uma cor das favoritas. Centrais, colunas e o Maddox que já usam a cor continuam com ela.",
        input: z.object({ color: hex }),
        summarize: (input) => `Remover ${input.color} das cores favoritas`,
        execute: async (input, context) => removeFavoriteColor(hexColorSchema.parse(input.color), context.actorId),
    }),
]
