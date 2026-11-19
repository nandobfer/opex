/**
 * `@opex/theme` para os plugins (OPE-172): utilitário de classes e as grades de formulário do app. As
 * cores vêm dos tokens do tema (`bg-primary`, `text-muted-foreground`...), compilados no CSS do plugin.
 */
export { cn } from "@/lib/utils"
export { FORM_GRID, FORM_GRID_COMPACT, FORM_GRID_WIDE, FORM_GRID_3 } from "@/components/ui/form-grid"

/** Primária fixa do tema escuro (só para canvas/gráficos que precisam do valor; prefira as classes). */
export const PRIMARY_HEX = "#8000FF"
