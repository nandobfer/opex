import { describe, expect, it } from 'vitest'
import { SETTING_HELP } from '@/features/engramind/help/settings'
import { ENV_HELP } from '@/features/engramind/help/env-vars'
import { JOB_KIND_HELP, JOB_STATE_HELP, USAGE_GROUP_HELP } from '@/features/engramind/help/operation'
import { SCOPE_COMBINATION_HELP, SCOPE_HELP, SUBSCRIPTION_MODE_HELP, TOKEN_KIND_HELP, TOKEN_STATUS_HELP } from '@/features/engramind/help/identities'
import { ENV_EDITABLE_KEYS, ENV_READ_ONLY_KEYS, ENV_WRITE_ONLY_KEYS, JOB_KINDS, JOB_STATES, SCOPE_COMBINATIONS, SUBSCRIPTION_MODES, TOKEN_KINDS, USAGE_GROUPS } from '@/features/engramind/constants'
import { ENGRAMIND_ABOUT_TOPICS, ENGRAMIND_SUMMARY } from '@/features/engramind/help/about'

/** Toda configuração, variável, escopo, tipo, modo, job e agrupamento tem o texto do tooltip. */

// Chaves do guia `configuracoes` do Engramind v0.8.0.
const SETTING_KEYS = [
  'limits.rate_per_minute', 'limits.max_batch', 'categories.list', 'memory.text_min', 'memory.text_max', 'memory.dedupe_exact', 'memory.similar_threshold',
  'context.budget_tokens', 'context.titles_budget_tokens', 'context.default_format', 'context.token_estimator', 'context.overflow_line',
  'redator.enabled', 'redator.provider', 'redator.model', 'redator.api_key', 'redator.base_url', 'redator.instructions', 'redator.rewrite_text', 'redator.title_max', 'redator.min_similarity', 'redator.timeout_ms', 'redator.max_attempts', 'redator.fallback_models', 'redator.temperature',
  'embedding.provider', 'embedding.model', 'embedding.base_url', 'embedding.api_key', 'embedding.dimensions', 'embedding.query_prefix', 'embedding.document_prefix', 'embedding.batch_size', 'embedding.timeout_ms',
  'search.vector_weight', 'search.text_weight', 'search.rrf_k', 'search.default_limit', 'search.hint_threshold', 'search.hint_limit',
  'webhooks.enabled', 'webhooks.timeout_ms', 'webhooks.max_attempts',
  'retention.usage_days', 'retention.llm_calls_days', 'retention.audit_days', 'retention.jobs_days',
]

describe('cobertura dos tooltips', () => {
  it('toda configuração do Engramind tem rótulo e explicação', () => {
    for (const key of SETTING_KEYS) expect(SETTING_HELP[key]?.help.length ?? 0, key).toBeGreaterThan(10)
  })

  it('toda variável do .env.example tem explicação', () => {
    for (const key of [...ENV_EDITABLE_KEYS, ...ENV_WRITE_ONLY_KEYS, ...ENV_READ_ONLY_KEYS]) expect(ENV_HELP[key]?.length ?? 0, key).toBeGreaterThan(10)
  })

  it('escopos, combinações, tipos, status, modos, jobs e agrupamentos', () => {
    for (const scope of ['read', 'write', 'delete']) expect(SCOPE_HELP[scope]).toBeTruthy()
    for (const combination of SCOPE_COMBINATIONS) expect(SCOPE_COMBINATION_HELP[combination]).toBeTruthy()
    for (const kind of TOKEN_KINDS) expect(TOKEN_KIND_HELP[kind]).toBeTruthy()
    for (const status of ['active', 'expired', 'revoked']) expect(TOKEN_STATUS_HELP[status]).toBeTruthy()
    for (const mode of SUBSCRIPTION_MODES) expect(SUBSCRIPTION_MODE_HELP[mode]).toBeTruthy()
    for (const kind of JOB_KINDS) expect(JOB_KIND_HELP[kind]).toBeTruthy()
    for (const state of JOB_STATES) expect(JOB_STATE_HELP[state]).toBeTruthy()
    for (const group of USAGE_GROUPS) expect(USAGE_GROUP_HELP[group]).toBeTruthy()
  })

  it('a seção Sobre tem o resumo e os tópicos detalhados', () => {
    expect(ENGRAMIND_SUMMARY).toContain('Rust')
    expect(ENGRAMIND_ABOUT_TOPICS.map((topic) => topic.id)).toEqual(expect.arrayContaining(['arquitetura', 'identidades', 'canais', 'memorias', 'redator', 'embeddings', 'webhooks', 'opex']))
  })
})
