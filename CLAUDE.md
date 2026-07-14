# Daity - 桌面待办事项应用

## 项目概述

**Daity** 是一款基于 Electron 的桌面待办事项应用，核心特色是"每日任务"——每天自动重置为未完成状态，适合管理洗脸、跑步等重复性日常事务。

## 技术栈

- **框架**: Electron 33.x
- **前端**: 原生 HTML/CSS/JS（无框架）
- **存储**: 本地 JSON 文件（`Daily/tasks.json`、`Daily/settings.json`）
- **打包**: electron-builder 25.x
- **国际化**: 自建 i18n 模块（中/英文）

## 项目结构

```
Daity/
├── main.js                   # Electron 主进程（窗口、IPC、存储、定时重置）
├── preload.js                # 安全桥接（contextBridge → daityAPI）
├── package.json              # 依赖与打包配置
├── CLAUDE.md                 # 本文件
├── build-installer.ps1       # NSIS 安装包构建脚本（需管理员运行）
├── docs/                     # 变更日志
├── renderer/
│   ├── index.html            # 主界面布局（data-i18n 属性驱动多语言）
│   ├── style.css             # 样式（CSS 变量主题 + toast + 标签分组）
│   ├── app.js                # 渲染进程逻辑（防抖搜索、增量DOM、错误处理）
│   └── i18n.js               # 国际化翻译表（中/英文）
├── Daily/                    # 开发模式数据目录（运行时自动创建）
└── dist/
    └── win-unpacked/
        ├── Daity.exe         # 可执行文件（含完整 Electron 运行时）
        └── resources/
            └── app.asar      # 打包后的应用代码
```

## 核心功能

1. **任务 CRUD**：添加/编辑/删除/完成任务
2. **分类标签**：预设+自定义，支持侧边栏筛选
3. **截止日期**：日期选择器 + 临近/过期高亮 + Windows 系统通知
4. **每日任务（标签化）**：新建标签时可勾选"每日重置"，该标签下所有任务自动每日重置
   - 侧边栏分为「📅 每日标签」和「🏷️ 普通标签」两组
   - 📋 每日总览：紫色聚合筛选器，显示所有每日标签下的任务
   - 自定义重置时间：设置 → ⏰ 每日重置时间（默认凌晨 4:00）
   - 定时器驱动：到达重置时间自动重置，无需重启
   - `lastCompletedDate` 存 ISO 时间戳，精准区分重置前后完成的每日任务
5. **标签管理**：右键菜单操作标签
   - 📌 置顶/取消置顶：置顶标签在分组内优先显示
   - ✏️ 编辑：重命名标签 + 切换每日/普通状态（同步更新所有任务）
   - 🗑️ 删除：从侧边栏和所有任务中移除该标签
   - ⋮⋮ 拖拽排序：同组内可自由拖动，跨组拖动报错提示
6. **搜索**：标题关键词搜索（200ms 防抖）
7. **设置**：自定义存储路径 + 中/英文语言切换 + 每日重置时间
8. **语言**：设置 → 🌐 界面语言 → 中文/English

## 任务数据结构

```json
{
  "id": "唯一ID",
  "title": "任务标题",
  "completed": false,
  "type": "normal | daily",
  "tags": ["工作", "学习"],
  "deadline": "ISO 8601 或 null",
  "createdAt": "ISO 8601",
  "completedAt": "ISO 8601 或 null",
  "lastCompletedDate": "DateString 或 null"
}
```

## 设置数据结构 (settings.json)

```json
{
  "storagePath": "数据存储路径",
  "language": "zh-CN | en-US",
  "dailyTags": ["游戏", "晨间routine"],
  "resetHour": 4,
  "resetMinute": 0,
  "pinnedTags": ["游戏"],
  "tagOrder": ["游戏", "晨间routine", "学习笔记"]
}
```

- `dailyTags`：标记为"每日重置"的标签列表，任务若包含任一此类标签即视为每日任务
- `resetHour` / `resetMinute`：每日重置时间（默认 04:00），到达后每日任务自动重置为未完成
- `pinnedTags`：置顶标签名列表，置顶标签在各自分组内优先显示
- `tagOrder`：自定义标签显示顺序，拖拽排序时更新
- `type: "daily"` 保留用于向后兼容旧任务

## IPC API 一览

