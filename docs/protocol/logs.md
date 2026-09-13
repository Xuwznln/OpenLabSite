# Host / Slave 实时日志

属于 `system` 诊断域，两个只读端点均为 Host 角色。默认分离部署由调度权威通过既有
`backend_http` 控制面代理给 Host，浏览器只连接同一个管理地址；不新增 SSE / WS 或监听端口。

| 方法与路径 | 客户端 | 响应 |
| --- | --- | --- |
| `GET /api/v1/hostlink/log-sources` | `system.logSources()` | `{sources: RuntimeLogSource[]}` |
| `GET /api/v1/hostlink/logs?source_id=…&cursor=…&limit=…` | `system.logs(sourceId, {cursor, limit})` | `RuntimeLogBatch` |

来源字段：`source_id`、`name`、`role: host|slave`、`machine_name`、`node_id`、`pid`（未知为 null）、
`device_ids`、`online`、`managed`、`supported`、`detail`。来源标识是目录给出的不透明字符串，
不能用文件路径或设备名代替。

- Host：当前进程 `configure_logger` 配置的主日志。
- 受管 Slave：台账内对应的 `process.log`，包括 stdout / stderr；进程停止后仍可读取。
- 外部 Slave：以 HostLink `node_id` 定位，经既有 TCP 连接调用 `process.log.read`，仅允许读取
  **远端当前进程主日志**（Python logging；手工启动时未接管的裸 stdout 不包含在内）。ROS2 Slave
  也复用其 HostLink 组网通道。日志读取/变更通知是当前 HostLink 协议的必备方法，不通过能力位兼容旧构建。

响应字段：`source_id`、`stream_id`、`cursor`、`lines: {offset, text}[]`、`has_more`、`reset`、
`truncated`、`path`、`pid`。`offset` 是单个日志文件的字节位置，不是时间，也不能跨文件比较。

- 首次省略 cursor：读取文件尾部；后续必须原样传回 cursor。游标由每个读者独立保存，读取不消费数据。
- 文件替换 / 重启切换文件 / 游标超出被截断文件：返回 `reset=true`，重建尾部窗口。
- limit 默认 300，上限 1000；每次扫描最多 256 KiB，每行最多 16 Ki 字符，超出显式标记 truncated。
  普通未完成行（包括未写完整的 UTF-8 字符）等下一次写入换行后返回。
- `has_more=true` 表示尚有积压，可继续增量读取；为保护执行线程，不使用无限追赶循环。
- 只读响应 `Cache-Control: no-store`。不存在的来源返回 404；离线、日志未创建或远端读取失败
  返回 503；非法游标 / 超出读取上限返回 422。

## 实时通知（复用 SSE）

`GET /api/v1/events` 新增 `runtime.logs.changed`，数据是
`{source_ids: string[], sources_changed: boolean, all_sources: boolean}`，不含日志正文。

- Slave 写完日志后，经 HostLink `process.log.changed {}` 通知 Host。Host 根据已登记连接决定来源，
  不接受 Slave 自报另一节点的身份。受管进程的 stdout / stderr 追加同样触发通知。
- Host 向调度权威使用既有 runtime.v1 控制 WS 的 `runtime_logs_changed`；单进程部署直接发 SSE。
  通知约 200 ms 合并一次，超过 256 个来源合并为 `all_sources=true`；瞬时通知不写四库，不挤占作业序号。
- SSE 通知**不写 id**，`Last-Event-ID` 仍只属于持久工作流事件。日志重连通过来源目录 + 各读者 HTTP cursor 校准。
- 页面首次打开读一次；随后只在选中来源变更、目录变更、手工刷新、恢复可见/暂停或重连时拉取。
  `slave:<node_id>` 通知也对应目录中同 node_id 的受管来源。没有新日志时无日志 HTTP 轮询。
- `has_more` 追赶有界防抖；读取失败有限速退避重试，不能退回旧接口。来源离线时保留已有窗口。
- 工作流与日志复用同一 SSE，SharedWorker 再跨标签页复用；暂停/隐藏某页不影响其他读者。

窗口最多保留 2000 行 / 512 Ki 字符。切换地址、来源、文件后不能混入旧响应。级别与关键词过滤在
有界窗口内执行，并保留匹配记录的 traceback。暂停、复制、下载均不改变设备运行或删除磁盘日志。

不保留开发期 `deviceProcesses.logs` 尾部快照端点及回退路径；接口缺失明确报错。
纯调度进程没有执行面时显示角色提示，不把部署角色差异当作旧版本兼容。

日志可能含设备参数、路径与异常内容；与管理 API 一样仅应暴露在可信网络或带访问控制的代理后。
此接口不暴露独立通信日志，不接受任意文件路径，不把日志写入四库。

只读验证：`pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002 --logs-only`。
