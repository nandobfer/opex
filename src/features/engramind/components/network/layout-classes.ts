import { FLOW_SURFACE_CLASS, FLOW_THEME_STYLE } from "@/components/flow/flow-theme"

/** Dimensões compartilhadas pela rede e pelo skeleton (o skeleton acompanha a interface). */

/** Fundo das redes no padrão do app (tema compartilhado dos canvas React Flow, `@/components/flow/flow-theme`). */
export const NETWORK_CANVAS_CLASS = `${FLOW_SURFACE_CLASS} h-[min(72dvh,44rem)] w-full max-md:h-[70dvh]`
/** Tema do React Flow pelos tokens do app (variáveis no próprio elemento vencem a folha do `colorMode="dark"`). */
export const NETWORK_FLOW_THEME = FLOW_THEME_STYLE
/** Altura menor dos universos dentro dos cards de `/integracoes/ia` (no celular, quase a tela). */
export const NETWORK_CANVAS_COMPACT_CLASS = "h-[28rem] max-md:h-[60dvh]"
export const NETWORK_TOOLBAR_CLASS = "flex flex-wrap items-center gap-2"
export const NETWORK_STATS_CLASS = "pointer-events-auto absolute right-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-64 overflow-y-auto rounded-xl border bg-card/90 p-3 text-xs shadow-lg backdrop-blur max-md:left-3 max-md:w-auto"
/** Card de estatísticas recolhido (celular): um botão no canto com o resumo. */
export const NETWORK_STATS_TOGGLE_CLASS = "pointer-events-auto absolute right-3 top-3 z-10 flex h-10 items-center gap-1.5 rounded-xl border bg-card/90 px-3 text-xs font-medium text-foreground shadow-lg backdrop-blur"
/** Área de toque mínima (40 px) dos botões sobre a rede no celular. */
export const NETWORK_TOUCH_BUTTON_CLASS = "max-md:h-10 max-md:px-3"
