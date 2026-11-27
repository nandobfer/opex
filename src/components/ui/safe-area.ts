/**
 * Safe areas do app instalado (PWA, OPE-196). Com `viewport-fit=cover` (layout raiz), o conteúdo vai
 * até as bordas do aparelho: notch, barra de status e barra de gestos. Estas classes reservam o espaço
 * só onde o layout encosta nas bordas; no desktop e no navegador comum os insets valem 0.
 */

/** Raiz da casca (`AppShell`): os quatro lados. */
export const SAFE_AREA_PADDING =
    "pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"

/** Painel fixo de altura total (gaveta do menu, tela cheia do chat): topo e base. */
export const SAFE_AREA_Y = "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"

/** Painel fixo com margem nas quatro bordas (`inset-4`/`inset-6`): a margem ou o inset, o que for maior. */
export const SAFE_AREA_INSET_4 =
    "top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))]"
export const SAFE_AREA_INSET_6 =
    "top-[max(1.5rem,env(safe-area-inset-top))] right-[max(1.5rem,env(safe-area-inset-right))] bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[max(1.5rem,env(safe-area-inset-left))]"

/**
 * Folha de baixo (`Sheet`, o único lado desde a OPE-208): o respiro padrão (`p-6`) ou o inset da barra de gestos,
 * o que for maior. O `SheetContent` aplica a classe **depois** do `className` do chamador, para um padding dele
 * (`p-0`, `p-4`) não descartá-la.
 */
export const SAFE_AREA_SHEET = "pb-[max(1.5rem,env(safe-area-inset-bottom))]"

/** Barra flutuante presa à base (`bottom-6` + o inset inferior). */
export const SAFE_AREA_FLOATING_BOTTOM = "bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"

/** Distância dos toasts às bordas no celular (padrão do sonner, 16px, somado ao inset). */
export const SAFE_AREA_TOAST_MOBILE_OFFSET = {
    top: "calc(16px + env(safe-area-inset-top))",
    right: "calc(16px + env(safe-area-inset-right))",
    bottom: "calc(16px + env(safe-area-inset-bottom))",
    left: "calc(16px + env(safe-area-inset-left))",
} as const
