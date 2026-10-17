// index.mjs — dsh-searxng-autostart
//
// 给 DeepSeek Harness (dsh) 提供两件与「本地联网搜索」相关的事:
//   1) SearXNG WebSearchProvider(id: "searxng")
//      注册到 ctx.web, 让 dsh 内置的「网页搜索」(web_search)工具直接查本地 SearXNG
//      —— 免费、无需任何 API key。
//      (dsh 官方只内置 deepseek / exa / perplexity 三个 provider, 全要 API key;
//       本插件补上「本地自建 SearXNG」这一路。)
//   2) SearXNG 自动启动
//      随 dsh 启动, 在后台无窗口(不占任务栏)拉起本地 SearXNG; 退出 dsh 时按命令行
//      精确关掉自己拉起的那个(只杀 searx.webapp 的 python, 不误伤其他 python 进程)。
//
// 设计原则:
//   - 全程 try/catch, 任何失败都静默, 绝不拖垮 dsh 启动。
//   - 不 import 任何框架包(用户级插件的 node_modules 解析不到 @deepseek-ai/*),
//     只用 Node 全局 fetch / 子进程 API。
//   - 路径 / 地址尽量可配置(环境变量 + plugin config), 默认照顾常见本地布局。
import { spawn, execFile } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 调试日志: 默认写在插件目录旁; 可用 SEARXNG_DEBUG_LOG 覆盖。
const LOG = process.env.SEARXNG_DEBUG_LOG || path.join(__dirname, 'searxng-debug.log')
function dbg(msg) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + msg + '\n') } catch (e) { /* 忽略 */ }
}

// SearXNG 默认监听地址(本地)。可用 SEARXNG_BASE_URL 覆盖, 例如指向远程实例。
const DEFAULT_BASE = 'http://127.0.0.1:8888'
const PORT = 8888

// ───────────────────────── WebSearchProvider ─────────────────────────
// 契约见 @deepseek-ai/dsh-web: { id, available(), search(request, signal) }
//   request  = { query: string, maxResults?: number }
//   result   = { sources: [{ url, title?, snippet?, publishedAt? }], truncated: boolean }
// seam 会按 request.maxResults 自行截断 sources 并设置 truncated, 这里原样返回全部。
class SearxngSearchProvider {
  constructor(options) {
    this.baseURL = (options && options.baseURL) || DEFAULT_BASE
  }
  get id() { return 'searxng' }
  // 廉价本地判断, 不做网络调用(契约要求)。SearXNG 由本插件的 autostart 负责拉起。
  available() { return true }
  async search(request, signal) {
    const query = String((request && request.query) || '').trim()
    if (!query) throw new Error('搜索关键词为空')

    let url
    try {
      url = new URL('/search', this.baseURL)
      url.searchParams.set('q', query)
      url.searchParams.set('format', 'json')
    } catch (e) {
      throw new Error('SearXNG 地址无效: ' + this.baseURL)
    }

    let res
    try {
      res = await fetch(url.href, {
        headers: { 'user-agent': 'Mozilla/5.0 (dsh-searxng)', accept: 'application/json' },
        signal,
      })
    } catch (e) {
      throw new Error('SearXNG 连接失败(本地服务是否在运行? ' + this.baseURL + '): ' + (e && e.message))
    }
    if (!res.ok) {
      throw new Error('SearXNG 返回 HTTP ' + res.status + ' (需在 settings.yml 开启 format: json)')
    }

    let data
    try { data = await res.json() } catch (e) {
      throw new Error('SearXNG 响应无法解析为 JSON: ' + (e && e.message))
    }

    const results = Array.isArray(data && data.results) ? data.results : []
    const sources = []
    for (const r of results) {
      if (!r || !r.url) continue
      const src = { url: String(r.url) }
      if (r.title) src.title = String(r.title)
      if (r.content) src.snippet = String(r.content)
      if (r.publishedDate) src.publishedAt = String(r.publishedDate)
      sources.push(src)
    }
    return { sources, truncated: false }
  }
}

