# 驱动包与受管设备进程

「管设备」在协议里拆成两层，都由带执行面的 Host 进程持有（`health.execution=ready`），
FastAPI 直出 DTO；`--role backend` 进程不挂载这两组路由（404），页面整页降级。

| 层 | 解决什么 | 域 | 路径前缀 | 客户端 |
| --- | --- | --- | --- | --- |
| 驱动包 | 设备驱动源码树怎么进到这台机器（下载到 unilabos_data）、依赖怎么预装、启动时怎么被扫描到 | `driver-packages` | `/api/v1/driver-packages` | `createDriverPackagesApi` |
| 设备进程 | 装好的驱动类怎么配成一台设备、跑在哪个进程、崩了谁拉起 | `device-processes` | `/api/v1/device-processes` | `createDeviceProcessesApi` |

后端实现：`unilabos/server/services/driver_packages.py`、`device_processes.py`，
路由 `unilabos/server/api/driver_packages.py`、`device_processes.py`。两份持久化文件都在
`BasicConfig.working_dir`（即 `unilabos_data/`）下。

## 1. 驱动包（driver-packages）

驱动包 = 含 `@device` / `@resource` 的 Python **源码树**，与 `unilab --devices <目录>` 是同一套机制，
**不经 pip 安装包体**：

- 来源：GitHub 仓库地址 `https://github.com/<owner>/<repo>[@ref]`（也接受 `git+https://….git`；
  不带 ref 时依次试 `main` / `master`）、zip / tar.gz 归档地址，或本机目录；
- 远端来源经 `codeload.github.com` 下载归档，校验 sha256 后解压到
  `<working_dir>/driver_packages/<name>/<version>/`（working_dir 即 `unilabos_data/`），同名旧版本目录被清掉；
  本机目录原地登记、不复制；
- 读源码树 `pyproject.toml`：`[project].name / version` 作为包名与版本，`[project].dependencies`
  去掉 `unilabos` 本体后用 `uv pip install --python <当前解释器>`（uv 不可用时回退 `python -m pip`，
  中文 locale 走清华源）预装——这是安装里唯一会写解释器的一步；
- 挂载目录 = 源码树里的顶层 Python 包（含 `__init__.py`；`src/` 布局同样识别；`[tool.setuptools.packages.find]
  include` 存在时按前缀过滤；`tests/ docs/ graph/` 等不算），其父目录进 `sys.path`——与 `--devices` 语义一致；
- AST 扫描包目录找出 `@device`，写入台账 `<working_dir>/driver_packages.json`。

**Host 启动时**把台账里已启用且目录存在的包目录并入 `--devices` 扫描目录，所以「安装 / 停用 / 卸载」
对 Host 本体都要重启才生效；受管设备进程（第 2 节）是子进程，挂载驱动包不需要重启 Host。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `` | 台账与运行态：`{python, working_dir, packages_root, ledger_path, scan_dirs, external_only, restart_required, packages[], operations[]}` |
| GET | `/catalog` | Edge 侧补充目录：`{sources[], packages[]}`（见 1.2） |
| POST | `/install` | `{spec, enable=true, upgrade=false, name=""}` → 202，返回 `running` 的 operation；来源非法（不是 GitHub / 归档地址 / 存在的目录）直接 422 |
| GET | `/operations` | 最近 30 条操作，新的在前 |
| GET | `/operations/{operation_id}` | 轮询单条操作（下载 / 依赖 / 扫描日志、结果、错误） |
| PUT | `/{name}/enabled` | `{enabled}`；只改台账，下次启动生效 |
| DELETE | `/{name}` | 删除 `unilabos_data` 里的源码树并移出台账（本机目录只移出台账，不删文件；已装依赖保留）→ 202，返回 operation |

