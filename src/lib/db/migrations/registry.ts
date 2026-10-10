/**
 * Lista das migrações do app, na ordem de execução. Importado dinamicamente por
 * `runMigrations()` para evitar ciclos de import com os modelos.
 */
import { registerMigrations } from "./index"
import { seedIntegrationsFromEnv } from "./seed-integrations-from-env"
import { repairIntegrationIndexes } from "./repair-integration-indexes"
import { dropLegacyCollections } from "./drop-legacy-collections"

registerMigrations(
    { name: "seed-integrations-from-env", run: () => seedIntegrationsFromEnv() },
    { name: "repair-integration-indexes", run: () => repairIntegrationIndexes() },
    { name: "drop-legacy-collections", run: () => dropLegacyCollections() },
)