// ───────────────────────── 自动启动 SearXNG ─────────────────────────
// 探测 SearXNG 安装目录: 优先用环境变量, 否则在常见位置找 venv 里的 python。
// 优先 pythonw.exe(GUI 子系统, 天生无控制台窗口); 找不到则退回 python.exe
// (配合 CREATE_NO_WINDOW 启动标志, 同样不产生窗口)。
function findSearxng() {
  const home = os.homedir()
  const cands = []
  if (process.env.SEARXNG_DIR) cands.push(process.env.SEARXNG_DIR)
  if (process.env.SEARXNG_DIRS) {
    for (const d of process.env.SEARXNG_DIRS.split(/[;,:]/)) {
      const t = d.trim()
      if (t) cands.push(t)
    }
  }
  cands.push(
    'D:/SearXNG',
    'C:/SearXNG',
    path.join(home, 'SearXNG'),
    path.join(home, 'searxng'),
    path.join(home, 'Documents', 'SearXNG'),
  )
  for (const dir of cands) {
    try {
      const pyw = path.join(dir, 'venv', 'Scripts', 'pythonw.exe')
      if (fs.existsSync(pyw)) return { dir, python: pyw, noWindowFlag: false }
      const py = path.join(dir, 'venv', 'Scripts', 'python.exe')
      if (fs.existsSync(py)) return { dir, python: py, noWindowFlag: true }
    } catch (e) { /* 忽略 */ }
  }
  return null
}

function probe() {
  return new Promise((resolve) => {
    const sock = net.connect(PORT, '127.0.0.1')
    sock.on('connect', () => { sock.destroy(); resolve(true) })
    sock.on('error', () => { sock.destroy(); resolve(false) })
    sock.setTimeout(1500, () => { sock.destroy(); resolve(false) })
  })
}

// ───────────────────────── Cordis 插件 ─────────────────────────
export const name = 'searxng-autostart'
// 需要 ctx.web 才能注册 provider(web 是 base 层服务, 启动早期就有)。
export const inject = ['web']

export function apply(ctx, config) {
  dbg('apply called')
  const baseURL = process.env.SEARXNG_BASE_URL || (config && config.searxngBaseURL) || DEFAULT_BASE

  // (1) 注册 SearXNG 搜索 provider —— 让内置「网页搜索」走本地 SearXNG。
  try {
    const dispose = ctx.web.registerSearchProvider(new SearxngSearchProvider({ baseURL }))
    dbg('已注册 searxng WebSearchProvider, baseURL=' + baseURL)
    // 用 ctx.effect 兜底: 插件卸载/HMR 时注销 provider。
    ctx.effect(() => () => { try { dispose() } catch (e) { /* 忽略 */ } })
  } catch (e) {
    dbg('注册 provider 失败(可能已注册): ' + (e && e.message))
  }

  // (2) 自动拉起 SearXNG(保持原逻辑)。
  try {
    ctx.effect(() => {
      let child = null
      const boot = async () => {
        try {
          const up = await probe()
          dbg('probe(' + PORT + ') = ' + up)
          if (up) { dbg('SearXNG 已在运行, 跳过'); return }

          const found = findSearxng()
          if (!found) { dbg('未找到 SearXNG 安装目录'); return }
          dbg('SearXNG: dir=' + found.dir + ' python=' + found.python)

          // 无窗口启动(任务栏不出现图标, 避免误触关闭):
          //   - pythonw.exe 是 GUI 子系统, 根本不创建控制台(实测 MainWindowHandle=0);
          //   - stdio 必须重定向到真实日志文件 —— SearXNG(Flask)启动即写 stderr,
          //     若给空设备(stdio:'ignore')会立刻崩溃(这是历史上"启动后即退出"的根因);
          //   - windowsHide + detached 双保险; 走 python.exe 时额外加 CREATE_NO_WINDOW。
          const logPath = path.join(found.dir, 'searxng-run.log')
          const logFd = fs.openSync(logPath, 'a')
          const spawnOpts = {
            cwd: found.dir,
            detached: true,
            stdio: ['ignore', logFd, logFd],
            windowsHide: true,
          }
          if (found.noWindowFlag) spawnOpts.creationFlags = 0x08000000 // CREATE_NO_WINDOW
          child = spawn(found.python, ['-m', 'searx.webapp'], spawnOpts)
          fs.closeSync(logFd) // 句柄已被子进程继承, 父进程即可关闭
          dbg('无窗口启动(不进任务栏); 日志=' + logPath)
          child.on('error', (e) => dbg('spawn ERROR: ' + (e && e.message)))
          child.on('spawn', () => dbg('spawned OK pid=' + child.pid))
          child.unref()
          dbg('spawn issued pid=' + child.pid)
        } catch (e) { dbg('boot EXCEPTION: ' + (e && e.message)) }
      }
      boot()

      return () => {
        dbg('disposer called')
        try {
          // 按命令行匹配精确清理(只杀 searx.webapp 的 python, 不误伤其他 python 进程)
          const ps = 'Get-CimInstance Win32_Process | Where-Object { $_.Name -match "python" -and $_.CommandLine -match "searx.webapp" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
          execFile('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true }, () => {})
        } catch (e) { dbg('disposer EXCEPTION: ' + (e && e.message)) }
      }
    })
  } catch (e) { dbg('apply EXCEPTION: ' + (e && e.message)) }
}
