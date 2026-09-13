<div align="center">

[English](README.md) | **简体中文**

<img src="public/brands/openlab.svg" alt="OpenLab" width="88" />

# OpenLab

### 开放实验室，一个工作台。

连接设备 · 管理物料 · 编排实验 · 追踪每一次执行

<p>
  <a href="https://xuwznln.github.io/OpenLabSite/"><img src="https://img.shields.io/badge/OpenLab-在线体验-087f5b?style=flat-square" alt="在线体验" /></a>
  <a href="https://github.com/Xuwznln/OpenLabSite/actions/workflows/deploy.yml"><img src="https://github.com/Xuwznln/OpenLabSite/actions/workflows/deploy.yml/badge.svg?branch=main" alt="构建与部署状态" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache--2.0-blue?style=flat-square" alt="Apache-2.0" /></a>
  <a href="https://github.com/Xuwznln/OpenLabSite/stargazers"><img src="https://img.shields.io/github/stars/Xuwznln/OpenLabSite?style=flat-square&logo=github" alt="GitHub Stars" /></a>
</p>

**[在线使用](https://xuwznln.github.io/OpenLabSite/)** · **[本地启动](docs/LOCAL_START.md)** · **[接口文档](docs/protocol/README.md)** · **[反馈问题](https://github.com/Xuwznln/OpenLabSite/issues)**

<br />

<a href="https://www.sjtu.edu.cn/"><img src="public/brands/sjtu.png" alt="上海交通大学校徽" height="68" /></a>
&nbsp;&nbsp;
<a href="https://thinklab.sjtu.edu.cn/"><img src="public/brands/rethinklab.png" alt="上海交通大学 ReThinkLab" height="76" /></a>
&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://www.bza.edu.cn/"><img src="public/brands/bza.png" alt="北京中关村学院" height="56" /></a>
&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://github.com/deepmodeling"><img src="public/brands/deepmodeling.png" alt="DeepModeling" height="64" /></a>

上海交通大学 **ReThinkLab** &nbsp; · &nbsp; **北京中关村学院** &nbsp; · &nbsp; **DeepModeling**

</div>

---

## 为实验室而建

OpenLab 是 [Uni-Lab-OS](https://github.com/deepmodeling/Uni-Lab-OS) 的本地优先操作前端。
从设备动作到工作流执行，把物料、运行状态、异常处理和执行记录放在同一个工作台里。

**前端独立部署，后端掌管数据。** 浏览器默认连接本机 `http://127.0.0.1:8002`，
不默认连接公共演示服务器，不直接读写数据库。

| | 能力 | 你可以做什么 |
| --- | --- | --- |
| 🧪 | 设备操作 | 查看设备与实时属性，填写动作参数，提交单点动作 |
| 📦 | 物料管理 | 入库、挂载、移动与跨设备转运，查看位点和库存 |
| 🧩 | 工作流编排 | 在画布中组织实验步骤，提交运行并跟踪节点进度 |
| 🗺️ | 实验室布局 | 浏览设备与物料空间关系，配置区域、围墙和装配 |
| 🔔 | 异常与干预 | 查看状态告警，按后端提供的选项处理动作异常 |
| 🔎 | 追溯与诊断 | 查询执行历史、实时日志、注册表与运行状态 |

> 当前发布的是**通用版**，不提供有机、生物、材料等学科切换。
> 旧版领域内容保留在旧仓库归档分支，见 [通用版边界](docs/GENERAL_EDITION.md)。

## 快速开始

### 直接使用

1. 按 [本地启动教程](docs/LOCAL_START.md) 启动 Uni-Lab-OS 后端。
2. 打开 **[OpenLabSite](https://xuwznln.github.io/OpenLabSite/)**。
3. 在右上角「连接设置」确认地址为 `http://127.0.0.1:8002`。

后端在另一台电脑时，手动填写它的可访问地址。
浏览器可能要求本地网络访问权限；如果 HTTPS 页面无法连接本地 HTTP 后端，可以使用下面的本地前端方式。

### 本地开发

需要 **Node.js 22+**、**pnpm 10.30.3** 和已经准备好环境的 Uni-Lab-OS 后端。

```bash
git clone https://github.com/Xuwznln/OpenLabSite.git
cd OpenLabSite
pnpm install --frozen-lockfile
pnpm run dev
```

打开终端提示的地址（默认 `http://localhost:5180`）。
**5180 是前端，8002 是后端管理 API**，不要填写 HostLink 通信端口。

后端的完整启动命令、默认分进程部署、设备加载与连接排查见 **[本地启动教程](docs/LOCAL_START.md)**。

<details>
<summary><strong>自定义地址与代理配置</strong></summary>

默认无需创建 `.env`。只有需要改变部署方式时，才配置以下选项：

| 配置 | 用途 |
| --- | --- |
| `VITE_DEFAULT_EDGE_URL` | 首次访问的默认后端地址 |
| `OPENLAB_EDGE_PROXY_TARGET` | 开发时由 Vite 将同源 `/api` 请求代理到指定后端 |
| `VITE_OPENLAB_DEVICE_INDEX_URL` | 自定义驱动包索引 |
| `VITE_OPENLAB_SITE_INDEX_URL` | 自定义前端站点目录 |

连接设置保存在浏览器本地；旧公共演示地址会一次性恢复为默认地址，其他自定义地址保留。
生产部署请限制 CORS 和网络访问，不要将未受保护的管理端口暴露到公网。更多配置见 [.env.example](.env.example)。

</details>

## 开发与架构

**Vue 3 · TypeScript · Pinia · Naive UI · Vue Flow · Vite**

前端通过独立的 `@openlab/protocol` 客户端访问后端。
HTTP 拉取业务正文，SSE 通知触发重新读取；调度、物料权威与执行状态仍由后端负责。

| 目录 | 职责 |
| --- | --- |
| `src/views/` | 设备、物料、工作流、监控等业务页面 |
| `src/components/` | 通用交互组件 |
| `src/stores/` | 连接与页面状态 |
| `src/features/` | 表单、布局、工作流等纯逻辑 |
| `packages/protocol/` | 类型化客户端、契约校验与协议测试 |
| `docs/protocol/` | 接口约定与各业务域规范 |

进一步阅读：[TypeScript SDK](packages/protocol/README.zh-CN.md) · [架构说明](docs/ARCHITECTURE.md) · [协议总览](docs/protocol/README.md) · [AI 改造指南](docs/VIBE_GUIDE.md)

### 验证

```bash
pnpm run protocol:check
pnpm run protocol:test
pnpm run app:test
pnpm run app:build
```

按顺序执行：协议检查会重新生成协议包构建产物，不应与其他测试同时运行。
涉及协议变更时，还需按 [协议文档](docs/protocol/README.md) 对真实后端运行 live smoke；
带 `--write` 的验证会写入数据，应使用独立测试环境。

### 发布

`main` 分支通过 GitHub Actions 校验、构建并发布到**本仓库的 GitHub Pages**。
PR 只执行验证，不发布站点；无需跨仓库部署密钥，也不提交生成的 `dist/`。

## 参与共建

欢迎提交 Issue、改进文档、优化交互或贡献代码。

- 开始前阅读 [AGENTS.md](AGENTS.md)，保持现有后端协议边界。
- UI 缺少接口能力时，先明确提出需求，不自行发明协议。
- 提交前通过上面的四项检查，不提交凭据、数据库或实验室数据。
- 感谢每一位 [贡献者](https://github.com/Xuwznln/OpenLabSite/graphs/contributors)。

项目代码采用 [Apache-2.0](LICENSE) 许可证。机构 Logo 的权利归各机构所有，
来源见 [标识说明](public/brands/README.md)；后端与设备驱动遵循各自许可证。

## Star History

如果 OpenLab 对你有帮助，欢迎点亮一颗 **Star**，也欢迎分享你的实验室使用场景。

<div align="center">
  <a href="https://www.star-history.com/#Xuwznln/OpenLabSite&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Xuwznln/OpenLabSite&amp;type=Date&amp;theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Xuwznln/OpenLabSite&amp;type=Date" />
      <img alt="OpenLabSite Star History" src="https://api.star-history.com/svg?repos=Xuwznln/OpenLabSite&amp;type=Date" width="760" />
    </picture>
  </a>
  <p><sub>图表由 Star History 提供；无星标记录时可能显示空图。若图片无法加载，可点击前往查看。</sub></p>
</div>
