# 实验室内容报告第三代

本确认涵盖独立实验室的 JournalEvent 与来源类型声明，不更改 DSH SessionEventMap、SQLite schema 或原生附件格式，目录标记仍为布局版本 1。

已发布的第一、第二代头部保留旧来源解析器及明确的 LegacyScenario/LegacyScenarioInput 字段。原有 created、input、dispatch、capture、media-grant、background 记录继续可读，不迁移、重写、重放或回退。已提交的第一代样本保持不变，新增一个独立的、此前原生验收完成的第二代报告样本。

写入器改为 schema 3，增加 contentProviders 与 ScenarioInput.content。每个来源指定已安装解析器并提供有限 JSON。新的 content 事件先于关联 capture，保留消息、会话、消息段身份、提供者、格式版本、完整性、完整文档及原件句柄映射。原生媒体授权仍独立记录并核对范围，原件选择不接受路径。

读取校验拒绝旧头部下的新内容、未知提供者、重复消息段记录、来源 ID 歧义、外来原件授权映射、非转发消息段上的内容及伪造终态完整性。不完整转发仍保留未解析计数；没有 content 时原来源指纹不变，新来源 JSON 按对象键规范排序，同时保留数组顺序和实际原始文本。

验证由 test/forward.test.mjs、test/background-observer.test.mjs、test/journal.test.mjs 负责；原生 SDK/Web 还覆盖实际安装的可选解析器、所有者响应、原件与重载。升级操作见 docs/upgrade-guide/v0.2.0-development/content-capture/guide.zh.md。历史代际不移动、覆盖或删除，旧版本不能读取第三代报告。
