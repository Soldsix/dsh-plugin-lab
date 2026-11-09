---
kind: upgrade-guide
description: "新实验室报告需要支持后台观察与第二代头部的读取器。"
---
# 升级后台产物捕获

## 变更

新报告使用日志 schema 2，记录选中与必须等待的后台观察器及阶段任务观察。读取器继续支持不可变的 schema 1 报告；不移动、重写或重放已有文件。目录标记仍为布局版本 1。旧实验室版本不能读取第二代报告。

手写完整 Config 对象新增 maxBackgroundProviders、maxBackgroundTasks、requiredBackgroundProviders。EngineStatus 新增 backgroundProviders，失败联合包含后台不可用、超限、失败和结果不确定。

## 迁移

1. 升级实验室 bundle 并重载客户端，原样保留旧报告和目录标记，无降级转换。
2. 通过 Config 解析设置或更新完整类型设置对象，安装被测异步任务服务的观察器，将其 ID 写入 requiredBackgroundProviders。缺少必须的观察器会在投递输入前令用例失败。
3. 更新类型状态与失败消费方。自定义后台提供方每用例仅报告每个任务一次，使用准确的虚拟会话，并在 close 中先取消和等待未结束工作，再允许本地捕获关闭。
4. 执行旧日志和后台阶段测试，确认旧报告逐字节保留，异步产物在后续阶段引用它之前已捕获。
