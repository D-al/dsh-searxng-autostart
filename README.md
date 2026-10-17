# dsh-searxng-autostart

DeepSeek Harness（dsh）插件：让本地模型**免费联网搜索**，不依赖任何付费搜索 API key。

它做两件事：

1. **把内置「网页搜索」接到本地 SearXNG**
   注册一个 SearXNG 搜索提供方（provider，id：`searxng`）到 dsh 的 `web` 服务。
   之后模型调用内置的 `web_search` 工具时，直接查你本机运行的 SearXNG，免费、无需 API key。
   （dsh 官方只内置 `deepseek` / `exa` / `perplexity` 三个 provider，全都要 API key；本插件补上「本地自建 SearXNG」这一路。）
2. **随 dsh 自动拉起 SearXNG**
   dsh 启动时在后台**无窗口**（不占任务栏、避免误触关闭）拉起本地 SearXNG；退出 dsh 时按命令行精确关掉**自己拉起的那个**（只杀 `searx.webapp` 的 python，不误伤其他 python 进程）。

全程 `try/catch` 包裹，任何失败都静默，**绝不拖垮 dsh 启动**。

---

## 工作原理

```
dsh 启动
  ├─ 注册 SearxngSearchProvider(id="searxng") 到 ctx.web
  └─ 探测 127.0.0.1:8888
        ├─ 已在运行 → 跳过
        └─ 没在跑   → 自动拉起本地 SearXNG(最小化窗口)

模型调用「网页搜索」(web_search)
  └─ web 服务选择 searchProvider=searxng
        └─ SearxngSearchProvider.search() → GET http://127.0.0.1:8888/search?q=...&format=json
              └─ 映射为 { sources:[{url,title,snippet}], truncated } 返回给模型
```

---

## 前置条件

1. **已安装并初始化 SearXNG**（含 Python 虚拟环境 `venv`）。
   插件会自动探测以下位置（找 `venv\Scripts\python.exe`）：
   - 环境变量 `SEARXNG_DIR` / `SEARXNG_DIRS`（见下文「配置」）
   - `D:\SearXNG`、`C:\SearXNG`、`%USERPROFILE%\SearXNG`、`%USERPROFILE%\searxng`、`%USERPROFILE%\Documents\SearXNG`

2. **SearXNG 需开启 JSON 输出**。在 `searxng/settings.yml` 中：
   ```yaml
   search:
     formats:
       - html
       - json
   ```
   未开启时插件会报 `SearXNG 返回 HTTP 4xx (需在 settings.yml 开启 format=json)`。

3. **启用可用的搜索引擎**。SearXNG 默认引擎（google / brave / wikipedia 等）在国内基本不可用。
   请在 `settings.yml` 的 `engines` 里启用本地可达的引擎（如 bing / 百度 / 搜狗 / 夸克 / 360），否则搜索结果为空。

---

## 安装

在 DeepSeek Harness 的插件管理里用 git 地址安装：

```
https://github.com/D-al/dsh-searxng-autostart.git
```

装好后**完整退出并重启 dsh**（ESM 模块按 URL 缓存，HMR 不会重载新代码）。

> 手动安装也可：把本仓库克隆到 `~/.dsh/profiles/<profile>/node_modules/dsh-searxng-autostart/`，
> 并在该 profile 的 `package.json` 的 `dsh.profile.bundles` 里加上本插件 id，然后重启 dsh。

---

## ⚠️ 必做：把搜索提供方指向 `searxng`

**仅安装插件还不够。** dsh 的「网页搜索」默认走官方付费 provider（`deepseek`）。
你必须显式告诉 `web` 服务改用本插件的 `searxng`，否则模型一搜就报「没有 API key」。

二选一即可：

**方式 A — 改 profile 配置**（推荐，`~/.dsh/profiles/<profile>/cordis.patch.yml` 末尾追加）：

```yaml
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: searxng
```

**方式 B — 设环境变量**（适合不想改 profile 的情况）：

