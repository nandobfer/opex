import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
    test: {
        include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
        environment: "node",
        globals: true,
        hookTimeout: 30000,
        setupFiles: ["__tests__/setup.ts"],
        coverage: {
            provider: "v8",
            include: ["src/features/**/*.ts", "src/lib/**/*.ts"],
            exclude: ["src/**/*.d.ts", "src/**/types.ts", "src/**/index.ts", "src/**/*.config.ts"],
            reporter: ["text", "html", "lcov"],
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
})
