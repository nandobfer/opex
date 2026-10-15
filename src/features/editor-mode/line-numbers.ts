"use client"

import { z } from "zod"
import { readPersistentState, usePersistentState, writePersistentState } from "@/hooks/usePersistentState"

/** Números de linha do editor Vim, como `number` e `relativenumber` do Vim. */
export const lineNumbersSchema = z.object({ number: z.boolean(), relativenumber: z.boolean() })
export type LineNumbers = z.infer<typeof lineNumbersSchema>

export const LINE_NUMBERS_KEY = "opex:editor-mode:line-numbers:v1"
export const DEFAULT_LINE_NUMBERS: LineNumbers = { number: true, relativenumber: false }

export type LineNumberOption = keyof LineNumbers

/** Preferência global dos números de linha (todas as abas e campos), salva no navegador. */
export function useLineNumbers(): LineNumbers {
    return usePersistentState(LINE_NUMBERS_KEY, lineNumbersSchema, DEFAULT_LINE_NUMBERS).value
}

export function readLineNumbers(): LineNumbers {
    return readPersistentState(LINE_NUMBERS_KEY, lineNumbersSchema, DEFAULT_LINE_NUMBERS)
}

export function setLineNumberOption(option: LineNumberOption, value: boolean): void {
    writePersistentState(LINE_NUMBERS_KEY, { ...readLineNumbers(), [option]: value })
}

/**
 * Texto do número de uma linha, como no Vim: absoluto com `number`; distância até o cursor com
 * `relativenumber` (na linha do cursor, `0`, ou o número absoluto quando os dois estão ligados).
 */
export function formatLineNumber(line: number, cursorLine: number, options: LineNumbers): string {
    if (!options.relativenumber) return String(line)
    if (line === cursorLine) return options.number ? String(line) : "0"
    return String(Math.abs(line - cursorLine))
}
