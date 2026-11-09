---
kind: upgrade-guide
description: "New laboratory reports require a reader that understands background observations and generation two headers."
---
# Upgrade background capture

## Change

New reports use journal schema 2 and record selected and required background observers plus stage task observations. The reader continues to support immutable schema-1 reports; existing files are not moved, rewritten or replayed. The directory marker stays at layout version 1. Older laboratory releases cannot read generation-two reports.

Typed complete Config objects gain maxBackgroundProviders, maxBackgroundTasks and requiredBackgroundProviders. EngineStatus gains backgroundProviders. Failure unions include explicit unavailable, limited, failed and unresolved background outcomes.

## Migration

1. Upgrade the laboratory bundle and reload the client. Keep old reports and their directory marker unchanged. There is no downgrade conversion.
2. Resolve settings through Config or update complete typed settings objects. Install the observer for the asynchronous task service you test and list its id in requiredBackgroundProviders. An absent required observer makes the case fail before input dispatch.
3. Update typed status and failure consumers. Custom background providers must return new task observations once per run, respect exact synthetic scopes and implement close by cancelling and joining unfinished work before local capture closes.
4. Run the legacy-journal and background-stage tests. Confirm old reports remain byte-identical and an asynchronous output is captured before a later stage quotes it.