`packages[]`（`DriverPackage`）除台账字段（`name` `spec` `version` `source_kind: github|archive|local`
`package_root` `package_dirs` `device_ids` `dependencies` `sha256` `enabled` `installer: uv|pip|""`
`installed_at_ms` `updated_at_ms`）外附三项运行态：

- `dirs_exist`：包目录还在（源码树被手工删掉会变成 false）；
- `mounted`：本次启动已把该包目录纳入扫描；
- `loaded_device_ids`：`device_ids` 中已进入当前进程注册表的部分。

页面的状态词：`!enabled` → 已停用；`!dirs_exist` → 目录缺失；`mounted` → 已加载；
否则「待重启生效」。

### 1.1 安装流程与安全重启

```text
POST /install ──202──▶ operation(running) ──轮询 GET /operations/{id}──▶ succeeded
                                                      │                   inventory.restart_required = true
                                                      └──▶ failed(error, log)

restart_required ──▶ POST /api/v1/restart {mode:"quiescent", scope:"process"}
                     （等在跑的任务收尾再重启；急用 mode:"immediate"）
                     GET /restart 看 active_jobs；DELETE /restart 取消
```

- operation：`{operation_id, kind: install|uninstall, spec, status: running|succeeded|failed,
  package_name, started_at_ms, finished_at_ms, log, error, result}`；`log` 是 `[download]` /
  `[extract]` / `[project]` / `$ uv pip install …` / `[scan]` 行，最多保留 20 KB。
- 包名以源码树 `pyproject [project].name` 为准；请求里的 `name`（索引条目自带）只在没有
  pyproject 时兜底，两者不同会在日志留 `[warn]`。依赖安装失败整个操作失败、不登记。
- `upgrade=true`：重新下载源码树覆盖同版本目录，并以 `--upgrade` 重装其依赖；目录里的
  「重装 / 升级」与台账里的「升级」都走这个开关。
- 重启用 `system.requestRestart({mode, scope: "process"})`——`scope=process` 是重新拉起整个
  Host 进程（同一套启动参数），只有它能让新装的驱动类进入注册表；`scope=devices` 只重建
  设备节点，对驱动包无效。

### 1.2 官方索引与补充目录