### 主进程 handler（preload.js 桥接到 window.daityAPI）

| 方法 | 参数 | 说明 |
|------|------|------|
| `getTasks()` | — | 获取全部任务 |
| `addTask(taskData)` | `{title, type, tags, deadline}` | 添加任务（自动判定 daily type） |
| `updateTask(id, updates)` | `id, {completed?, title?, tags?, ...}` | 更新任务（标签变更时自动同步 type） |
| `deleteTask(id)` | `id` | 删除任务 |
| `getSettings()` | — | 获取完整设置（合并默认值） |
| `saveSettings(settings)` | `{storagePath?, language?, dailyTags?, resetHour?, resetMinute?}` | 保存设置（重置时间变更自动重调度） |
| `getTags()` | — | 获取所有标签（从任务数据去重） |
| `getDailyTags()` | — | 获取每日标签列表 |
| `saveDailyTags(tags)` | `["标签1", ...]` | 保存每日标签列表 |
| `getResetTime()` | — | 返回 `{hour, minute}` |
| `saveResetTime(time)` | `{hour, minute}` | 保存并重调度定时器 |
| `onDailyReset(callback)` | `function` | 监听每日重置事件，返回取消监听函数 |
| `cleanupTag(tag)` | `string` | 从所有任务和 dailyTags 中移除标签 |
| `renameTag(oldName, newName)` | `oldName, newName` | 重命名标签（更新 tasks + dailyTags + pinnedTags + tagOrder） |
| `toggleTagDaily(tag, makeDaily)` | `tag, bool` | 切换标签每日状态（同步更新所有含此标签的任务 type） |
| `savePinnedTags(tags)` | `["标签1", ...]` | 保存置顶标签列表 |
| `saveTagOrder(order)` | `["标签1", ...]` | 保存标签显示顺序 |
| `checkDeadlines()` | — | 检查所有未完成任务截止日期并发系统通知 |

## 运行方式

```powershell
# 开发模式（项目根目录）
cd D:\1computer\claudeProject\Daity
npm start

# 直接运行打包版
.\dist\win-unpacked\Daity.exe
```

## 构建打包

### 解包版（推荐，无权限问题）
```powershell
cd D:\1computer\claudeProject\Daity
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
npx electron-builder --win --dir
```
输出：`dist\win-unpacked\Daity.exe`

### NSIS 安装包（需管理员权限）
以**管理员**打开 PowerShell，运行：
```powershell
cd D:\1computer\claudeProject\Daity
.\build-installer.ps1
```
> winCodeSign 工具含 macOS 符号链接，非管理员无法解压 → 导致打包失败。

## 已知问题与解决方案

### 1. GPU 加速崩溃（Windows）
**现象**：双击 .exe 无反应或 `GPU process exited unexpectedly`
**根因**：部分显卡驱动与 Electron GPU 加速不兼容
**解决**：`main.js` 中通过 `app.relaunch()` 自动添加 `--disable-gpu --disable-gpu-sandbox` 标志重启

### 2. 打包后存储路径
- **打包版**：数据存储在 `%APPDATA%/Daity/Daily/`（系统用户数据目录），避免 electron-builder 重建清空 dist 导致数据丢失
- **开发版**：数据存储在项目根目录 `Daily/` 文件夹
- **路径获取**：使用 `getDefaultStoragePath()` 函数，不要直接用 `__dirname`

### 3. --in-process-gpu 导致渲染进程崩溃
**现象**：Renderer process crashed，窗口显示空白/默认界面
**根因**：`--in-process-gpu` 标志将 GPU 合并到主进程，某些环境下导致不稳定
**解决**：已从 relaunch args 中移除该标志

### 4. winCodeSign 打包失败
**现象**：`Cannot create symbolic link` → 打包中断
**根因**：winCodeSign 7z 含 macOS 符号链接，Windows 非管理员无法创建
**解决**：以管理员运行 build-installer.ps1，或用 `--dir` 跳过 NSIS 步骤

