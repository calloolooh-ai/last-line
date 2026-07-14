/**
 * Pinned Groq model IDs — two-tier routing (see ARCHITECTURE.md §2).
 *
 * ⚠️ Groq rotates its model catalog. If either ID below 404s, re-verify and
 * repin against https://console.groq.com/docs/models — a dead model ID is a
 * stupid way to lose an hour on demo day.
 */

/** Quality tier — the user-facing chat answer. */
export const CHAT_MODEL = "llama-3.3-70b-versatile";

/** Speed tier — ALL firewall internals (injection classification, claim
 * extraction, evidence judgment). Called many times per message; must be fast
 * and cheap. Never use CHAT_MODEL for these.
 *
 * Must support Groq structured outputs (`response_format: json_schema`) since
 * every firewall call goes through `classify()`. llama-3.1-8b-instant does
 * NOT support that — it 400s with "This model does not support response
 * format `json_schema`". gpt-oss-20b does, and is still speed-tier. */
export const FAST_MODEL = "openai/gpt-oss-20b";
