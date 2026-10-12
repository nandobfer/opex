/**
 * Lista das migrações do app, na ordem de execução. Importado dinamicamente por
 * `runMigrations()` para evitar ciclos de import com os modelos.
 */
import { registerMigrations } from "./index"
import { seedIntegrationsFromEnv } from "./seed-integrations-from-env"
import { repairIntegrationIndexes } from "./repair-integration-indexes"
import { dropLegacyCollections } from "./drop-legacy-collections"
import { backfillTaskClientId } from "./backfill-task-client-id"
import { ensureAiUsageIndexes } from "./ensure-ai-usage-indexes"
import { ensureAiConsumptionIndexes } from "./ensure-ai-consumption-indexes"
import { backfillClientUsers } from "./backfill-client-users"

registerMigrations(
    { name: "seed-integrations-from-env", run: () => seedIntegrationsFromEnv() },
    { name: "repair-integration-indexes", run: () => repairIntegrationIndexes() },
    { name: "drop-legacy-collections", run: () => dropLegacyCollections() },
    { name: "backfill-task-client-id", run: () => backfillTaskClientId() },
    { name: "ensure-ai-usage-indexes", run: () => ensureAiUsageIndexes() },
    { name: "ensure-ai-consumption-indexes", run: () => ensureAiConsumptionIndexes() },
    { name: "backfill-client-users", run: () => backfillClientUsers() },
)
