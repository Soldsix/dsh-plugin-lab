---
description: "Run staged synthetic conversations through IM consumers and retain structured local output."
kind: "package-bundle"
---
# dsh-plugin-lab

English | [中文](README.zh.md)

## Summary

Exercise staged conversations with synthetic identities, retain complete source cases before computation, and capture structured outbound messages locally. Concurrent stages, durable admission, cancellation and repeated-submit protection use installed DSH consumers. A native owner page configures the runtime, tracks background cases and downloads original reports. Controlled integration, fresh-browser scenarios and basic real API text tests have passed. This remains a development package: complete media, external-write capture and cross-platform release verification are pending.

## Table of Contents

- [Current use and scope](#current-use-and-scope)
- [Native owner page](#native-owner-page)
- [Scenario example](#scenario-example)
- [Storage and cancellation](#storage-and-cancellation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="current-use-and-scope"></a>
## Current use and scope

The development bundle requires DSH 0.2.2-rc.1, Node ^22.19 or >=24 and the independent dsh-im-kit 0.2.1 library. It is disabled by default. Enabled runtime requires a dedicated profile without another IM provider; it refuses to replace an existing one. Each run maps synthetic aliases to independent accounts, actors and peers. An installed consumer such as dsh-qq-chat supplies actual chat behavior; this package implements neither a model client nor a live QQ sender.

Isolated SDK and Web profiles install the tarballs through the normal DSH plugin manager; no production profile is imported. After installing peer dependencies, `npm run check` builds and tests the source. `npm pack --pack-destination artifacts` creates the package used by the integration scripts. The Host service offers `run`, background `start`, `wait`, `cancel`, `inspect`, `list`, `export` and metadata-only `status`. A missing consumer is an explicit failure.

<a id="native-owner-page"></a>
## Native owner page

The bundle adds a controller and a disabled runtime row. In DSH Web, open Plugins, choose dsh-plugin-lab, enable the runtime and save. All runtime limits and storage settings are editable. Revision checks refuse stale saves; active cases or downloads block configuration changes and restarts. The page preserves drafts during polling and failed saves. The controller remains available when the runtime is disabled.

Paste a scenario into Scenario JSON and start a new case. Admission returns after the complete source is flushed, then execution continues when the page closes or reloads. Stored reports can be selected, inspected and explicitly cancelled. The page shows bounded text previews and marks omitted captures or text. Download full original report streams the exact retained JSONL through the native owner-authenticated connection; it accepts only a run ID, never a filesystem path. Runtime disposal aborts and joins its cases, and controller disposal joins its owned runs and downloads.

Run `npm run test:native -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz>` for installed SDK integration, or `npm run test:web -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz> --browser-cache <playwright-browsers>` for a fresh headless Web profile. Real API checks use `npm run test:real-api -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz> --credential-store <managed-credentials.yaml>` with the configured official DeepSeek credential read-only. These tests send no QQ messages and perform no Bilibili writes; third-party code installed by an operator is not sandboxed by the lab.

A DSH Host profile must provide its declared non-optional peer dependencies. Isolated SDK/Web verification uses a pinned pnpm and completes test-profile dependencies from installed DSH package declarations; it neither borrows ancestor dependencies nor changes production profiles.

<a id="scenario-example"></a>
## Scenario example

The source representation separates actor aliases, conversation aliases and stages. `directed` represents transport-confirmed bot addressing; `mentionActor` addresses another declared actor. An input cannot choose a live account or destination. Supply the following case as the `scenario` field together with a unique `runId`, or paste it into the owner page. The chosen consumer supplies the model and reply policy.

```json
{
  "title": "Local conversation",
  "actors": ["alice"],
  "conversations": [{"id": "lounge", "kind": "group"}],
  "stages": [
    {"inputs": [{"id": "first", "actor": "alice", "conversation": "lounge", "text": "Remember SYNTHETIC-ORBIT", "directed": true}]},
    {"inputs": [{"id": "followup", "actor": "alice", "conversation": "lounge", "text": "Repeat the code", "directed": false}]}
  ]
}
```

The normal consumer decides whether to answer. A `completed` result means the admitted stages settled; it is not a semantic-quality verdict, proof of a successful model turn, or QQ delivery verification. Captures preserve structured text, mentions, reply IDs and opaque media references. `unresolvedMedia` counts references that still lack final byte materialization.

An input may also carry `replyTo` and one `{format, content}` card. Quotes must target an input ID from an earlier stage in the same conversation; absent, concurrent or cross-conversation targets fail before execution. Cards retain their original JSON/XML string and share the text capacity with the body. A card can have an empty text body; the installed consumer still owns parsing, search and page access. This only quotes existing inputs, not generated bot replies selected by input alias.

<a id="storage-and-cancellation"></a>
## Storage and cancellation

The default report directory is `data/im-lab` within the profile. A marked local root and exclusive run file retain the original case before any publication; append operations flush before reporting capture acceptance. Run IDs are lowercase filename-safe strings of 16–80 characters, including UUIDs. Repeated source identity with changed content is a conflict. Existing unfinished evidence is inspected without resuming or repairing it. Source and output are never truncated to fit limits; rejected admission or storage failure remains explicit.

Run count, stages, inputs, per-stage concurrency, text size, actors, conversations, record/report byte limits, page size and deadline are validated configuration fields. Capacity rejects a new request before admission, leaving its source with the caller. Cancelling one run aborts and joins its consumers while sibling runs continue. Runtime close joins its runs; its caller owns final IM shutdown. Active writers cannot be exported. Partial final journal lines remain untouched and visible as incomplete evidence; export does not repair them.

## Model Experience

This package registers no model tool and does not add a prompt or request its own model. It publishes normalized synthetic envelopes to installed IM consumers. Those consumers own presets, model calls, source logging, reply policy and public-output selection. The local transport captures their complete structured outbound parts and returns a local receipt; it never proves acceptance by QQ. An enabled consumer may execute its configured tools, so arbitrary trusted Host code is not sandboxed by this package.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Current tests cover actual files, controlled consumers, 15 synthetic actors, native owner permissions, durable background runs, original-report downloads and light/dark/narrow Web layouts. They do not prove natural multi-person dialogue or complete application behavior.
- Basic real DeepSeek text turns verify context recall, arithmetic and retained public replies through the installed lab. They are not comparative intelligence or performance benchmarks. Linux, Desktop and full media scenarios remain unverified; this development source is not a sealed release candidate.
- Input media, exact materialized output bytes, final QQ encoding, background-job draining and captured external writes require additional adapters. Their presence is not inferred from an opaque attachment ID.
- Reports retain original text locally without encryption. All control operations and streaming downloads require the profile owner, including when a non-owner has global Remote permissions. Protect the local profile directory; core Host hot-replacement limits documented by the Chat package also apply to this integration.
