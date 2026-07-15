const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== GPU 兼容性修复 ==========
// 部分 Windows 环境下 GPU 硬件加速会导致 Electron 崩溃。
// 命令行 --disable-gpu 标志必须在 Chromium 初始化前传入，
// 代码级的 disableHardwareAcceleration() 时机太晚无法生效，
// 因此使用 Electron 官方的 app.relaunch() 重新启动自身。
if (!process.argv.includes('--disable-gpu')) {
  app.relaunch({
    args: process.argv.slice(1).concat([
      '--disable-gpu',
      '--disable-gpu-sandbox'
    ])
  });
  app.exit(0);
}

// 如果已携带 --disable-gpu 标志，执行以下代码（加 try-catch 兜底）
try {
  app.disableHardwareAcceleration();
} catch (e) { /* ignore */ }
try {
  app.commandLine.appendSwitch('disable-gpu-sandbox');
} catch (e) { /* ignore */ }

// ========== 配置 ==========
function getDefaultStoragePath() {
  if (app.isPackaged) {
    // 打包后：数据存储在系统用户数据目录（%APPDATA%/Daity），
    // 避免 electron-builder 重建清空 dist 导致数据丢失
    return path.join(app.getPath('userData'), 'Daily');
  }
  // 开发模式：数据存储在项目目录下的 Daily 文件夹
  return path.join(__dirname, 'Daily');
}

let storagePath = getDefaultStoragePath();
let settingsPath = path.join(storagePath, 'settings.json');
let tasksPath = path.join(storagePath, 'tasks.json');

// ========== 默认设置 ==========
const DEFAULT_SETTINGS = {
  storagePath: getDefaultStoragePath(),
  language: 'zh-CN',
  dailyTags: ['每日任务'],
  resetHour: 4,
  resetMinute: 0
};

let resetTimer = null; // 每日重置定时器引用

// ========== 数据读写工具 ==========
function ensureDataDir() {
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
}

function loadSettings() {
  ensureDataDir();
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(raw);
      // 合并默认值（兼容旧版本 settings 缺少新字段的情况）
      const merged = { ...DEFAULT_SETTINGS, ...settings };
      if (merged.storagePath) {
        storagePath = path.resolve(merged.storagePath);
        settingsPath = path.join(storagePath, 'settings.json');
        tasksPath = path.join(storagePath, 'tasks.json');
        ensureDataDir();
      }
      return merged;
    }
  } catch (e) {
    console.error('加载设置失败:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  ensureDataDir();
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

function loadTasks() {
  ensureDataDir();
  try {
    if (fs.existsSync(tasksPath)) {
      return JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
    }
  } catch (e) {
    console.error('加载任务失败:', e);
  }
  return [];
}

function saveTasks(tasks) {
  ensureDataDir();
  fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), 'utf-8');
}

// ========== 每日任务判定 ==========
function isDailyTask(task, dailyTags) {
  // 向后兼容：旧 type === 'daily' 的任务 + 新标签驱动的每日任务
  if (task.type === 'daily') return true;
  if (task.tags && task.tags.some(t => dailyTags.includes(t))) return true;
  return false;
}

// ========== 每日重置逻辑（支持自定义重置时间）==========
function getLastResetBoundary(resetHour, resetMinute) {
  const now = new Date();
  const todayReset = new Date(now);
  todayReset.setHours(resetHour, resetMinute, 0, 0);
  if (now < todayReset) {
    // 今天还没到重置时间，上一个重置点是昨天
    todayReset.setDate(todayReset.getDate() - 1);
  }
  return todayReset;
}

