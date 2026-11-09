---
kind: upgrade-guide
description: "Structured laboratory sources and captured artifacts require generation-three readers and updated native client codecs."
---
# Upgrade structured content capture

## Change

New reports use schema 3, retain installed content resolver identities and record complete structured output documents with scoped original mappings. Schema-1 and schema-2 scenario parsers remain unchanged; old reports and their directory marker are retained without rewriting or replay. An older release cannot read generation-three reports.

Complete Config objects gain maxContentProviders, maxContentPerInput and maxArtifactsPerCapture. EngineStatus gains contentProviders; owner inspect results gain contents and omittedContents. Failure unions add content-unavailable, content-invalid and content-limit. The optional forward entry requires the independently installed dsh-qq-forward 0.1.0-development service.

## Migration

1. Upgrade the bundle and reload its native client together. Preserve all old reports, original attachments and the existing marker; no downgrade conversion is supplied.
2. Resolve settings through Config or update complete typed settings, status and owner-response objects. Select the optional forward resolver explicitly when testing forwards; it stays disabled by default.
3. Use synthetic actors, conversation aliases and inline source assets. Source extensions name an installed provider; they grant no live QQ account, arbitrary file or URL access. Custom resolvers must implement input, observe, capture and joined close.
4. Run legacy report, structured capture, original-byte, isolation and cancellation tests. Confirm old report bytes remain unchanged, complete forward graphs resolve their media count, and retained originals remain readable after resolver shutdown.
