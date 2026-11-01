/**
 * Espaçamento horizontal da área de conteúdo (`<main>` do `AppShell`). Fonte única: quem precisa
 * "sangrar" até a borda do conteúdo (ex.: o kanban, que rola na horizontal) usa
 * `CONTENT_BLEED_X`, que anula o espaçamento com margem negativa e o devolve como padding — as
 * colunas rolam até a borda, e parado o alinhamento é o mesmo do resto da página.
 */
export const CONTENT_PADDING_X = "px-4 md:px-6 lg:px-8"

/**
 * Espaçamento horizontal das telas em que ele não passa do vertical (`py-6` do `<main>`): no
 * desktop fica em 24px, igual ao vertical, em vez dos 32px de `CONTENT_PADDING_X`. Celular e
 * tablet seguem o padrão. Usado pelas rotas de `EVEN_PADDING_PAGE_HREFS` (Central de desenvolvimento).
 */
export const CONTENT_PADDING_X_EVEN = "px-4 md:px-6"

export const CONTENT_BLEED_X = "-mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8"
