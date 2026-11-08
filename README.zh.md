---
description: "通过 IM 消费者运行分阶段合成对话，并保留结构化本地输出。"
kind: "package-bundle"
---
# dsh-plugin-lab

[English](README.md) | 中文

## 概要

用合成身份运行分阶段对话，在计算前保留完整原始用例，并在本地捕获结构化出站消息。并发阶段、持久受理、取消与重复提交保护调用已安装的 DSH 消费者。原生所有者页面可配置运行时、追踪后台用例并下载原始报告。受控整合、全新浏览器场景及基础真实 API 文字测试已通过。本包仍是开发版，完整媒体、外部写入捕获和跨平台发行验证待完成。

## 目录

- [当前用法与范围](#current-use-and-scope)
- [原生所有者页面](#native-owner-page)
- [用例示例](#scenario-example)
- [存储与取消](#storage-and-cancellation)
- [模型体验](#model-experience)
- [已知限制与待完成工作](#known-limitations-and-deferred-work)

<a id="current-use-and-scope"></a>
## 当前用法与范围

本开发 bundle 需要 DSH 0.2.2-rc.1、Node ^22.19 或 >=24，以及独立共用库 dsh-im-kit 0.2.1，默认关闭。启用运行时需要没有其他 IM 提供方的独立 profile；已有提供方不会被替换。每轮运行将合成别名转换为独立账号、发件人与会话身份。实际聊天行为由 dsh-qq-chat 等已安装消费者提供；本包不实现模型客户端或真实 QQ 发送器。

隔离 SDK 与 Web profile 通过正常 DSH 插件管理器安装压缩包，不导入生产 profile。安装 peer 依赖后，`npm run check` 构建并测试源码；`npm pack --pack-destination artifacts` 生成整合脚本使用的包。Host 服务提供 `run`、后台 `start`、`wait`、`cancel`、`inspect`、`list`、`export` 及只含元数据的 `status`。没有消费者时明确失败。

<a id="native-owner-page"></a>
## 原生所有者页面

本 bundle 添加控制器与默认关闭的运行条目。在 DSH Web 中打开插件页，选择 dsh-plugin-lab，启用运行时并保存。所有运行容量及存储配置均可编辑。版本校验拒绝过期保存；活动用例或下载会阻止修改配置和重启。轮询或保存失败时保留草稿，运行时关闭后控制器仍可使用。

将用例粘贴到“用例 JSON”后开始新用例。完整原文刷盘后返回受理结果，页面关闭或刷新后继续执行。已保存报告可以选择、查看及显式取消。页面展示有上限的文字预览，并标明未展示的捕获或文字。“下载完整原始报告”通过原生所有者认证连接流式返回原始 JSONL，只接受运行 ID，不接受文件路径。运行时卸载会取消并等待其用例结束；控制器卸载会等待自己持有的用例和下载结束。

使用 `npm run test:native -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz>` 验证安装后的 SDK 整合；使用 `npm run test:web -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz> --browser-cache <playwright-browsers>` 验证全新无头 Web profile。真实 API 检查使用 `npm run test:real-api -- --im-kit-archive <library.tgz> --chat-archive <chat.tgz> --credential-store <managed-credentials.yaml>`，只读已配置的 DeepSeek 官方凭据。这些测试不发 QQ 消息、不执行 B 站写入；实验室不对操作者安装的第三方代码提供沙箱。

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

<a id="storage-and-cancellation"></a>
## 存储与取消

默认报告目录为 profile 内的 `data/im-lab`。带标记的本地根目录和独占运行文件在首次发布消息前保留完整原始用例；追加记录刷盘后才确认本地捕获已接受。运行 ID 为 16–80 字符的小写安全文件名，可用 UUID。同一来源身份对应不同内容时报告冲突。已有未完成记录只供检查，不续跑、不修复。原始输入和输出不会为适应容量而截断；拒绝受理或存储失败均明确暴露。

并发运行数、阶段数、输入数、阶段内并发、文字大小、参与者、会话、记录与报告字节数、分页大小及运行时限均为经过校验的配置字段。容量不足时在受理前拒绝新请求，来源仍由调用方持有。取消一轮运行会终止并等待其消费者，其他轮次继续。运行时关闭会等待自己所有用例；最终 IM 关闭由调用方负责。活动写入期间不能导出；末尾不完整 JSONL 行原样保留，明确标记为未完成记录，导出不修复内容。

## 模型体验

本包不注册模型工具，不添加提示词，也不自行请求模型。它向已安装的 IM 消费者发布规范化合成消息。预设、模型调用、来源日志、接话策略和公开输出选择均由消费者负责。本地通道捕获消费者的完整结构化出站内容并返回本地收据，不代表 QQ 接受了消息。启用的消费者可以调用其配置的工具，本包不会将任意可信宿主代码置于沙箱中。

## 已知限制与待完成工作

<a id="known-limitations-and-deferred-work"></a>

- 现有测试覆盖真实文件、受控消费者、15 名合成参与者、原生所有者权限、持久后台运行、原始报告下载及明暗窄屏 Web 布局，不能证明自然多人对话或整套应用行为。
- 基础真实 DeepSeek 文字轮次通过安装后的实验室验证上下文回忆、算术与公开回复留存，不属于对比智力或性能基准。Linux、桌面与完整媒体场景未验证，本开发源码还不是已封存的发行候选。
- 输入媒体、完整输出字节、QQ 最终编码、后台任务等待与外部写入捕获需要后续适配器，不能由一个附件 ID 推断这些能力已经存在。
- 报告以未加密原文保存在本地。所有控制操作与流式下载均要求 profile 所有者，即使非所有者拥有全局 Remote 权限也不能访问。请保护本地 profile 目录；Chat 包披露的宿主核心热替换限制同样适用于本整合。
