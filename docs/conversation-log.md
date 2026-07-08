# Daity 项目完整开发对话记录

> 日期：2026年6月21日  
> 从零开始构建 Daity 桌面待办事项应用

---

## 第一轮：需求确认

**用户要求**：
- 桌面待办事项应用，命名为 Daity
- 添加/删除/完成任务
- 分类标签 + 截止日期提醒
- **每日任务功能**：每天自动重置为未完成（无论昨天是否完成）
- 本地存储，应用内设置可自定义存储路径
- 默认存储位置：当前目录下的 Daily 文件夹
- 每日任务要有专属 UI 标识

**确认的技术方案**：
- 框架：Electron（用户选择）
- 前端：原生 HTML/CSS/JS
- 存储：本地 JSON 文件
- 提醒：界面高亮 + 系统通知（两者都要）
- 国际化：中/英文语言切换

---

## 第二轮：项目初始化与核心开发

### 环境检查
- Node.js v20.19.2 ✅
- npm 10.8.2 ✅

### 项目结构
```
Daity/
├── main.js           # Electron 主进程
├── preload.js        # 安全桥接
├── package.json      # 项目配置
├── renderer/
│   ├── index.html    # 主界面
│   ├── style.css     # 样式
│   ├── app.js        # 交互逻辑
│   └── i18n.js       # 国际化
└── Daily/            # 默认数据存储
```

### 实现的功能（第1-7步）
1. ✅ 项目初始化（npm init, 安装 Electron）
2. ✅ 数据层（IPC 通道 + JSON 读写 + 每日任务重置 + 截止日期通知）
3. ✅ 界面构建（完整 HTML/CSS/JS，搜索、筛选、任务列表）
4. ✅ 每日任务（🔄 图标 + [每日] 彩色徽章 + 自动重置逻辑）
5. ✅ 标签筛选（侧边栏 + 预设标签 + 自定义标签）
6. ✅ 截止日期提醒（日期选择器 + 临近/过期高亮 + Windows 通知）
7. ✅ 设置面板（自定义存储路径 + 数据迁移）

---

## 第三轮：GPU 崩溃问题

### 问题 1：双击 .exe 无反应

**现象**：双击 `Daity.exe` 没有任何反应

**排查过程**：
1. 从命令行运行发现错误：`GPU process exited unexpectedly`
2. 发现 `app.disableHardwareAcceleration()` 代码级 API 在 GPU 进程初始化前来不及生效
3. 只有命令行 `--disable-gpu` 标志能解决问题

**解决方案**：
- 实现自重启机制：检测缺少 `--disable-gpu` 标志时，用 `app.relaunch()` 自动重启
- 初始版本用了 `spawn()` + `detached: true`，后来改为更可靠的 `app.relaunch()`

### 问题 2：打包后窗口不显示

**现象**：进程在后台运行，但窗口不出现

**排查过程**：
- `spawn()` + `detached: true` 导致 GUI 窗口被抑制
- 改为 `app.relaunch()` 后窗口正常显示

### 问题 3：ENOTDIR 错误

**现象**：打包后启动报 `ENOTDIR, not a directory`

**根因**：打包版 `__dirname` 指向虚拟 `app.asar` 文件路径，无法在其中创建文件夹

**解决方案**：
```javascript
function getDefaultStoragePath() {
  if (app.isPackaged) {
    return path.join(path.dirname(app.getPath('exe')), 'Daily');
  }
  return path.join(__dirname, 'Daily');
}
```

### 问题 4：渲染进程崩溃（最关键）

**现象**：双击 .exe 后显示 Electron 默认界面（File/View 菜单），内容空白

**排查过程**：
- 添加 `--enable-logging` 启动 → 看到 `Renderer process crashed`
- 逐标志排查 → 发现 `--in-process-gpu` 是罪魁祸首

**最终可用的 GPU 修复标志**：
```
--disable-gpu --disable-gpu-sandbox
```
**不要用的标志**：~~`--in-process-gpu`~~（导致渲染进程崩溃）

