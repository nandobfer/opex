import { defineConfig } from "vitest/config"
import { opexSharedModules } from "./.opex-sdk/testing/vite-plugin.mjs"

/** Testes do plugin (Opex, OPE-172): os módulos do Opex viram stubs; React e bibliotecas são os reais. */
export default defineConfig({
    plugins: [opexSharedModules()],
    test: {
        globals: true,
        include: ["**/*.test.ts", "**/*.test.tsx"],
        exclude: ["node_modules/**", ".opex-sdk/**"],
        environment: "node",
    },
})
