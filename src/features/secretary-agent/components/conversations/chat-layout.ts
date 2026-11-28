/**
 * Medidas da aba Conversas (molde do Atendimento do Zaturno CRM), compartilhadas com os skeletons para o carregamento
 * ter a mesma estrutura do resultado final.
 */

/** Altura mínima do card (abaixo dela, a página rola). */
export const INBOX_MIN_HEIGHT_PX = 480
/**
 * Altura do card antes da primeira medida (sem salto no carregamento); medido, o card ocupa o restante da área visível
 * até o fim do `<main>` (`useInboxHeight`, OPE-207).
 */
export const INBOX_HEIGHT = "h-[calc(100dvh-15rem)] min-h-[480px]"
export const INBOX_MEASURED_HEIGHT = "min-h-[480px]"
/** Coluna da lista (340/380 px no desktop; tela inteira no celular). */
export const LIST_COLUMN = "md:w-[340px] lg:w-[380px]"
export const CHAT_HEADER_HEIGHT = "h-16"
/** Fundo da conversa e balões (tema escuro do Opex, decisão D5: balão do dono na primária). */
export const CHAT_BG = "bg-background/60"
export const BUBBLE_IN = "bg-muted text-foreground"
export const BUBBLE_OUT = "bg-primary text-primary-foreground"