**额外修复**：
- `autoHideMenuBar: true` + `setMenuBarVisibility(false)` → 隐藏默认菜单
- `sandbox: false` → 兼容性更好

---

## 第四轮：打包 NSIS 安装包

### winCodeSign 符号链接问题

**现象**：`npx electron-builder --win` 失败，报 `Cannot create symbolic link`

**根因**：winCodeSign 工具 7z 压缩包内含 macOS `.dylib` 符号链接，Windows 非管理员无法创建

**尝试过的方案**：
1. ❌ 国内镜像源 → 下载成功但解压仍失败
2. ❌ 手动解压 → 自动模式权限不足被拦截
3. ❌ 7za 包装脚本 → `execFile` 无法处理 `.cmd` 文件
4. ❌ `USE_SYSTEM_7ZA` → NSIS 步骤仍需要原始 7za.exe
5. ✅ **最终方案**：`--dir` 跳过 NSIS，生成解包版 .exe

**管理员打包脚本**（`build-installer.ps1`）：
```powershell
# 以管理员运行 PowerShell 后执行
cd D:\1computer\claudeProject\Daity
.\build-installer.ps1
```

---

## 第五轮：国际化优化

### 用户需求
设置面板中的语言选项，可选择中文/英文，切换所有界面文本

### 修复的问题

| 问题 | 修复 |
|------|------|
| 状态栏文字切换后不更新 | `updateStatusBar()` 改用 `i18n.t(key, {count: N})` |
| `<select>` 选项不随语言切换 | `i18n.apply()` 加入 `<option>` 元素处理 |
| 只改语言不改路径时保存失败 | 独立保存 `language` 字段 |
| 英文模式时间仍显示中文 | `formatDate()` 根据 `currentLang` 切换 locale |

### 翻译覆盖范围
- 顶部栏、侧边栏、工具栏
- 任务列表（空状态、徽章、截止日期格式）
- 所有弹窗（添加/编辑/删除/设置/新建标签）
- 状态栏
- 中英文翻译表共计约 90 个词条

---

## 最终可交付成果

### 可运行文件
```
dist\win-unpacked\Daity.exe    # 双击运行（180MB）
```

### 开发命令
```powershell
cd D:\1computer\claudeProject\Daity
npm start                       # 开发模式
npx electron-builder --win --dir # 打包解包版
```

### 项目文档
- `CLAUDE.md` — 项目完整文档（技术栈、结构、功能、已知问题）
- `docs/conversation-log.md` — 本文件（完整对话记录）

---

## 关键技术知识积累

### Electron 打包注意事项
1. `__dirname` 打包后指向 asar 虚拟路径 → 用 `app.getPath('exe')` 定位
2. 代码级 `disableHardwareAcceleration()` 可能不生效 → 需要命令行标志
3. `app.relaunch()` 是重启应用的正确方式
4. `autoHideMenuBar` + `setMenuBarVisibility(false)` 隐藏默认菜单
5. 国内使用 Electron 需配置镜像源（npmmirror）

### 每日任务实现
- 在 `get-tasks` IPC handler 中执行重置检查
- `lastCompletedDate` 字段记录完成日期
- 与今日日期比较 → 不一致则重置 `completed: false`

### 国际化模式
- `data-i18n` 属性标记需要翻译的元素
- `data-i18n-attr` 指定翻译应用到哪个属性（placeholder/title/skip）
- `i18n.apply()` 遍历所有 `[data-i18n]` 元素批量更新
- 动态内容（如状态栏计数）用 `i18n.t(key, {count: N})` 带参翻译

---

## 待办事项（未来可优化）

- [ ] 制作应用图标（ico/png）
- [ ] NSIS 安装包（管理员权限构建）
- [ ] 数据备份/恢复功能
- [ ] 任务优先级/排序
- [ ] 导出为 CSV/Markdown
- [ ] 主题切换（暗色模式）
- [ ] 开机自启动
- [ ] 任务重复周期（每周/每月）

