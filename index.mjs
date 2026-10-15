// index.mjs — dsh-searxng-autostart
// 启动 DeepSeek Harness 时自动在后台(隐藏窗口)拉起本地 SearXNG, 让本地模型能免费联网搜索;
// 退出 dsh 时关闭自己拉起的那个(按 PID 精确杀, 不误伤其他 python 进程)。
// 全程 try/catch: 任何失败都静默, 绝不拖垮 dsh 启动。
// 注意: Cordis 下访问 ctx.config 需先声明 inject, 本插件不需要读配置(自动探测), 故不使用 ctx.config。
import { spawn, execFile } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LOG = 'C:/Users/Ad/.dsh/profiles/desktop/searxng-debug.log'
function dbg(msg) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + msg + '\n') } catch (e) { /* 忽略 */ }
}

const PORT = 8888
let booted = false

// 自动探测 SearXNG 安装目录(找 venv 里的 python)
function findSearxng() {
  const home = os.homedir()
  const cands = [
    'D:/SearXNG',
    'C:/SearXNG',
    path.join(home, 'SearXNG'),
    path.join(home, 'searxng'),
    path.join(home, 'Documents', 'SearXNG'),
  ]
  for (const dir of cands) {
    // 用 python.exe(pythonw 无控制台, SearXNG 写 stderr 会崩, 不可用)
    const py = path.join(dir, 'venv', 'Scripts', 'python.exe')
    try {
      if (fs.existsSync(py)) return { dir, python: py }
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

export function apply(ctx) {
  dbg('apply called')
  try {
    ctx.effect(() => {
      let child = null
      const boot = async () => {
        if (booted) { dbg('boot skipped (already booted)'); return }
        booted = true
        dbg('boot start')
        try {
          const up = await probe()
          dbg('probe(' + PORT + ') = ' + up)
          if (up) { dbg('SearXNG 已在运行, 跳过'); return }

          const found = findSearxng()
          if (!found) { dbg('未找到 SearXNG 安装目录'); return }
          dbg('SearXNG: dir=' + found.dir + ' python=' + found.python)

          // 用 start /min 最小化启动: windowsHide 在 dsh 内无效(Windows Terminal 会接管控制台程序),
          // 改为最小化 —— 窗口只出现在任务栏, 不再遮挡 dsh; python 拿到的是真实控制台(有有效 stderr, 不会崩)。
          // 日志同时追加到 searxng-run.log 便于排查。
          const logPath = path.join(found.dir, 'searxng-run.log')
          child = spawn('cmd.exe', ['/c', 'start', '""', '/min', found.python, '-m', 'searx.webapp', '>>', logPath, '2>&1'], {
            cwd: found.dir,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          })
          dbg('start /min 启动; 日志=' + logPath)
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
          // wscript 启动后即退出, 拿不到 SearXNG 的 pid, 改为按命令行匹配精确清理
          // (只杀 searx.webapp 的 python, 不误伤其他 python 进程)
          const ps = 'Get-CimInstance Win32_Process | Where-Object { $_.Name -match "python" -and $_.CommandLine -match "searx.webapp" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
          execFile('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true }, () => {})
        } catch (e) { dbg('disposer EXCEPTION: ' + (e && e.message)) }
      }
    })
  } catch (e) { dbg('apply EXCEPTION: ' + (e && e.message)) }
}
