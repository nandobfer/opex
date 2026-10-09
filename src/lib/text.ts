/** Texto sem acentos, aparado e em minúsculas — para comparar e buscar. */
export const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