function resetDailyTasks() {
  const settings = loadSettings();
  const tasks = loadTasks();
  const dailyTags = settings.dailyTags || DEFAULT_SETTINGS.dailyTags;
  const resetHour = settings.resetHour != null ? settings.resetHour : DEFAULT_SETTINGS.resetHour;
  const resetMinute = settings.resetMinute != null ? settings.resetMinute : DEFAULT_SETTINGS.resetMinute;

  const lastResetBoundary = getLastResetBoundary(resetHour, resetMinute);
  let changed = false;

  tasks.forEach(task => {
    // 仅处理每日任务（严格判定，防止误伤普通任务）
    if (!isDailyTask(task, dailyTags)) return;

    // 每日任务：重置计时器
    if (task.timer) {
      task.timer = null;
      changed = true;
    }

    if (!task.completed) return;

    if (!task.lastCompletedDate) {
      // 旧数据：没有完成时间记录 → 重置
      task.completed = false;
      task.completedAt = null;
      changed = true;
    } else {
      // 兼容旧版 dateString 和新版 ISO timestamp
      const completedTime = new Date(task.lastCompletedDate).getTime();
      if (isNaN(completedTime)) {
        // 无效日期 → 重置
        task.completed = false;
        task.completedAt = null;
        changed = true;
      } else if (completedTime < lastResetBoundary.getTime()) {
        // 完成于上次重置时间之前 → 重置
        task.completed = false;
        task.completedAt = null;
        changed = true;
      }
      // 否则：完成于上次重置之后，保留完成状态
    }
  });

  if (changed) {
    saveTasks(tasks);
  }
  return tasks;
}

// ========== 定时器调度下一次重置 ==========
function scheduleNextReset(resetHour, resetMinute) {
  // 清除旧定时器
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }

  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setHours(resetHour, resetMinute, 0, 0);
  if (nextReset <= now) {
    nextReset.setDate(nextReset.getDate() + 1);
  }
  const msUntilReset = nextReset - now;

  // 定时器最大约 24.8 天（2^31 - 1 毫秒），这里最多 24 小时，安全
  resetTimer = setTimeout(() => {
    resetDailyTasks();
    scheduleNextReset(resetHour, resetMinute); // 递归调度下一次
    // 通知渲染进程刷新
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('daily-reset');
    }
  }, msUntilReset);

  console.log(`[Daity] 下次每日重置: ${nextReset.toLocaleString('zh-CN')} (${Math.round(msUntilReset / 1000 / 60)} 分钟后)`);
}

function startResetScheduler() {
  const settings = loadSettings();
  const resetHour = settings.resetHour != null ? settings.resetHour : DEFAULT_SETTINGS.resetHour;
  const resetMinute = settings.resetMinute != null ? settings.resetMinute : DEFAULT_SETTINGS.resetMinute;
  scheduleNextReset(resetHour, resetMinute);
}

// ========== 截止日期检查与通知 ==========
function checkDeadlines(tasks) {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  tasks.forEach(task => {
    if (task.completed || !task.deadline) return;
    const deadline = new Date(task.deadline);
    if (deadline <= soon && deadline > now) {
      new Notification({
        title: '⏰ 任务即将到期',
        body: `"${task.title}" 截止时间：${deadline.toLocaleString('zh-CN')}`,
        urgency: 'critical'
      }).show();
    } else if (deadline < now) {
      new Notification({
        title: '⚠️ 任务已过期',
        body: `"${task.title}" 已超过截止日期`,
        urgency: 'critical'
      }).show();
    }
  });
}

