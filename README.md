# dsh-searxng-autostart

启动 DeepSeek Harness 时,**自动在后台(隐藏窗口)拉起本地 SearXNG**,让你的本地模型(qwen 等)具备**免费联网搜索**能力;退出 dsh 时一并关闭。不走任何付费渠道。

## 行为
- dsh 启动 → 探测 `127.0.0.1:8888`,没在跑就后台隐藏拉起 SearXNG;已在跑则跳过(不重复起)。
- 退出/禁用插件 → 关闭**本次拉起的那个** SearXNG(按 PID 精确杀,不会误伤其他 python 进程)。
- 全程 try/catch,任何失败都静默,绝不拖垮 dsh 启动。

## 前提
已装好 SearXNG(含 venv)。插件会自动探测这些位置(找 `venv\Scripts\python.exe`):
`D:\SearXNG`、`C:\SearXNG`、`%USERPROFILE%\SearXNG`、`%USERPROFILE%\searxng`、`%USERPROFILE%\Documents\SearXNG`。

## 安装
在 DeepSeek Harness 的插件管理里用 git 地址安装:
```
https://github.com/D-al/dsh-searxng-autostart.git
```
装好后重启 dsh。

## 让本地模型用起来
在会话里告诉模型一句:
> 需要联网查资料时,在终端运行 `search 关键词` 获取搜索结果。

模型会自己判断"该搜一下"→ 跑命令 → 读结果 → 回答。

## 国内网络注意
SearXNG 默认引擎(google/brave/wikipedia 等)在国内基本不可用。需启用国内引擎(bing/百度/搜狗/夸克/360),否则搜索结果为空。

## 调试
日志文件:`~/.dsh/profiles/desktop/searxng-debug.log`(记录 apply / 探测 / 启动过程,排错用)。
```
