---
description: "Run staged synthetic conversations through IM consumers and retain structured local output."
kind: "package-bundle"
---
# dsh-plugin-lab

English | [中文](README.zh.md)

## Summary

Exercise staged conversations with synthetic identities, retain complete source cases before computation, and capture structured outbound messages locally. Native owner controls manage background cases and original downloads. Optional media preserves exact images, audio, video and files through scoped native attachments, with browser uploads and previews. Installed consumers supply models and tools. Optional durable-job observation waits for final outcomes and cleanup. An optional forward resolver retains nested graphs, quotes and original mappings. External-write capture remains pending.

## Table of Contents

- [Current use and scope](#current-use-and-scope)
- [Background work](#background-work)
- [Native owner page](#native-owner-page)
- [Scenario example](#scenario-example)
- [Original media](#original-media)
- [Storage and cancellation](#storage-and-cancellation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="background-work"></a>
## Background work

The optional dsh-plugin-lab/job-delivery component requires dsh-job-delivery 0.2.0-development in the same dedicated profile. Install that bundle first and configure its native jobs and domain storage. Enable the observer row and require it in the runtime settings; it is disabled by default and text/media cases do not require the task package. Example profile overlay:

```yaml
- id: plugin-lab-runtime
  config:
    enabled: true
    requiredBackgroundProviders: job-delivery
- id: plugin-lab-job-delivery
  disabled: false
- id: job-delivery
  config:
    enabled: true
```

Every stage waits for its newly admitted tasks and actual worker cleanup before a later stage can quote the captured output. Reports retain selected and required observer IDs and complete task-state counts without task input bodies. Missing observers fail before dispatch. Failed, cancelled and uncertain outcomes remain explicit; no automatic retries or generation replay occur. Cancellation stops and joins owned work before capture closes. Only exact synthetic run scopes may be observed, and preexisting tasks are refused without mutation.

maxBackgroundProviders and maxBackgroundTasks bound registrations and per-case observations. requiredBackgroundProviders is a comma-separated list of installed IDs. Custom Host observers use registerBackground and provide stage settlement plus joined cleanup. They must admit child work before their own completion; detached work started after completion is outside this guarantee. New reports use schema 3; immutable schema-1 and schema-2 reports remain readable without replay or migration. See the [upgrade guide](https://github.com/Soldsix/dsh-plugin-lab/blob/main/docs/upgrade-guide/v0.1.0-development/background-capture/guide.md).

Structured forward cases additionally install dsh-qq-forward 0.1.0-development and enable plugin-lab-forward with config.enabled=true; the default row is disabled. Its provider field defaults to qq-forward. Enable the separate qq-forward core, native storage/attachments and lab media. The source example in [examples/forward.case.json](examples/forward.case.json) uses synthetic actors, inline original assets, nested resources, internal node quotes and earlier-input quotes. RunContent passes normalized messages to the same IM consumers; the optional adapter uses the installed forward core instead of a second graph implementation.

Each input can add content entries with a provider ID and complete JSON value. The forward format accepts nodes and optional named resources; nodes have actor, optional display name/sourceId and ordered text, mention, media asset, forward, inline-forward, reply-input or reply-node parts. Aliases resolve only inside this synthetic run. New content records retain the document, completeness and original-handle mapping before local acceptance. The owner page provides bounded escaped document previews and complete original downloads; the JSONL export keeps the entire graph. Missing providers, invalid sources, ambiguous resolvers and capacity failures stay explicit. See the [upgrade guide](docs/upgrade-guide/v0.2.0-development/content-capture/guide.md).

maxContentProviders, maxContentPerInput and maxArtifactsPerCapture bound installed resolvers and each message. Existing record/report and media limits also apply; originals are not resized or re-encoded. Custom Host providers use registerContent and implement scoped input conversion, quote observation, output capture and joined close. Removing a resolver cancels and joins its cases before releasing the source provider. It neither installs a live QQ sender nor grants filesystem/URL access to source JSON.

<a id="current-use-and-scope"></a>
## Current use and scope

The development bundle targets DSH 0.2.2-rc.1, whose published Host requires Node >=24.9.0; Node 22 checks are compatibility probes. It uses independent dsh-im-kit 0.2.1 and dsh-media-kit 0.2.0 libraries plus the Host attachment capability. It is disabled by default and requires a dedicated profile without another IM provider. Each run binds synthetic actors, peers and a separate account. An installed consumer such as dsh-qq-chat supplies actual chat behavior; the lab implements no model client or live QQ sender.

Isolated SDK and Web profiles install the tarballs through the normal DSH plugin manager; no production profile is imported. After installing peer dependencies, `npm run check` builds and tests the source. Building initializes the archive destination; `npm pack --pack-destination artifacts` creates the package used by the integration scripts. The Host service offers `run`, background `start`, `wait`, `cancel`, `inspect`, `list`, `export` and metadata-only `status`. A missing consumer is an explicit failure.

Install the development release in a dedicated profile, then install the consumers you want to test in that same profile. The default Web template supplies native attachments; other templates must provide that service explicitly. The lab does not install a chat, vision, search or generation consumer for you.

```sh
dsh --profile qq-lab --from-default-profile web --dump-config
dsh plugin --profile qq-lab add ./artifacts/dsh-plugin-lab-0.3.0-development.tgz
dsh --profile qq-lab --no-open
```

<a id="native-owner-page"></a>
## Native owner page

The bundle adds a controller and a disabled runtime row. In DSH Web, open Plugins, choose dsh-plugin-lab, enable the runtime and save. All runtime limits and storage settings are editable. Revision checks refuse stale saves; active cases or downloads block configuration changes and restarts. The page preserves drafts during polling and failed saves. The controller remains available when the runtime is disabled.

Paste a scenario into Scenario JSON and start a new case. Admission returns after the complete source is flushed, then execution continues when the page closes or reloads. Stored reports can be selected, inspected and explicitly cancelled. The page shows bounded text previews and marks omitted captures or text. Download full original report streams the exact retained JSONL through the native owner-authenticated connection; it accepts only a run ID, never a filesystem path. Runtime disposal aborts and joins its cases, and controller disposal joins its owned runs and downloads.

Run `npm run test:native -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz> --media-archive <media.tgz> --job-archive <job.tgz>` for installed SDK integration, or `npm run test:web -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz> --media-archive <media.tgz> --job-archive <job.tgz> --browser-cache <playwright-browsers>` for a fresh headless Web profile. Real API checks use `npm run test:real-api -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz> --credential-store <managed-credentials.yaml>` with the configured official DeepSeek credential read-only. These tests send no QQ messages and perform no Bilibili writes; third-party code installed by an operator is not sandboxed by the lab.

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

An input can quote an earlier input with `replyTo`, or an earlier captured bot output with `replyToOutput: {"stage": 0, "index": 0}`; never both. Stage and output indexes start at zero. The output index selects only the same conversation in durable capture order during that stage, not a particular input or another conversation. Concurrent/future selectors fail before execution; if the selected earlier output does not exist, the run retains its source and fails before publishing the dependent input. One `{format, content}` card can retain original JSON/XML and share the text capacity with the body. An empty text body requires a card, media or structured content; the installed consumer owns parsing, search and page access.

<a id="original-media"></a>
## Original media

Enable `mediaEnabled` in the advanced owner settings and save before submitting new media. Turning it off does not remove retained originals or their owner downloads; current read limits still apply. Choose an input in Attach to input, then select files in Add original files. The page appends complete Base64 assets and references to that input, preserving other messages and original text. A changed draft wins over an unfinished file read; the upload is rejected without overwriting it. You can also submit this complete image case:

```json
{
  "title": "Local original image",
  "actors": [
    "alice"
  ],
  "conversations": [
    {
      "id": "lounge",
      "kind": "group"
    }
  ],
  "assets": [
    {
      "id": "pixel",
      "fileName": "pixel.png",
      "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/1UAAAAASUVORK5CYII="
    }
  ],
  "stages": [
    {
      "inputs": [
        {
          "id": "picture",
          "actor": "alice",
          "conversation": "lounge",
          "text": "Read this image",
          "directed": true,
          "media": [
            {
              "type": "image",
              "asset": "pixel"
            }
          ]
        }
      ]
    }
  ]
}
```

An asset has `id`, `fileName`, complete canonical `base64`, optional `textMime` for plain text/HTML/JSON, or explicit `unclassified: true` for opaque archival. It accepts neither a host path nor a source URL. Inputs refer to `{type, asset}` entries in `media`; image-only bodies may be empty. Scope-bound handles are created after retaining the source and durable native grant. Repeated assets within one conversation reuse the import; other conversations and cases receive independent handles. Unknown codecs can be preserved as file or explicitly unclassified audio without a playback claim.

`maxMediaItemBytes`, `maxMediaBytes`, `maxMediaReferences`, `maxMediaOperations`, `maxMediaDimension`, `maxMediaPixels`, `mediaChunkBytes` and `allowedMediaMimeTypes` are editable capacities. Source-byte sums and unique stored originals each obey the total byte limit. Base64 occupies more space than the original: record/report limits also apply to the complete retained source, independently of media limits. Capacity failures preserve the caller draft and never truncate media.

The owner page lists bounded retained originals with size, MIME, dimensions and hash. Image previews use original encoded bytes; audio/video controls request the same bytes. Download original performs complete integrity verification before returning bytes; HTML and other files use attachment responses. Media reads and active writers block conflicting configuration changes. Reports retain native grants for later downloads without rerunning a case. Forwards resolved by the optional content provider retain their complete document and scoped original mapping. An unresolved or incomplete forward still contributes to `unresolvedMedia`; opaque references never count as verified content.

The lab does not recognize images, transcribe speech, synthesize voice or generate pictures itself. Install a consumer that reads `ctx.imMedia` and returns output through the normal IM service. Its configured model and tool calls still execute; only declared local message/media outputs are captured. The profile owner controls original downloads through the same authenticated native connection as report downloads.

<a id="storage-and-cancellation"></a>
## Storage and cancellation

The default report directory is `data/im-lab` within the profile. A marked local root and exclusive run file retain the original case before any publication; append operations flush before reporting capture acceptance. Run IDs are lowercase filename-safe strings of 16–80 characters, including UUIDs. Repeated source identity with changed content is a conflict. Existing unfinished evidence is inspected without resuming or repairing it. Source and output are never truncated to fit limits; rejected admission or storage failure remains explicit.

Run count, stages, inputs, per-stage concurrency, text size, actors, conversations, record/report byte limits, page size and deadline are validated configuration fields. Capacity rejects a new request before admission, leaving its source with the caller. Cancelling one run aborts and joins its consumers while sibling runs continue. Runtime close joins its runs; its caller owns final IM shutdown. Active writers cannot be exported. Partial final journal lines remain untouched and visible as incomplete evidence; export does not repair them.

## Model Experience

This package registers no model tool and does not add a prompt or request its own model. It publishes normalized synthetic envelopes to installed IM consumers. Those consumers own presets, model calls, source logging, reply policy and public-output selection. The local transport captures their complete structured outbound parts and returns a local receipt; it never proves acceptance by QQ. An enabled consumer may execute its configured tools, so arbitrary trusted Host code is not sandboxed by this package.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Local tests cover original media, three concurrent 15-actor cases, owner permissions, cancellation, durable background cases, original downloads and browser upload/preview/decode. Actual installed-job cases additionally cover admission-only producers, output quotes and joined cancellation. They do not prove natural dialogue, OCR identity accuracy, synthesis quality or complete application behavior.
- Earlier real DeepSeek text smokes cover context recall, arithmetic and retained public replies. This media checkpoint uses controlled local model fixtures and real native attachment APIs, not new upstream model calls. Repository CI exercises Windows/Linux packages and native profiles plus Linux Web; Desktop and real QQ delivery remain unverified.
- Unresolved forwards, final QQ encoding, captured platform writes need additional adapters. Arbitrary trusted Host code is not sandboxed, and this package does not silently block or capture its direct external writes.
- Owner reports retain full source text, source bytes and native receipts locally without encryption. Control operations and downloads reject non-owners even with global Remote permissions. Core Host hot-replacement limits documented by Chat also apply.
