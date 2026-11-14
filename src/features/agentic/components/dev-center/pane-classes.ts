/**
 * Abaixo de `lg` (OPE-166) cada painel da Central de desenvolvimento (a coluna Tarefas e a mesa) ocupa a
 * largura toda da tela: o card perde borda, fundo e cantos e anula o espaçamento horizontal do `<main>`
 * (`CONTENT_PADDING_X_EVEN`: `px-4 md:px-6`). O `max-lg:w-auto` anula um `w-full` do painel: com largura
 * explícita o `stretch` não vale e a margem negativa só deslocaria o painel em vez de alargá-lo.
 */
export const DEV_CENTER_PANE_BLEED_CLASS = "max-lg:w-auto max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none max-md:-mx-4 md:max-lg:-mx-6"
