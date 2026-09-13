# 本地启动 OpenLabSite

OpenLabSite 是前端，Uni-Lab-OS 是后端。前端不包含设备驱动或数据库，需要连接已经启动的后端。
默认地址为 `http://127.0.0.1:8002`，指的是**浏览器所在电脑**；不会默认连接公共演示服务。

## 1. 启动后端

先按照 [Uni-Lab-OS 安装说明](https://github.com/deepmodeling/Uni-Lab-OS#readme)
准备兼容的 Python 环境和依赖，并进入 Uni-Lab-OS 源码目录。
已有环境的用户直接激活自己的环境即可，不必重新安装。下面使用 HostLink，不需要 ROS 2 通信运行时；
具体驱动仍可能需要额外依赖。

在后端项目根目录执行：

```bash
python -m unilabos.app.main --backend hostlink --port 8002 --config unilabos/config/example_config.py --disable_browser
```

该命令使用示例配置、不加载设备图。需要设备时，在前端「驱动包」中安装对应包并启动设备，
或启动时追加 `--graph <你的设备图.json>`。初次测试真实设备前，请确认驱动、接线与安全条件；
仅检查软件流程时可追加 `--test_mode`。

默认启动方式会分开运行后端调度进程和 Host 设备进程，浏览器只连接后端管理端口 **8002**。
无需为了分离进程额外指定 `--role backend`；该参数只启动后端、不启动本机设备执行进程。
前端重启默认只重启 Host，不重启调度权威进程。

用浏览器打开 `http://127.0.0.1:8002/api/v1/health`，确认能返回健康信息。
如果连接失败，先检查终端启动错误、环境依赖及端口是否被占用。

## 2. 使用前端（二选一）

### 直接打开在线站点

打开 [OpenLabSite](https://xuwznln.github.io/OpenLabSite/)，在右上角连接设置确认
`http://127.0.0.1:8002`。如果浏览器询问是否允许访问本地网络，请按实际需要允许。
如浏览器阻止 HTTPS 站点访问本机 HTTP 后端，使用下面的本地前端方式。

### 在本机运行前端

准备 Node.js 22+、pnpm 10.30.3 和 Git；首次安装 pnpm 可执行：

```bash
npm install --global pnpm@10.30.3
git clone https://github.com/Xuwznln/OpenLabSite.git
cd OpenLabSite
pnpm install --frozen-lockfile
pnpm run dev
```

保持后端和前端两个终端运行。打开终端显示的前端地址，默认是
`http://localhost:5180`；如果端口被占用，以终端实际输出为准。
前端默认直连 `http://127.0.0.1:8002`，无需创建 `.env` 或设置代理。

## 3. 连接与排查

- **5180 是前端，8002 是后端管理 API**。不要填写 HostLink 通信端口。
- 后端在另一台电脑时，在右上角填写可访问的 `http://<后端电脑地址>:8002`；
  `127.0.0.1` 不代表远程服务器。远程访问还需要正确的监听地址、防火墙与 CORS 配置。
- 网页可以打开但显示「后端未连接」：先确认健康接口可访问，再检查连接地址和浏览器权限。
- 旧公共演示地址会一次性恢复为本地默认；其他自定义地址保留。需要切回本机时使用连接设置的「恢复默认」。
- 没有设备不代表启动失败：空图启动后，需要安装驱动并启动设备。
- 重启使用默认的 Host 重启；无需请求调度权威进程的整进程重启。
- 不要把未受保护的后端管理端口直接暴露到公网。此教程不要求开放公网访问。

## 项目署名

上海交通大学 ReThinkLab · 北京中关村学院 · DeepModeling
