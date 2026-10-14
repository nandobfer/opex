"use client"

import { useEffect, useState } from "react"
import { SEARCH_DEBOUNCE_MS } from "@/components/list/ListFilters"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { DEFAULT_CENTRAL_SEARCH, centralSearchSchema } from "../central-filters"

/**
 * Busca das centrais de desenvolvimento: o texto digitado aparece na hora e vai para a URL
 * (`?buscaCentrais=…`) com o atraso padrão das buscas do projeto, preservando a aba (`?aba=…`) e os
 * demais parâmetros. Mudanças externas (navegar, limpar) voltam para o campo.
 */
export function useCentralSearch(): { term: string; setTerm: (value: string) => void; clear: () => void } {
    const [filters, setFilters] = useUrlFilters(DEFAULT_CENTRAL_SEARCH, centralSearchSchema)
    const [term, setTerm] = useState(filters.buscaCentrais)
    // Acompanha mudanças externas (Limpar, voltar no navegador): o campo segue a URL.
    const [lastUrl, setLastUrl] = useState(filters.buscaCentrais)
    if (lastUrl !== filters.buscaCentrais) {
        setLastUrl(filters.buscaCentrais)
        setTerm(filters.buscaCentrais)
    }

    useEffect(() => {
        if (term === filters.buscaCentrais) return
        const timer = setTimeout(() => setFilters({ buscaCentrais: term }), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [term, filters.buscaCentrais, setFilters])

    const clear = () => {
        setTerm("")
        setFilters(DEFAULT_CENTRAL_SEARCH)
    }

    return { term, setTerm, clear }
}