```bash
# Windows (PowerShell)
$env:DSH_WEB_SEARCH_PROVIDER = "searxng"
# 或写进系统环境变量，让 dsh 启动即生效
```

配置生效后重启 dsh。之后「网页搜索」即走本地 SearXNG。

---

## 配置（可选，环境变量）

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `SEARXNG_BASE_URL` | SearXNG 实例地址（provider 查询目标） | `http://127.0.0.1:8888` |
| `SEARXNG_DIR` | SearXNG 安装目录（自动启动探测，单目录） | 见「前置条件」候选列表 |
| `SEARXNG_DIRS` | 多个候选目录，用 `;`、`/` 或 `,` 分隔 | 同上 |
| `SEARXNG_DEBUG_LOG` | 调试日志路径 | 插件目录旁的 `searxng-debug.log` |

插件也支持通过 dsh plugin config 传入 `searxngBaseURL` / `searxngDir`（取决于你所在 dsh 版本是否向用户插件转发 config，环境变量方式更稳妥）。

---

## 让本地模型用起来

无需每次手动交代。建议在 `~/.dsh/AGENTS.md`（dsh 会在每次会话首次请求自动注入为常驻基线）写入：

```markdown
# 联网搜索（本地 SearXNG）
- 联网搜索 / 查最新信息 / 事实核实：使用内置「网页搜索」工具即可，它已接入本地 SearXNG。
- 不要使用「网页获取」(web_fetch)——本插件未提供 fetch provider。
```

模型会自行判断「该搜一下」→ 调「网页搜索」→ 读 SearXNG 结果 → 回答。

（若「网页搜索」偶发不可用，可在终端用 `python "你的SearXNG目录/search.py" "关键词"` 作为回退；
注意 PowerShell 下先设 `[Console]::OutputEncoding = [Text.Encoding]::UTF8` 避免中文乱码。）

---

## 调试

- 插件日志：`searxng-debug.log`（写在插件目录旁，记录 apply / 探测 / 启动过程）。
- SearXNG 运行日志：`SearXNG目录/searxng-run.log`（启动命令的重定向输出）。
- 手动验证 SearXNG 在线：浏览器打开 `http://127.0.0.1:8888/`，或
  `curl "http://127.0.0.1:8888/search?q=test&format=json"`。

常见问题：

| 现象 | 原因 / 解决 |
| --- | --- |
| 搜出来报「没有 DEEPSEEK_API_KEY」 | 没把 `searchProvider` 指向 `searxng`（见上文「必做」）。 |
| 搜索结果为空 | SearXNG 引擎不可用（国内网络），去 `settings.yml` 启用 bing/百度等。 |
| `HTTP 4xx (需开启 format=json)` | `settings.yml` 未开 `formats: [json]`，开启后重启 SearXNG。 |
| `SearXNG 连接失败` | 本地 SearXNG 没起来；检查自动启动日志与 `searxng-run.log`。 |
| 改了插件代码不生效 | ESM 按 URL 缓存，需**完整退出重启 dsh**。 |

---

## 许可

[MIT](./LICENSE)

---

## English

A DeepSeek Harness (dsh) plugin that gives your **local model free web search** via a self-hosted SearXNG — no paid API key required.

What it does:
1. Registers a SearXNG search provider (`id: searxng`) on dsh's `web` service, so the built-in `web_search` tool queries your local SearXNG instead of the paid official providers.
2. Auto-starts local SearXNG in the background (minimized window) when dsh launches, and stops only the instance it started on exit.

Requirements: a working SearXNG install with a `venv`, `format: json` enabled in `settings.yml`, and reachable engines.

**Important:** after installing, you must point dsh's web search to this provider — either add to your profile `cordis.patch.yml`:
```yaml
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: searxng
```
or set the env var `DSH_WEB_SEARCH_PROVIDER=searxng`. Then fully restart dsh.

Configurable via env vars: `SEARXNG_BASE_URL`, `SEARXNG_DIR`, `SEARXNG_DIRS`, `SEARXNG_DEBUG_LOG`.

Licensed under MIT.
