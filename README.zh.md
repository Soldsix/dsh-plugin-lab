---
description: "通过 IM 消费者运行分阶段合成对话，并保留结构化本地输出。"
kind: "package-bundle"
---
# dsh-plugin-lab

[English](README.md) | 中文

## 概要

使用合成身份执行分阶段对话，计算前保留完整来源，并在本地捕获结构化出站消息。原生所有者页面管理后台用例与原件下载；可选媒体功能保留图片、音视频及文件的完整字节。已安装消费者提供模型和工具；可选持久任务观察器等待最终结果与清理。可选转发解析器保留嵌套图、引用与原件映射，外部写入捕获仍待完成。

## 目录

- [当前用法与范围](#current-use-and-scope)
- [后台工作](#background-work)
- [原生所有者页面](#native-owner-page)
- [用例示例](#scenario-example)
- [媒体原件](#original-media)
- [存储与取消](#storage-and-cancellation)
- [模型体验](#model-experience)
- [已知限制与待完成工作](#known-limitations-and-deferred-work)

<a id="background-work"></a>
## 后台工作

可选 dsh-plugin-lab/job-delivery 组件要求同一独立 profile 安装 dsh-job-delivery 0.2.0-development。先安装该 bundle 并配置原生作业与域存储，再启用观察器条目并在运行时声明必需；观察器默认关闭，纯文字/媒体用例不要求任务包。profile 覆盖示例：

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

每阶段等待新受理的任务与实际工作清理结束，后续阶段才能引用捕获的输出。报告保留选中/必须的观察器 ID 和完整任务状态计数，不含任务输入正文。缺少观察器在投递前失败；失败、取消与不确定状态明确保留，不自动重试或重放生成。取消时先停止并等待所属工作再关闭捕获。只观察精确匹配的合成运行范围，发现已有任务则拒绝且不修改。

maxBackgroundProviders 和 maxBackgroundTasks 分别限制观察器注册与每用例任务观察数；requiredBackgroundProviders 是已安装 ID 的逗号分隔列表。自定义 Host 观察器通过 registerBackground 提供阶段等待和清理等待；子工作必须在父任务完成前受理，完成后另启的脱离工作不在保证范围。新报告使用 schema 3，不可变 schema 1、schema 2 报告仍可读取，不重放、不迁移。见[升级指南](https://github.com/Soldsix/dsh-plugin-lab/blob/main/docs/upgrade-guide/v0.1.0-development/background-capture/guide.zh.md)。

结构化转发用例还需安装 dsh-qq-forward 0.1.0-development，并启用 plugin-lab-forward、设置 config.enabled=true；该条目默认停用，provider 默认为 qq-forward。同时启用独立 qq-forward 核心、原生存储/附件和实验室媒体。[examples/forward.case.json](examples/forward.case.json) 提供合成参与者、内联原件、嵌套资源、内部节点引用及较早输入引用。RunContent 将规范化消息交给相同 IM 消费者；可选适配器调用已安装转发核心，不另写一套图实现。

每条输入可在 content 中提供解析器 ID 及完整 JSON 值。转发格式接受 nodes 和可选命名 resources；节点支持 actor、可选显示名/sourceId，按顺序排列 text、mention、媒体资产、forward、inline-forward、reply-input、reply-node。别名只在该合成用例中解析。新的 content 事件在本地接纳前保留文档、完整性及原件句柄映射。所有者页面提供有界转义文档预览和完整原件下载；JSONL 导出保留完整图。缺失提供者、来源错误、解析器歧义和容量失败均明确报告，见[升级指南](docs/upgrade-guide/v0.2.0-development/content-capture/guide.zh.md)。

maxContentProviders、maxContentPerInput、maxArtifactsPerCapture 限制已安装解析器与每条消息的数量；原有记录、报告及媒体容量同样适用，原件不缩放、不重编码。自定义 Host 提供者通过 registerContent 实现范围绑定输入转换、引用观察、输出捕获和等待清理完成的 close。移除解析器会先取消并等待其用例清理，再释放来源提供者；不安装真实 QQ 发送器，也不向来源 JSON 授予文件系统或 URL 访问。

<a id="current-use-and-scope"></a>
## 当前用法与范围

开发版目标为 DSH 0.2.2-rc.1，其公开 Host 要求 Node >=24.9.0；Node 22 仅作兼容性观测，使用独立 dsh-im-kit 0.2.1、dsh-media-kit 0.2.0 及宿主附件能力。默认关闭，须使用不含其他 IM 提供方的独立 profile。每个用例绑定虚拟参与者、会话和独立账号。dsh-qq-chat 等已安装消费插件提供真实聊天行为，实验室本身没有模型客户端或真实 QQ 发送器。

隔离 SDK 与 Web profile 通过正常 DSH 插件管理器安装压缩包，不导入生产 profile。安装 peer 依赖后，`npm run check` 构建并测试源码；构建会初始化发行目录，`npm pack --pack-destination artifacts` 生成整合脚本使用的包。Host 服务提供 `run`、后台 `start`、`wait`、`cancel`、`inspect`、`list`、`export` 及只含元数据的 `status`。没有消费者时明确失败。

在独立 profile 安装开发发行版，再把需要测试的消费插件装到同一 profile。默认 Web 模板提供原生附件，其他模板需显式提供该服务。实验室不会自动安装聊天、识图、搜索或生成插件。

```sh
dsh --profile qq-lab --from-default-profile web --dump-config
dsh plugin --profile qq-lab add ./artifacts/dsh-plugin-lab-0.3.0-development.tgz
dsh --profile qq-lab --no-open
```

<a id="native-owner-page"></a>
## 原生所有者页面

本 bundle 添加控制器与默认关闭的运行条目。在 DSH Web 中打开插件页，选择 dsh-plugin-lab，启用运行时并保存。所有运行容量及存储配置均可编辑。版本校验拒绝过期保存；活动用例或下载会阻止修改配置和重启。轮询或保存失败时保留草稿，运行时关闭后控制器仍可使用。

将用例粘贴到“用例 JSON”后开始新用例。完整原文刷盘后返回受理结果，页面关闭或刷新后继续执行。已保存报告可以选择、查看及显式取消。页面展示有上限的文字预览，并标明未展示的捕获或文字。“下载完整原始报告”通过原生所有者认证连接流式返回原始 JSONL，只接受运行 ID，不接受文件路径。运行时卸载会取消并等待其用例结束；控制器卸载会等待自己持有的用例和下载结束。

使用 `npm run test:native -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz> --media-archive <media.tgz> --job-archive <job.tgz>` 验证安装后的 SDK 整合；使用 `npm run test:web -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz> --media-archive <media.tgz> --job-archive <job.tgz> --browser-cache <playwright-browsers>` 验证全新无头 Web profile。真实 API 检查使用 `npm run test:real-api -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz> --credential-store <managed-credentials.yaml>`，只读已配置的 DeepSeek 官方凭据。这些测试不发 QQ 消息、不执行 B 站写入；实验室不对操作者安装的第三方代码提供沙箱。

DSH Host profile 必须先具备其公开声明的非可选 peer 依赖。隔离 SDK/Web 验收脚本使用固定版本 pnpm，并按已安装 DSH 包的声明补齐测试 profile 依赖；不会借用父目录依赖，也不会改动生产 profile。

<a id="scenario-example"></a>
## 用例示例

用例分开声明发件人别名、会话别名和处理阶段。`directed` 代表通道确认的明确指向机器人，`mentionActor` 指向另一个已声明发件人。输入不能选择真实账号或投送目标。将下面内容放入 `scenario` 字段并另带唯一 `runId`，或直接粘贴到所有者页面；模型和接话策略由选定的消费者提供。

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

是否回复由正式消费者判断。结果 `completed` 只表示已接纳阶段处理结束，不代表语义质量通过、模型成功或 QQ 投送验收。捕获结果保留结构化文字、艾特、引用 ID 与不透明媒体引用；`unresolvedMedia` 统计尚未提取最终字节的引用数量。

输入可用 `replyTo` 引用较早输入，或用 `replyToOutput: {"stage": 0, "index": 0}` 引用较早捕获的机器人输出，不能同时使用两者。阶段和输出索引从零开始，输出索引只选择该阶段同一会话中按持久捕获顺序排列的消息，不选择某个输入或其他会话。并发和未来引用在执行前拒绝；若指定早期输出不存在，保留来源并在发布依赖输入前失败。单个 `{format, content}` 卡片保留原始 JSON/XML，并与正文共享文字容量。空正文要求卡片、媒体或结构化内容；解析、搜索和网页访问由已安装消费者负责。

<a id="original-media"></a>
## 媒体原件

先在原生高级设置中启用 `mediaEnabled` 并保存，再提交新媒体。关闭它不会删除已保留原件或关闭其所有者下载，当前读取容量与格式限制仍然生效。通过“添加到消息”选择输入，在“添加原始文件”中选择文件；页面将完整 Base64 资产及引用加入目标消息，保留其他消息和原始正文。读取文件期间的新草稿优先，未完成的导入会拒绝而不覆盖修改。也可直接提交以下完整图片用例：

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

资产包含 `id`、`fileName`、完整规范的 `base64`，可用 `textMime` 声明纯文本/HTML/JSON，或显式设为 `unclassified: true` 保留未知二进制；不接受宿主路径或来源 URL。输入通过 `media` 中的 `{type, asset}` 引用资产，纯媒体输入可留空正文。保留来源并持久记录原生授权后才创建范围句柄，同会话重复资产复用导入，其他会话或用例使用独立句柄。未知编码可作为文件或显式未分类音频保留，不宣称可播放。

`maxMediaItemBytes`、`maxMediaBytes`、`maxMediaReferences`、`maxMediaOperations`、`maxMediaDimension`、`maxMediaPixels`、`mediaChunkBytes` 和 `allowedMediaMimeTypes` 均可配置。来源字节总和与去重存储原件分别受总量约束。Base64 大于原件，完整来源还独立受记录与报告容量限制；超限保留调用者草稿，绝不截断媒体。

所有者页面有界展示原件大小、MIME、尺寸与哈希。图片预览使用原始编码字节，音视频控件读取同一原件。下载前核对完整字节，HTML 等文件以附件返回。媒体读取与活动写入阻止冲突配置变更；报告保留原生授权，以后下载不重跑用例。可选内容提供者解析的转发保留完整文档与范围绑定的原件映射；未解析或不完整转发仍计入 `unresolvedMedia`，不透明引用不能伪装成已验证内容。

实验室自身不识图、转写、合成语音或生图，应安装读取 `ctx.imMedia` 并通过正常 IM 服务投送结果的消费插件。配置的模型与工具调用仍会真实执行，仅声明的本地消息/媒体出口被捕获。原件与报告下载共用原生连接的所有者鉴权。

<a id="storage-and-cancellation"></a>
## 存储与取消

默认报告目录为 profile 内的 `data/im-lab`。带标记的本地根目录和独占运行文件在首次发布消息前保留完整原始用例；追加记录刷盘后才确认本地捕获已接受。运行 ID 为 16–80 字符的小写安全文件名，可用 UUID。同一来源身份对应不同内容时报告冲突。已有未完成记录只供检查，不续跑、不修复。原始输入和输出不会为适应容量而截断；拒绝受理或存储失败均明确暴露。

并发运行数、阶段数、输入数、阶段内并发、文字大小、参与者、会话、记录与报告字节数、分页大小及运行时限均为经过校验的配置字段。容量不足时在受理前拒绝新请求，来源仍由调用方持有。取消一轮运行会终止并等待其消费者，其他轮次继续。运行时关闭会等待自己所有用例；最终 IM 关闭由调用方负责。活动写入期间不能导出；末尾不完整 JSONL 行原样保留，明确标记为未完成记录，导出不修复内容。

## 模型体验

本包不注册模型工具，不添加提示词，也不自行请求模型。它向已安装的 IM 消费者发布规范化合成消息。预设、模型调用、来源日志、接话策略和公开输出选择均由消费者负责。本地通道捕获消费者的完整结构化出站内容并返回本地收据，不代表 QQ 接受了消息。启用的消费者可以调用其配置的工具，本包不会将任意可信宿主代码置于沙箱中。

## 已知限制与待完成工作

<a id="known-limitations-and-deferred-work"></a>

- 本地测试覆盖原件媒体、三个并发的 15 人用例、所有者权限、取消、持久后台用例、原件下载及浏览器导入/预览/解码，实际安装的任务场景另验证只返回受理的生产者、产物引用和取消清理等待；不能证明自然对话、OCR 或身份准确率、合成质量或整套应用行为。
- 早期真实 DeepSeek 文字冒烟覆盖上下文回忆、算术和公开回复留存；本轮媒体使用受控本地模型与真实原生附件 API，没有新增上游模型调用。仓库 CI 检查 Windows/Linux 发行包与原生 profile，以及 Linux Web；桌面和真实 QQ 投送尚未验收。
- 未解析转发、QQ 最终编码和平台写入捕获仍需适配器。本包不隔离任意可信宿主代码，也不会静默阻断或捕获其直接外部写入。
- 所有者报告在本地未加密保留完整正文、来源字节和原生回执；即使非所有者拥有全局 Remote 权限，控制操作与下载也会拒绝。Chat 已披露的宿主核心热替换限制同样适用。
