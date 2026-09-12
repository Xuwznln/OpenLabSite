# OpenLabSite 三人迁移与提交草案

日期：2026-09-13。旧仓库：Xuwznln/OpenLab；目标：Xuwznln/OpenLabSite。

## 基线与边界

- 旧开发分支：feat/server-v1-database-browser，整理前 HEAD 为 70e5b82。
- 已 fetch origin 与 tags；仓库非 shallow，共 33 个可达历史提交（含部署分支）。
- 新仓库 main 为 9e7111f，仅包含 Apache-2.0 LICENSE。不得无意覆盖许可证。
- 本次旧仓库保存的是迁移快照，不是生产发布；不重写旧历史。
- 以下分配是模块维护和审阅建议，不是已经确认的历史作者归属。
- 当前 Git 身份为 Xuwznln <18435084+Xuwznln@users.noreply.github.com>。
- asimfish、Random8756（显示名 Nova）的提交姓名、关联邮箱及实际贡献范围待本人确认。

## 三人模块分工

| 人员（建议） | 职责 | 边界 |
| --- | --- | --- |
| Xuwznln | 平台、协议、设备运维、集成发布 | packages/protocol、connection/devices、驱动包、进程、重置、日志、系统诊断 |
| asimfish | 工作流和执行交互 | Editor/Workflows/WorkflowDetail/WorkflowTaskDetail/ErrorDecisions、workflow-*、task-jobs、动作结果 |
| Random8756 / Nova | 物料和领域界面 | Inventory/Assembly/LabMap、material-*、物料模板、领域工具与主题 |

公共 App/router/CI 由 Xuwznln 统一合入。协议生成文件不能按模块各生成一份；
ActionParamFields 归工作流负责人，物料输入需求由 Nova 协作。

## 全历史模块索引

以下覆盖原仓库 33 个可达提交；分类只用于定位，不能直接作为改名名单。

| 模块 | 原提交 |
| --- | --- |
| 初始全站（混合，不整条改署名） | 821feb1 |
| CI / 发布 | a5f6dcb、05facdb |
| 协议与数据基础 | 103bd3b、feb985a、dd5337e、438849f、dbeefa8、5ecbf85、4147e4f、36ca816、f10d081 |
| 画布 / 模板 / 工作流 | c596b28、7d4aa84、6e7b63b、2ae9fbc、a038d6d、4cba6f2、2fd07a1、2292c82 |
| 装配与遥测（混合） | 812d68c、6c0db30 |
| CIF / 领域工具 | 246f030、e14109f、b34c1cd |
| Agent Lab 界面 | 392ff3a |
| 连接与示例（混合） | 6878e8a |
| 跨模块集成（需按 diff 核对） | cab89d1、4b72045、c7b9d02、70e5b82 |
| 合并记录（保留拓扑） | 5fee541 |
| 机器人构建产物（不分配给人） | 2b3efd9 |

适合工作流负责人重点核对：c596b28、7d4aa84、2ae9fbc，以及当前编排/循环/执行改动。
适合物料负责人重点核对：246f030、e14109f、b34c1cd，以及装配、地图和库存相关 diff。
协议和初始全站提交包含多个业务域，不能为了平衡提交数整条归给某一个人。

## 当前增量的提交设计（待作者确认）

| 顺序 | 负责人建议 | 提交主题 |
| --- | --- | --- |
| A1 | Xuwznln | feat(protocol): align runtime, registry and material contracts |
| A2 | Xuwznln | feat(platform): centralize connection and notice refresh |
| A3 | Xuwznln | feat(devices): manage packages, processes and full reset |
| A4 | Xuwznln | feat(diagnostics): expose runtime logs and system controls |
| B1 | asimfish | feat(workflow): support groups, loops and nested editing |
| B2 | asimfish | feat(workflow): improve templates and submission validation |
| B3 | asimfish | feat(execution): add task controls and result presentation |
| B4 | asimfish | feat(decisions): improve manual confirmation and error handling |
| C1 | Random8756 | feat(materials): align inventory and template selection |
| C2 | Random8756 | feat(assembly): improve material sites and laboratory layout |
| C3 | Random8756 | feat(domains): organize themes, tools and site catalog |
| A5 | Xuwznln | chore(site): finalize navigation, licensing and release checks |

测试与对应功能放在同一提交。顺序是依赖建议；每批需再次核对跨文件依赖。
当前总快照只负责防丢，不能在导入该快照之后再次 cherry-pick 同一批拆分变更。

## 迁移方式

推荐保留旧历史作为基线，在隔离 clone/worktree 中整理未提交增量；原仓库保留快照。
两位成员从一致的基线领取按模块整理的补丁，审阅、测试后提交；不要各自复制完整最新代码。
pull 只获取已有提交；推送账户不会改变 commit 的 Author 字段。

新仓库已有 LICENSE 初始提交，优先在迁移分支合并两条历史并检查许可证，不强推 main。
最终合入使用普通 merge，避免 squash/rebase 改写希望保留的提交对象。

如果需要纠正历史作者，先完成如下映射并取得相关人确认：

| 原 SHA / diff 范围 | 实际作者与邮箱 | 共同作者 | 日期及依据 | 审阅确认 |
| --- | --- | --- | --- | --- |
| 待填写 | 待填写 | 待填写 | 原 commit / 开发记录 | 待填写 |

纠正应在隔离迁移分支执行，保留旧 SHA → 新 SHA 对照；改作者会改变该提交及其后代 SHA，
签名不能沿用。确需替换远端分支时，先备份该分支，核对准确远端 SHA，再用指定 expected SHA
的 --force-with-lease，而不是无条件 --force。

## 身份与时间

每人使用自己 GitHub 关联邮箱（或自己设置页面给出的 noreply 邮箱），不要根据用户名猜邮箱。
已有历史优先保留原始 AuthorDate 和 CommitDate；未提交文件没有可恢复的 Git 提交时间。
有可靠依据时指定真实 AuthorDate，CommitDate 保留本次整理时间；无依据则用当前时间，
提交说明记录开发区间。仅为平均贡献图而更改姓名或日期不能准确表达贡献。

本人配置（在本人 clone 内执行）：

```powershell
git config --local user.name "<本人确认的姓名>"
git config --local user.email "<本人 GitHub 关联邮箱>"
git switch -c feature/<模块>
# 应用交接补丁、审阅并测试后，仅暂存本批文件
git add <明确的文件列表>
git diff --cached
git commit -m "<提交主题>"
```

已有提交不要仅为改变推送账户而重新提交。共同作者用真实的 Co-authored-by 记录。

## 当前验收状态

2026-09-13 本次检查：app:test 186 项通过，app:build 通过。
protocol:check 未通过：OpenAPI 仍包含 GET /api/v1/device-processes/{}/logs，目录未覆盖。
protocol:test 53 项通过、1 项失败：transport.test.ts 仍断言旧日志请求 tail=50。
这是当前工作区原有日志迁移不一致；本次保存快照不擅自修订协议。
应在正式迁入主分支前同步确认后端路由、客户端、目录、快照、测试与文档。

迁移完成前四项必须通过：protocol:check、protocol:test、app:test、app:build。
另需核对最终源码树与快照的差异，每一处差异均应有解释。

新仓库的 Apache LICENSE 不会自动覆盖第三方代码授权；发布前还需核对来源，并处理
协议包现有 UNLICENSED 标记。旧 CI 的目标是 OpenLab-site（带连字符），不是新源码仓库
OpenLabSite；迁移后需明确部署目标与凭据，不能照搬并误触发发布。
