---
kind: upgrade-guide
description: "结构化实验室来源与捕获记录要求第三代报告读取器及更新的原生客户端校验。"
---
# 升级结构化内容捕获

## 变更

新报告使用 schema 3，保留所安装内容解析器的身份，并记录完整结构化输出及范围绑定原件映射。schema-1 与 schema-2 来源解析器保持原样；旧报告和目录标记不重写、不重放。旧版本不能读取第三代报告。

完整 Config 对象新增 maxContentProviders、maxContentPerInput、maxArtifactsPerCapture。EngineStatus 新增 contentProviders；所有者 inspect 结果新增 contents、omittedContents。错误联合新增 content-unavailable、content-invalid、content-limit。可选 forward 入口要求独立安装 dsh-qq-forward 0.1.0-development 服务。

## 迁移

1. 同时升级 bundle 并重载其原生客户端。保留全部旧报告、原件和原有标记；不提供降级转换。
2. 通过 Config 解析设置，或更新完整类型设置、状态和所有者响应对象。测试转发时明确选择可选 forward 解析器；该解析器默认停用。
3. 使用虚拟参与者、会话别名与内联来源资产。扩展来源选择已安装提供者，不授予真实 QQ 账号、任意文件或 URL 访问。自定义解析器必须实现 input、observe、capture 及等待清理完成的 close。
4. 运行旧报告、结构化捕获、原件字节、隔离和取消测试。确认旧报告字节未变，完整转发图正确消除未解析媒体计数，解析器关闭后仍能读取保留原件。
