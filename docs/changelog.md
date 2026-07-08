# Daity 变更日志

## v1.2.0 — 2026-06-22: 标签管理增强 + Bug 修复

### 🆕 标签管理

- **置顶**：右键 → 📌 置顶/取消置顶，置顶标签在分组内优先显示
- **编辑**：右键 → ✏️ 编辑（重命名 + 切换每日/普通状态，同步更新所有任务）
- **拖拽排序**：长按 ⋮⋮ 拖拽，同组内自由排序，跨组报错
- **删除标签**：悬停 × 一键删除，清理所有任务中的该标签
- **右键菜单**：置顶/编辑/删除统合到右键菜单，悬停仅留拖拽手柄和删除按钮

### 🐛 Bug 修复

| Bug | 修复 |
|-----|------|
| 侧边栏每日标签点击后闪烁消失 | 重写 `renderTagList()` 为全量动态重建 |
| 创建任务不预选当前筛选标签 | `openAddModal()` 根据 `currentFilter` 预选标签 chip |
| 每日标签下创建任务需手动选类型 | `updateTaskTypeRadio()` 自动检测选中标签 |
| 标签"每日任务"创建后不显示 | 移除 `getSortedDailyTags()` 中残留的过滤条件 |
| 长标签名换行挤掉按钮 | CSS `text-overflow: ellipsis` + `title` 悬浮显示全名 |
| 关闭应用后每日任务全部重置 | `lastCompletedDate` 改为 ISO 时间戳（毫秒级比较） |

### 🔄 重命名

- 侧边栏 `🔄 每日任务` → `📋 每日总览`（更准确反映聚合视图功能）

---

## v1.1.0 — 2026-06-22: 每日任务标签化 + 全面优化

### 🆕 新功能

**标签级每日重置**
- 新建标签时可勾选「🔄 每日重置」，该标签下所有任务自动获得每日重置能力
- 预设每日标签「🔄 每日任务」保留，兼容旧 `type: 'daily'` 任务
- 侧边栏标签分为「📅 每日标签」和「🏷️ 普通标签」两组，视觉分隔
- 标签选择器中每日标签显示紫色边框，易于区分

**自定义重置时间**
- 设置 → ⏰ 每日重置时间，可设 0-23 时 / 0-59 分
- 默认凌晨 4:00
- 使用 `setTimeout` 精确定时，到达时间自动重置并通知 UI 刷新
- 无需重启应用即可生效

**Toast 通知**
- 替代原生 `alert()`，3 秒自动消失
- 支持 error / success 两种样式

### 🔧 Bug 修复

| 问题 | 修复 |
|------|------|
| `--in-process-gpu` 导致渲染进程崩溃 | 已从 `package.json` 的 start 脚本中移除（CLAUDE.md 明确记录此问题但之前未修复） |
| 每次 `get-tasks` 都执行每日重置（全量读盘+检查+写盘） | 改为启动时重置一次 + `setTimeout` 定时器驱动，`get-tasks` 直接返回数据 |
| IPC 调用无错误处理，主进程异常时静默失败 | 新增 `safeCall()` 封装，所有 daityAPI 调用包裹 try/catch + toast 提示 |
| 搜索无防抖，快速输入卡顿 | 添加 200ms debounce |

### ⚡ 性能优化

| 优化项 | 方式 |
|--------|------|
| DOM 全量重建 → 增量更新 | 新增 `refreshSingleTask(id)`，toggle/编辑只更新单个 li 元素 |
| `escapeHtml` 创建 DOM 元素 | 改为纯字符串替换（`str.replace()`），避免每次创建临时 div |
| `get-tasks` handler 不再每次重置 | 直接返回数据，由定时器负责重置 |

### 🛡️ 数据安全

| 变更 | 说明 |
|------|------|
| 打包版存储路径改为 `%APPDATA%\Daity\Daily\` | 之前存在 exe 同目录 `dist\win-unpacked\Daily\`，electron-builder 重建会清空导致数据丢失 |
| 开发版保持不变 | `项目根/Daily/` |
| settings 向后兼容 | `loadSettings()` 使用 `{...DEFAULT_SETTINGS, ...settings}` 合并，旧版 settings 自动补充缺失字段 |

### 📁 变更文件

| 文件 | 变更类型 |
|------|----------|
| `package.json` | 移除 `--in-process-gpu` 标志 |
| `main.js` | 重写重置逻辑（`getLastResetBoundary`、`scheduleNextReset`），新增 4 个 IPC handler，`isDailyTask` 判定函数 |
| `preload.js` | 新增 5 个 API 桥接（`getDailyTags`、`saveDailyTags`、`getResetTime`、`saveResetTime`、`onDailyReset`） |
| `renderer/index.html` | 设置面板新增重置时间控件，新建标签弹窗新增每日复选框，侧边栏新增分组分隔线，新增 toast 容器 |
| `renderer/app.js` | 每日标签管理、侧边栏分组渲染、搜索防抖、增量 DOM 更新、`safeCall` 错误处理、`showToast` 通知、字符串 escapeHtml |
| `renderer/style.css` | 新增 toast、tag-group-separator、checkbox-label、reset-time-row、time-input、daily-tag-chip 样式 |
| `renderer/i18n.js` | 新增 9 个翻译 key（中/英双语） |
| `CLAUDE.md` | 更新项目文档，新增 IPC API 一览、设置数据结构、关键决策 |
| `docs/changelog.md` | 新增本文件 |

### 🔍 技术细节

**每日任务判定逻辑（`isDailyTask`）：**
```
task.type === 'daily'  →  true（向后兼容旧任务）
task.tags 中任一标签在 dailyTags 列表中  →  true
否则  →  false
```

**重置时间比较（`getLastResetBoundary`）：**
```
now >= 今天的重置时间  →  上次重置点 = 今天重置时间
now < 今天的重置时间   →  上次重置点 = 昨天重置时间
任务 lastCompletedDate < 上次重置点  →  重置为未完成
```

**定时器调度（`scheduleNextReset`）：**
```
计算 now → 下一个重置时间的毫秒数
setTimeout(重置+递归调度, msUntilReset)
到达后：执行重置 → 通知渲染进程 → 递归调度下一次
```

---

## v1.0.0 — 初始版本

- 任务 CRUD（添加/编辑/删除/完成）
- 分类标签（预设 6 个 + 自定义 + 侧边栏筛选）
- 截止日期（datetime-local 选择器 + 临近/过期高亮 + Windows 系统通知）
- 每日任务（type: 'daily' + lastCompletedDate 比较 + 🔄 图标 + 彩色徽章）
- 搜索（标题关键词）
- 设置（自定义存储路径 + 中/英文语言切换）
- Electron 33.x + 原生 HTML/CSS/JS
- electron-builder 打包（NSIS 安装包 + 解包版）
