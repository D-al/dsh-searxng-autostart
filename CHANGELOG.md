# Changelog

所有迭代以本地时间记录（UTC+8）。

## [1.1.0] - 2026-11-17 22:00

### Added
- README 增补四段叙事（问题→途径→参考→解决程度）+ 停用/归档说明确认
- CHANGELOG 建立（本文件）

### 实测确认（2026-11-17）
- web_search 免费联网全程可用：全天检验会话实测使用（SearXNG 路径），AGENTS.md 搜索协议唯一联网通道
- provider 注册 + dispose 生命周期完整（ctx.effect 兜底注销，HMR/卸载安全）
- SearXNG 生命周期全自动（开 dsh 即有、退出即清、按命令行精确杀不误伤）

### 维护说明
- 本插件**持续使用中**（本地搜索主力）——与 dsh-ollama-autostart（已停用归档）不同
- 版本真相源：本 GitHub 仓库（pnpm update 从此拉取——本地 node_modules 的旧 94 行版已被 207 行完整版替代）

## [1.0.x] - 2026-10~11

### Added
- 基础版：SearxngSearchProvider 注册 + SearXNG 无窗口拉起 + 退出按命令行精确清理
- 多候选安装目录探测（SEARXNG_DIR/SEARXNG_DIRS 环境变量 + 5 个常见位置）
- 全 try/catch 包裹（任何失败静默，绝不拖垮 dsh 启动）