---

---

## 第六轮：每日任务标签化 + 全面优化

> 日期：2026年6月22日  
> 共涉及 8 个文件变更

### 用户需求

1. **标签级每日重置**：新建标签时可勾选"每日重置"，该标签下所有任务自动每日重置
2. **与现有每日任务统一分类**：每日标签在侧边栏与「🔄 每日任务」同组显示
3. **自定义重置时间**：设置中可设重置时间，默认凌晨 4:00
4. **全面修复已知问题**：CLAUDE.md 记录的所有 bug

### 核心架构变更

**数据模型**：
- `settings.json` 新增 `dailyTags`（标签列表）、`resetHour`、`resetMinute` 字段
- 任务判定：`isDailyTask(task)` = `type === 'daily'`（向后兼容）**或** 标签含 dailyTags

**重置机制重写**：
- 旧：每次 `get-tasks` 都检查 `lastCompletedDate !== today`（全量读盘+写盘）
- 新：启动时重置一次 + `setTimeout` 精确定时到下一个重置时间 + 递归调度

**存储路径安全**：
- 旧：`path.dirname(app.getPath('exe'))` → `dist\win-unpacked\Daily\`
- 新：`app.getPath('userData')` → `%APPDATA%\Daity\Daily\`
- 原因：electron-builder `--dir` 重建会清空 dist 目录

### 修复的 10 个问题

| # | 问题 | 修复 |
|---|------|------|
| 1 | `--in-process-gpu` 在 start 脚本中 | 从 `package.json` 移除 |
| 2 | 每次 get-tasks 都执行重置 | 定时器驱动，get-tasks 直接返回 |
| 3 | 每次操作后全量 innerHTML 重建 | `refreshSingleTask(id)` 增量更新 |
| 4 | IPC 调用无 try/catch | `safeCall()` 封装 + toast 提示 |
| 5 | escapeHtml 每次 createElement | 纯字符串 replace |
| 6 | 搜索无防抖 | 200ms debounce |
| 7 | alert() 报错体验差 | `showToast()` 优雅通知 |
| 8 | CSP `unsafe-inline` | 桌面应用风险低，暂不改动 |
| 9 | 打包包含完整 node_modules | 保持现状，electron-builder 自动处理 |
| 10 | CSS 变量可支持暗色主题 | 架构已就绪，待后续实现 |

### 新增 IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `get-daily-tags` | renderer → main | 获取每日标签列表 |
| `save-daily-tags` | renderer → main | 保存每日标签列表 |
| `get-reset-time` | renderer → main | 获取重置时间 |
| `save-reset-time` | renderer → main | 保存并重调度定时器 |
| `daily-reset` | main → renderer | 每日重置事件推送 |

### 新增 UI 组件

- **设置面板**：重置时间选择器（小时:分钟，min/max 验证）
- **新建标签弹窗**：每日重置复选框
- **侧边栏**：每日标签 / 普通标签分组分隔线
- **Toast 容器**：顶部居中，3 秒渐隐

### 遇到的问题

- **打包时文件被锁**：之前启动的 Daity 进程未退出，`d3dcompiler_47.dll` 被占用 → `Get-Process Daity | Stop-Process -Force`
- **renderTagList 插入顺序反转**：`insertBefore` 以同一锚点多次插入导致自定义标签逆序 → 改用 `appendChild` + reverse 迭代
- **用户数据丢失**：重建打包清空了 dist 目录 → 改为 `app.getPath('userData')`
- **Edit 工具匹配失败**：代码注释不匹配导致字符串替换失败 → 重新读取精确匹配

### 生成的新文档

- `CLAUDE.md` — 大幅更新（IPC API 一览、设置数据结构、关键决策更新、注意事项补充）
- `docs/changelog.md` — v1.0.0 + v1.1.0 完整变更日志
- `docs/conversation-log.md` — 本文件追加

---

---

## 第七轮：Bug 修复 + 标签管理增强

> 日期：2026年6月22日（同日下午）

### Bug：标签筛选闪烁 + 任务创建冗余

**现象**：
1. 新建每日标签"游戏"后，点击"每日任务"筛选，"游戏"消失再出现
2. 在"游戏"中创建任务出现在"每日任务"而非"游戏"
3. 任务类型单选在每日标签下仍需要手动选择，冗余

**根因**：
- `renderTagList()` 用 `insertBefore` 在多个锚点间移动元素，锚点随 DOM 变化导致位置错乱
- `openAddModal()` 不感知侧边栏当前筛选状态，不预选标签

**修复**：
- 重写 `renderTagList()` 为全量 `innerHTML = ''` 动态重建，消除 insertBefore 依赖
- `openAddModal()` 根据 `currentFilter` 预选标签
- 新增 `updateTaskTypeRadio()`：选中标签含每日标签 → 自动切到每日类型

### 功能：删除标签

- 悬停自定义标签 → × 按钮 → 确认删除
- 主进程 `cleanup-tag` IPC：从所有任务中移除标签 + 从 dailyTags 移除
- 预置标签和系统标签不可删除

---

## 第八轮：标签管理三大功能

> 日期：2026年6月22日

### 功能 1：置顶

- `pinnedTags` 存 settings.json
- 置顶标签在分组内优先显示，带浅色背景
- 通过右键菜单操作

### 功能 2：编辑标签属性

- 重命名：更新所有任务 + dailyTags + pinnedTags + tagOrder
- 切换每日/普通：同步更新所有含此标签的任务 type
  - 每日→普通：type → normal（若无其他每日标签）
  - 普通→每日：type → daily
  - 标签自动移到对应分组

### 功能 3：拖拽排序

- HTML5 Drag and Drop API
- `⋮⋮` 拖拽手柄，仅在悬停时显示
- 同组内自由拖动（蓝色插入线）
- 跨组拖动 → 红色禁止线 + toast 报错
- `tagOrder` 保存到 settings.json

### 新增 IPC

| 通道 | 说明 |
|------|------|
| `rename-tag` | 重命名标签 |
| `toggle-tag-daily` | 切换每日状态 |
| `save-pinned-tags` | 保存置顶列表 |
| `save-tag-order` | 保存排序 |

---

## 第九轮：UX 优化

### 重命名"每日任务"为"每日总览"

- 紫色条目实为每日标签下的任务聚合视图 → 更名 "📋 每日总览"
- 中/英双语同步更新

### 预设标签也支持管理

- 原限制：工作/学习/生活/健康/其他 不可置顶/重命名/拖拽
- 改为：仅「全部任务」「每日总览」不可操作，其余均可

### Bug：标签"每日任务"不显示

- `getSortedDailyTags()` 中残留 `filter(t => t !== '每日任务')`
- 移除该过滤条件

### 右键菜单重构

- 将置顶 📌 和编辑 ✏️ 从悬停按钮移到右键菜单
- 悬停仅保留 ⋮⋮（拖拽）和 ×（删除）
- 释放约 40px 宽度给标签名

### 长标签名截断

- `.tag-label-text` 添加 `text-overflow: ellipsis` + `white-space: nowrap`
- 标签名过长自动显示 `...`，悬浮 `title` 显示全名

---

## 第十轮：每日重置精度修复

### Bug：关闭应用后任务完成状态丢失

**现象**：关闭应用后重新打开，每日任务的完成状态全部变为未完成

**根因**：`lastCompletedDate` 使用 `toDateString()` 只存日期（如 `"Sun Jun 22 2026"`），丢失时间信息。`new Date(dateString)` 默认 UTC 午夜，与本地重置时间（4:00 AM）比较时精度不够。

**修复**：
- `lastCompletedDate` 改为存完整 ISO 时间戳（`new Date().toISOString()`）
- 比较改用 `getTime()` 毫秒级对比
- 添加 `isNaN(completedTime)` 容错和提前 return 安全防护
- 向后兼容：`new Date(oldDateString).getTime()` 仍可正常工作