官方可安装目录放在独立仓库 **[awesome-lab-devices](https://github.com/Xuwznln/awesome-lab-devices)**
的 `index.json`，由**浏览器直接读取**（`features/device-index.ts`），不经过微后端：前端是
静态站，索引随前端一起演进，Edge 不需要出网也不需要配置。默认地址
`https://raw.githubusercontent.com/Xuwznln/awesome-lab-devices/main/index.json`，构建时用
`VITE_OPENLAB_DEVICE_INDEX_URL` 改默认，页面里可临时换成内网镜像（存 localStorage
`openlab:device-index-url`）。点「安装到 Edge」即 `install({spec, name})` 下发给连接中的
微后端。首批收录的是六个官方演示包（site / workstation / lan / inventory / lock / exception demo）。

微后端自己的 `GET /catalog` 是补充来源，两个 JSON 来源合并，结构与 index.json 相同：

```json
{
  "packages": [
    {
      "name": "unilabos-devices-prcxi",
      "spec": "https://github.com/UniLabOS/unilabos-devices-prcxi",
      "version": "0.3.x",
      "description": "PRCXI 移液工作站驱动",
      "homepage": "https://…",
      "devices": ["prcxi_9300"],
      "tags": ["liquid-handling"],
      "official": true
    }
  ]
}
```

| 来源 | 位置 | `official` 缺省 |
| --- | --- | --- |
| `remote` | `HTTPConfig.driver_package_index_url`（`local_config.py` 配置，为空则不请求，8 s 超时） | true |
| `local` | `<working_dir>/driver_package_catalog.json`（可选文件，实验室自维护） | false |

同名条目以 remote 为准；每条附 `source` 与 `installed`（台账里已有同名包）。`sources[]`
给出每个来源的 `ok / count / error / missing`，远端拿不到不影响本地条目。
`spec`（GitHub 仓库地址 / 归档地址）直接喂给 `POST /install`。前端把三个来源按「浏览器索引 → Edge 镜像 → Edge 本地」
合并（同名取先出现的），`installed` 统一按台账包名判定（大小写、`-`/`_` 不敏感）。

### 1.3 随包设备图与一键启动（示例包）

示例设备包（`LabDevice*Demo`）把演示图作为 setuptools data-files 装到
`share/<包>/graph/*.json`（LAN demo 是 `examples/`；源码 / editable 安装则留在仓库
`graph/`）。微后端安装后按 RECORD 枚举它们，前端因此不需要在索引里重复维护图：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/{name}/graphs` | `DriverPackageGraph[]`：`name`（文件名 stem）、`path`、`source: dist|source`、`device_only`、`devices[{id, class}]` |
| GET | `/{name}/graphs/{graph}` | 图的 node-link 载荷 |
| POST | `/{name}/graphs/{graph}/launch` | 以受管设备进程拉起 → `{created, process: DeviceProcess}`；进程名固定为 `<包>/<图>`，已存在则更新规格后重启（幂等） |

只有 `device_only` 的图能 launch（demo 图都是）；含物料节点的图 422，应作为 `unilab -g`
启动图加载。页面上的「启动」= `graphs(name)` 后对每张 `device_only` 图调 `launchGraph`
（host/slave 双进程 demo 有两张图，各成一条进程）。启动不需要重启 Host；包里的 `@workflow`
模板仍要等 Host 重启（`restart_required`）后才出现在工作流页。

## 2. 受管设备进程（device-processes）

一条受管进程 = 一份 slave 图（一个或多个设备节点）+ 要挂载的驱动包 + 重启策略。
Host 以

```text
python -m unilabos --backend hostlink --is_slave --skip_env_check --disable_browser --visual disable
       --host_node_ip <HostLink 绑定地址> --hostlink_port <端口> -g <working_dir>/device_processes/<id>/managed_<name>_<id8>.json
       [--devices <驱动包目录>]… [--external_devices_only] [extra_args…]
```

拉起子进程，子进程经 HostLink 接回本 Host，设备就像任何一台 Slave 上的设备一样出现在
`runtime.endpoints` / `hostlink.peers` / 物料权威里。驱动崩了只影响这个子进程，Host 本体、
物料权威、调度都不受影响。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `` | `{hostlink: {host, port}, processes: DeviceProcess[]}` |
| GET | `/device-classes` | 可配的设备类：注册表已加载的 + 台账里驱动包扫出的（`{id, source: registry|package, display_name, package}`） |
| POST | `` | 创建 → 201；正文见下 |
| GET / PUT / DELETE | `/{process_id}` | 读 / 改（运行中的改完要手动重启才生效）/ 删（先停进程）→ 204 |
| POST | `/{process_id}/start` `/stop` `/restart` | 409 = 已在运行 |
| GET | `/{process_id}/logs?tail=200` | `{path, lines[]}`，尾部最多 300 行，已剥 ANSI 着色 |

创建 / 更新正文（`DeviceProcessWriteInput`）：

```json
{
  "name": "Acme 泵站",
  "devices": [{ "id": "acme_pump_1", "class": "acme_pump_demo", "name": "1 号泵", "config": { "port": "COM3" } }],
  "package_names": ["acme-devices"],
  "devices_dirs": [],
  "external_only": true,
  "auto_start": true,
  "restart_policy": "on-failure",
  "max_restarts": 5,
  "extra_args": []
}
```

- `devices[]` 由服务端展开成 node-link 节点写进 `graph_nodes`；节点 `uuid` 是设备身份：
  物料权威里已有同 `id` 的设备就沿用其 uuid，否则新发号并固定在规格里（Graph Authority
  按 uuid 校验，换 uuid 会以 `identity_conflict` 拒绝启动图）。更新时保留原 uuid。
- `package_names` 按驱动包台账解析成 `--devices` 目录，不认识的名字 422；
  `external_only` 对应 `--external_devices_only`（只加载外部包，启动更快）。
- `restart_policy`：`never` / `on-failure`（非 0 退出才拉起）/ `always`；退避
  2/4/8/15/30 s，超过 `max_restarts` 次后状态停在 `crashed`，`last_error` 说明原因；
  手动 `stop` 不触发拉起。
- `auto_start=true` 的进程随 Host 启动一起拉起；Host 退出时会终止全部子进程。

`DeviceProcess` = 规格 + 运行态：`status: stopped|starting|running|crashed|restarting`、
`pid`、`started_at_ms` / `stopped_at_ms`、`last_exit_code`、`restart_count`、`last_error`、
`command`、`log_path`，以及派生的 `device_ids`、`graph_path`。页面按 5 s 轮询列表。

## 3. 端到端：装一个包 → 配一台设备 → 跑起来

1. 在索引里点「安装到 Edge」= `driverPackages.install({spec, name})`（微后端从 GitHub 下载归档，
   Edge 不需要 `git`），轮询 operation 到 `succeeded`；
   - 示例包装完直接点同一行的「启动」：`graphs(name)` → 每张纯设备图 `launchGraph(name, graph)`，
     demo 设备几秒后接回 Host，不用走下面 3–4 步；
2. 要让 **Host 本体**加载它：`system.requestRestart({mode:"quiescent", scope:"process"})`；
   只想让它跑在子进程里可以跳过这步；
3. `deviceProcesses.deviceClasses()` 里出现该包的设备类（`source=package`）；
4. `deviceProcesses.create({...})` → `start(id)`；几秒后 `runtime.endpoints` 与
   `hostlink.peers` 里出现新设备，`logs(id)` 能看到 `HostLink connected`；
5. 改驱动 / 改配置：`update` 后 `restart(id)`，只重启这个子进程。

## 4. 验证

```bash
pnpm run protocol:check                                      # 两个域都在 REQUIRED_DOMAINS，且全部 role=host
pnpm run protocol:test                                       # 客户端 ↔ 目录双向比对（含 install 缺省 enable/upgrade）
pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002   # 读路径：inventory / catalog / list / device-classes
```

前端：`src/features/device-index.test.ts`（索引解析、地址覆盖、三来源合并、installed 判定）。
后端：`tests/server/test_driver_packages.py`（台账、安装状态机、name 提示、目录合并、路由）、
`tests/server/test_device_processes.py`（命令拼装、uuid 沿用、崩溃看护、路由）。
索引仓库：`node scripts/validate.mjs` 校验 `index.json`（CI 同步跑）。
# 全量数据重置（system 域）

`GET /api/v1/reset` 返回 `supported / pending / confirmation_token / backup_path / detail`。
仅默认本机分离部署配置重置控制器，其它形态返回 `supported=false`。非默认库路径不支持。
`POST /api/v1/reset` 必须携带预览的 `confirmation_token` 和 `confirmation="清空全部数据"`。
确认无效、活跃作业、重启中、在线 Slave、驱动包操作未完成均拒绝（409）。
202 仅表示接受停机请求，不是清空成功：权威暂停派发、关闭管理服务及 Host，关闭 writer 后
归档权威和 Host 的四库及受管进程配置。驱动包源码/台账保留。备份 `manifest.json` 的
`state=completed` 和控制台「重置完成」才是完成凭据。之后手动不带旧 `-g` 启动 `unilab`。
途中失败保留 `reset-pending.json` 及已归档文件，下次启动拒绝恢复旧任务，需人工按清单恢复。
只支持已停止全部 Slave 的本机重置，不声称能远程擦除其它机器；外部设备重新接入会再次注册。
前端不能把断线当成功，live smoke 即使 `--write` 也只读预览，不触发破坏性重置。