// ========== IPC 处理 ==========
function setupIPC() {
  // 获取所有任务（不再每次调用 resetDailyTasks，由定时器+启动时负责重置）
  ipcMain.handle('get-tasks', () => {
    return loadTasks();
  });

  // 添加任务
  ipcMain.handle('add-task', (event, taskData) => {
    const tasks = loadTasks();
    const settings = loadSettings();
    const dailyTags = settings.dailyTags || DEFAULT_SETTINGS.dailyTags;

    // 自动判定 type：如果标签含每日标签，设置为 daily
    let taskType = taskData.type || 'normal';
    if (taskData.tags && taskData.tags.some(t => dailyTags.includes(t))) {
      taskType = 'daily';
    }

    const newTask = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      title: taskData.title,
      completed: false,
      type: taskType,
      tags: taskData.tags || [],
      deadline: taskData.deadline || null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      lastCompletedDate: null,
      timer: taskData.timer || null
    };
    tasks.push(newTask);
    saveTasks(tasks);
    return newTask;
  });

  // 更新任务
  ipcMain.handle('update-task', (event, { id, updates }) => {
    const tasks = loadTasks();
    const settings = loadSettings();
    const dailyTags = settings.dailyTags || DEFAULT_SETTINGS.dailyTags;
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    // 处理完成状态变更
    if (updates.completed !== undefined) {
      tasks[index].completed = updates.completed;
      if (updates.completed) {
        tasks[index].completedAt = new Date().toISOString();
        if (isDailyTask(tasks[index], dailyTags)) {
          tasks[index].lastCompletedDate = new Date().toISOString();
        }
      } else {
        tasks[index].completedAt = null;
        tasks[index].lastCompletedDate = null;
      }
    }

    // 其他字段更新
    if (updates.title !== undefined) tasks[index].title = updates.title;
    if (updates.tags !== undefined) {
      tasks[index].tags = updates.tags;
      // 自动更新 type：如果新标签包含每日标签
      if (updates.tags.some(t => dailyTags.includes(t))) {
        tasks[index].type = 'daily';
      } else if (tasks[index].type === 'daily') {
        // 如果原本是 daily 但标签不再包含每日标签，保持 daily type（向后兼容）
        // 用户可通过取消每日来改为 normal
      }
    }
    if (updates.deadline !== undefined) tasks[index].deadline = updates.deadline;
    if (updates.type !== undefined) tasks[index].type = updates.type;
    if (updates.timer !== undefined) tasks[index].timer = updates.timer;

    saveTasks(tasks);
    return tasks[index];
  });

  // 删除任务
  ipcMain.handle('delete-task', (event, id) => {
    let tasks = loadTasks();
    tasks = tasks.filter(t => t.id !== id);
    saveTasks(tasks);
    return true;
  });

  // 获取设置
  ipcMain.handle('get-settings', () => {
    return loadSettings();
  });

  // 保存设置
  ipcMain.handle('save-settings', (event, settings) => {
    const current = loadSettings();

    // 处理存储路径变更
    if (settings.storagePath) {
      const oldPath = storagePath;
      storagePath = path.resolve(settings.storagePath);
      settingsPath = path.join(storagePath, 'settings.json');
      tasksPath = path.join(storagePath, 'tasks.json');

      // 迁移数据
      ensureDataDir();
      const oldTasksPath = path.join(oldPath, 'tasks.json');
      if (fs.existsSync(oldTasksPath) && !fs.existsSync(tasksPath)) {
        fs.copyFileSync(oldTasksPath, tasksPath);
      }
      current.storagePath = settings.storagePath;
    }

    // 语言设置
    if (settings.language) {
      current.language = settings.language;
    }

    // 每日标签设置
    if (settings.dailyTags !== undefined) {
      current.dailyTags = settings.dailyTags;
    }

    // 重置时间设置
    let needReschedule = false;
    if (settings.resetHour !== undefined) {
      current.resetHour = settings.resetHour;
      needReschedule = true;
    }
    if (settings.resetMinute !== undefined) {
      current.resetMinute = settings.resetMinute;
      needReschedule = true;
    }

    saveSettings(current);

    // 重置时间变更 → 重新调度
    if (needReschedule) {
      scheduleNextReset(
        current.resetHour != null ? current.resetHour : DEFAULT_SETTINGS.resetHour,
        current.resetMinute != null ? current.resetMinute : DEFAULT_SETTINGS.resetMinute
      );
    }

    return current;
  });

  // 获取所有标签
  ipcMain.handle('get-tags', () => {
    const tasks = loadTasks();
    const tagSet = new Set();
    tasks.forEach(t => t.tags.forEach(tag => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  });

  // === 新增: 每日标签管理 ===
  ipcMain.handle('get-daily-tags', () => {
    const settings = loadSettings();
    return settings.dailyTags || DEFAULT_SETTINGS.dailyTags;
  });

  ipcMain.handle('save-daily-tags', (event, dailyTags) => {
    const settings = loadSettings();
    settings.dailyTags = dailyTags;
    saveSettings(settings);
    return settings.dailyTags;
  });

  // === 新增: 重置时间管理 ===
  ipcMain.handle('get-reset-time', () => {
    const settings = loadSettings();
    return {
      hour: settings.resetHour != null ? settings.resetHour : DEFAULT_SETTINGS.resetHour,
      minute: settings.resetMinute != null ? settings.resetMinute : DEFAULT_SETTINGS.resetMinute
    };
  });

  ipcMain.handle('save-reset-time', (event, time) => {
    const settings = loadSettings();
    if (time.hour !== undefined) settings.resetHour = time.hour;
    if (time.minute !== undefined) settings.resetMinute = time.minute;
    saveSettings(settings);
    scheduleNextReset(settings.resetHour, settings.resetMinute);
    return { hour: settings.resetHour, minute: settings.resetMinute };
  });

  // 删除标签：从所有任务中移除该标签 + 从 dailyTags 中移除
  ipcMain.handle('cleanup-tag', (event, tag) => {
    const tasks = loadTasks();
    const settings = loadSettings();
    const dailyTags = settings.dailyTags || DEFAULT_SETTINGS.dailyTags;
    let tasksChanged = false;
    let settingsChanged = false;

    tasks.forEach(t => {
      if (t.tags && t.tags.includes(tag)) {
        t.tags = t.tags.filter(tg => tg !== tag);
        // 如果移除后不再是每日任务，更新 type
        if (t.type === 'daily' && !isDailyTask(t, dailyTags)) {
          t.type = 'normal';
        }
        tasksChanged = true;
      }
    });

    if (dailyTags.includes(tag)) {
      settings.dailyTags = dailyTags.filter(t => t !== tag);
      settingsChanged = true;
    }

    if (tasksChanged) saveTasks(tasks);
    if (settingsChanged) saveSettings(settings);

    return { tasksChanged, settingsChanged };
  });

  // 重命名标签：更新所有任务 + dailyTags + pinnedTags + tagOrder
  ipcMain.handle('rename-tag', (event, { oldName, newName }) => {
    if (!oldName || !newName || oldName === newName) return false;
    const tasks = loadTasks();
    const settings = loadSettings();
    let changed = false;

    tasks.forEach(t => {
      if (t.tags && t.tags.includes(oldName)) {
        t.tags = t.tags.map(tg => tg === oldName ? newName : tg);
        changed = true;
      }
    });

    if (settings.dailyTags && settings.dailyTags.includes(oldName)) {
      settings.dailyTags = settings.dailyTags.map(t => t === oldName ? newName : t);
      changed = true;
    }
    if (settings.pinnedTags && settings.pinnedTags.includes(oldName)) {
      settings.pinnedTags = settings.pinnedTags.map(t => t === oldName ? newName : t);
      changed = true;
    }
    if (settings.tagOrder && settings.tagOrder.includes(oldName)) {
      settings.tagOrder = settings.tagOrder.map(t => t === oldName ? newName : t);
      changed = true;
    }

    if (changed) { saveTasks(tasks); saveSettings(settings); }
    return { success: true };
  });

  // 切换标签每日状态
  ipcMain.handle('toggle-tag-daily', (event, { tag, makeDaily }) => {
    const tasks = loadTasks();
    const settings = loadSettings();
    const dailyTags = settings.dailyTags || DEFAULT_SETTINGS.dailyTags;

    if (makeDaily) {
      if (!dailyTags.includes(tag)) settings.dailyTags = [...dailyTags, tag];
      tasks.forEach(t => {
        if (t.tags && t.tags.includes(tag)) t.type = 'daily';
      });
    } else {
      settings.dailyTags = dailyTags.filter(t => t !== tag);
      tasks.forEach(t => {
        if (t.tags && t.tags.includes(tag) && t.type === 'daily') {
          const hasOtherDaily = t.tags.some(tg => tg !== tag && settings.dailyTags.includes(tg));
          if (!hasOtherDaily) t.type = 'normal';
        }
      });
    }

    saveTasks(tasks);
    saveSettings(settings);
    return { dailyTags: settings.dailyTags };
  });

  // 保存置顶标签列表
  ipcMain.handle('save-pinned-tags', (event, pinnedTags) => {
    const settings = loadSettings();
    settings.pinnedTags = pinnedTags;
    saveSettings(settings);
    return settings.pinnedTags;
  });

  // 保存标签排序
  ipcMain.handle('save-tag-order', (event, tagOrder) => {
    const settings = loadSettings();
    settings.tagOrder = tagOrder;
    saveSettings(settings);
    return settings.tagOrder;
  });

  // 检查截止日期并发送通知
  ipcMain.handle('check-deadlines', () => {
    const tasks = loadTasks();
    checkDeadlines(tasks);
    return true;
  });
}

// ========== 应用生命周期 ==========
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    title: 'Daity',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    const tasks = loadTasks();
    checkDeadlines(tasks);
  });
}

app.whenReady().then(() => {
  loadSettings();   // 加载设置（含自定义存储路径）
  resetDailyTasks(); // 启动时执行一次每日重置
  setupIPC();
  startResetScheduler(); // 启动定时器，在下一个重置时间自动重置
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (resetTimer) clearTimeout(resetTimer);
  if (process.platform !== 'darwin') app.quit();
});