### 5. 新建每日标签不显示在"每日标签"下（已修复）
**现象**：新建标签时勾选"每日重置"，但新标签不出现在侧边栏「📅 每日标签」分组中
**根因**：`app.js` 中标签创建守卫 `if (tagName && !allTags.includes(tagName))` — 若标签名已存在于 `allTags`（例如之前创建过普通标签、或某任务已使用该标签名），整个创建逻辑被静默跳过，标签不会加入 `dailyTags`，且用户无任何反馈
**解决 (2026-07-14)**：
  - 重构 `#btn-save-tag` 点击和 `#input-tag-name` Enter 两个处理程序，逻辑统一
  - 标签已存在 + 勾选"每日重置"但不在 `dailyTags` 中 → 自动转换为每日标签，显示成功 toast
  - 标签已存在（其他情况） → 显示"标签已存在"错误提示，不再静默关闭弹窗
  - Enter 键处理程序现在正确 `await` 保存操作，与按钮行为一致
  - 新增 i18n 翻译：`toastTagConvertedToDaily`、`toastTagAlreadyExists`（中/英）

### 6. 重复构建时 app.asar 被锁定（Windows）
**现象**：`remove app.asar: The process cannot access the file because it is being used by another process`
**根因**：系统进程（可能是杀毒软件、搜索索引器或文件管理器预览）持有 `app.asar` 的删除锁（FILE_SHARE_DELETE 权限不足），但覆盖写入不受影响
**临时解决**：重启电脑释放文件锁后再构建；或先用 `npx asar pack` 手动打包覆盖旧文件
**备注**：electron-builder 的 `EnsureEmptyDir` 步骤需要先删除再写入，与覆盖写入不兼容

## 关键设计决策

- **不用框架**：保持轻量，原生 JS 足够
- **JSON 存储**：用户可手动编辑/备份数据文件
- **contextIsolation: true**：遵循 Electron 安全最佳实践
- **IPC 通信**：所有数据操作通过 preload.js 桥接，渲染进程不直接访问 Node API
- **每日任务判定**：任务是否每日 = `type === 'daily'`（向后兼容）**或** 任务的任一标签在 `dailyTags` 列表中
- **每日任务重置**：定时器驱动（`setTimeout` 精确计算到下次重置时间），不再每次 get-tasks 都检查，性能更优
- **重置时间比较**：`lastCompletedDate` 存 ISO 时间戳，与 `lastResetBoundary` 做毫秒级比较，精准区分重置前后
- **标签管理**：右键菜单统一操作入口（置顶/编辑/删除），悬停仅显示拖拽手柄与删除按钮，标签名过长自动省略
- **标签列表渲染**：全量 `innerHTML = ''` 重建，避免 insertBefore 位置错乱；置顶优先排序
- **增量 DOM 更新**：toggle/编辑任务时只更新单个 `<li>` 元素，不复建整个列表
- **IPC 错误处理**：`safeCall()` 封装 + Toast 通知，避免静默失败
- **标签创建去重**：新建标签时若同名标签已存在，自动判断是否需要转换为每日标签；不再静默跳过，所有路径均有 Toast 反馈
- **存储路径安全**：打包版使用 `app.getPath('userData')`，避免 electron-builder 重建清空数据

## 修改项目时的注意事项

1. **修改任何源文件后**需要重新运行 `npx electron-builder --win --dir` 打包，运行 exe 才会看到变化
2. **重建打包前先杀进程**：`Get-Process Daity \| Stop-Process -Force`，否则文件被锁导致打包失败；如遇 `app.asar` 无法删除，需重启电脑释放系统级文件锁
3. **GPU 相关**：不要添加 `--in-process-gpu` 标志，会导致渲染进程崩溃；`--disable-gpu` 已通过 `app.relaunch()` 自动添加
4. **存储路径**：始终使用 `getDefaultStoragePath()` 函数，不要直接用 `__dirname`
5. **i18n**：新增 UI 文本需同时在 `i18n.js` 的 `zh-CN` 和 `en-US` 中添加翻译
6. **样式**：CSS 变量定义在 `:root` 中，支持一键换主题
7. **每日标签**：`dailyTags` 存在 settings.json 中，默认值为 `["每日任务"]`；新建标签时勾选"每日重置"即加入此列表
8. **标签创建**：两个处理程序（按钮点击 + Enter 键）必须保持逻辑一致；若标签名已存在不应静默跳过，需给用户 Toast 反馈
9. **数据安全**：打包版数据在 `%APPDATA%\Daity\Daily\`，不受重建影响；开发版数据在项目根 `Daily\`，不要提交到 git
