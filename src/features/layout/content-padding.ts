/**
 * Espaçamento horizontal da área de conteúdo (`<main>` do `AppShell`). Fonte única: quem precisa
 * "sangrar" até a borda do conteúdo (ex.: o kanban, que rola na horizontal) usa
 * `CONTENT_BLEED_X`, que anula o espaçamento com margem negativa e o devolve como padding — as
 * colunas rolam até a borda, e parado o alinhamento é o mesmo do resto da página.
 */
export const CONTENT_PADDING_X = "px-4 md:px-6 lg:px-8"

export const CONTENT_BLEED_X = "-mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8"
