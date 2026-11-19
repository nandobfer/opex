import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores([
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
        "coverage/**",
        "dist/**",
        "node_modules/**",
        "docs/**",
        // SDK de plugins (OPE-172): arquivos exportados para a pasta de trabalho do plugin, fora do app.
        "plugin-sdk/**",
    ]),
])

export default eslintConfig
