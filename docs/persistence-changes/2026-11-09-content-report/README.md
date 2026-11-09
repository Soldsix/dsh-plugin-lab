# Laboratory content report generation 3

This acknowledgement covers the independent laboratory JournalEvent and scenario declarations. It changes no DSH SessionEventMap, SQLite schema or native attachment format. The directory marker stays at layout 1.

Released header generations 1 and 2 keep their legacy scenario parser and explicit LegacyScenario/LegacyScenarioInput fields. Their old created, input, dispatch, capture, media-grant and background records remain readable without migration, rewrite, replay or fallback behavior. The committed generation-one fixture remains unchanged; a completed prior native generation-two report is added as a separate immutable fixture.

The writer now emits header schema 3 with contentProviders and supports ScenarioInput.content. Each source names one installed resolver and contains finite JSON. New content events precede their associated capture and retain message/conversation/part identity, provider, format version, completeness, full document and original-handle mapping. Native media grants remain separate, scope-checked records; no path is accepted as an original selector.

Reader validation rejects new content under older headers, unknown providers, duplicate part records, source-ID ambiguity, mappings to foreign grants, artifacts on non-forward parts and forged terminal completeness. An incomplete forward remains unresolved. Existing source fingerprints are unchanged when content is absent; new source JSON uses canonical object-key ordering while preserving arrays and original retained text.

Validation owners are test/forward.test.mjs, test/background-observer.test.mjs and test/journal.test.mjs. The native SDK and Web suites additionally exercise the installed optional resolver, owner response fields, exact originals and reload. Upgrade actions are in docs/upgrade-guide/v0.2.0-development/content-capture/guide.md. Generations are not moved, overwritten or deleted; older releases cannot read generation-three reports.
