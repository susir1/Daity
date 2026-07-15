// ========== 全局状态 ==========
let tasks = [];
let allTags = ['工作', '学习', '生活', '健康', '其他'];
let dailyTags = ['每日任务'];       // 标记为"每日重置"的标签列表
let pinnedTags = [];               // 置顶标签列表
let tagOrder = [];                 // 自定义标签显示顺序
let currentFilter = 'all';
let searchQuery = '';
let editingTaskId = null;
let deleteTargetId = null;
let editingTagOldName = null;     // 正在编辑的标签原名
let searchDebounceTimer = null;
let dragSrcTag = null;            // 当前拖拽的标签名
let tickTimer = null;             // 全局计时器 interval（单个）

// ========== DOM 引用 ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const taskList = $('#task-list');
const emptyState = $('#empty-state');
const searchInput = $('#search-input');

// 弹窗
const modalTask = $('#modal-task');
const modalDelete = $('#modal-delete');
const modalSettings = $('#modal-settings');
const modalNewTag = $('#modal-new-tag');
const modalEditTag = $('#modal-edit-tag');

// ========== Toast 通知 ==========
function showToast(message, type = 'error') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // 3 秒后自动移除
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3000);
}

// ========== IPC 安全调用封装 ==========
async function safeCall(asyncFn, fallback = null, showError = true) {
  try {
    return await asyncFn();
  } catch (e) {
    console.error('Daity API error:', e);
    if (showError) showToast(i18n.t('toastError'));
    return fallback;
  }
}

// ========== 初始化 ==========
async function init() {
  await loadSettings();
  i18n.apply();
  await loadDailyTags();
  await loadTasks();
  await loadTags();
  await loadPinnedAndOrder();
  renderTagList();
  renderTasks();
  ensureTickRunning();
  updateStatusBar();
  bindEvents();
  checkDeadlines();
  listenDailyReset();
}

// ========== 数据加载 ==========
async function loadTasks() {
  tasks = await safeCall(() => window.daityAPI.getTasks(), []);
}

async function loadTags() {
  const savedTags = await safeCall(() => window.daityAPI.getTags(), []);
  // 合并预置标签 + 任务标签 + 每日标签（即使暂无任务也应显示）
  allTags = [...new Set([...PRESET_TAG_NAMES, ...savedTags, ...dailyTags])];
}

async function loadDailyTags() {
  const dt = await safeCall(() => window.daityAPI.getDailyTags(), ['每日任务']);
  dailyTags = dt;
}

async function loadPinnedAndOrder() {
  const settings = await safeCall(() => window.daityAPI.getSettings(), {});
  pinnedTags = settings.pinnedTags || [];
  tagOrder = settings.tagOrder || [];
}

async function loadSettings() {
  const settings = await safeCall(() => window.daityAPI.getSettings(), {});
  if (settings.storagePath) {
    $('#input-storage-path').value = settings.storagePath;
  }
  // 加载语言设置
  if (settings.language) {
    i18n.setLang(settings.language);
    $('#select-language').value = settings.language;
  } else {
    $('#select-language').value = i18n.currentLang;
  }
  // 加载重置时间
  if (settings.resetHour != null && settings.resetMinute != null) {
    $('#input-reset-hour').value = settings.resetHour;
    $('#input-reset-minute').value = settings.resetMinute;
  }
}

async function checkDeadlines() {
  await safeCall(() => window.daityAPI.checkDeadlines(), null, false);
}

// ========== 计时器 ==========
function formatTimerDisplay(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getEffectiveElapsed(task) {
  const t = task.timer;
  if (!t) return 0;
  if (t.running && t.startedAt) {
    return t.elapsedMs + (Date.now() - new Date(t.startedAt).getTime());
  }
  return t.elapsedMs || 0;
}

function getEffectiveRemaining(task) {
  const t = task.timer;
  if (!t) return 0;
  if (t.running && t.startedAt) {
    return (t.remainingMs || 0) - (Date.now() - new Date(t.startedAt).getTime());
  }
  return t.remainingMs || 0;
}

function getNextPhase(timer) {
  if (timer.mode !== 'pomodoro') return 'work';
  if (timer.phase === 'work') {
    const count = (timer.pomodoroCount || 0) + 1;
    const interval = timer.longBreakInterval || 4;
    return count % interval === 0 ? 'longBreak' : 'shortBreak';
  }
  return 'work';
}

function ensureTickRunning() {
  const anyRunning = tasks.some(t => t.timer && t.timer.running);
  if (anyRunning && !tickTimer) {
    tickTimer = setInterval(onTick, 1000);
  } else if (!anyRunning && tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function onTick() {
  const now = Date.now();
  let anyRunning = false;
  tasks.forEach(task => {
    const t = task.timer;
    if (!t || !t.running) return;
    anyRunning = true;
    if (t.mode === 'pomodoro') {
      const remaining = (t.remainingMs || 0) - (now - new Date(t.startedAt).getTime());
      if (remaining <= 0) {
        completePhase(task.id);
      } else {
        updateTaskTimerDisplay(task.id);
      }
    } else {
      updateTaskTimerDisplay(task.id);
    }
  });
  if (!anyRunning) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function lazyInitTimer(task) {
  if (!task.timer) {
    task.timer = {
      mode: 'forward',
      elapsedMs: 0,
      remainingMs: 0,
      workDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      phase: 'work',
      pomodoroCount: 0,
      running: false,
      startedAt: null
    };
  }
}

async function toggleTaskTimer(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  lazyInitTimer(task);
  const t = task.timer;

  if (t.running) {
    // 暂停
    const now = Date.now();
    if (t.mode === 'pomodoro') {
      t.remainingMs = Math.max(0, (t.remainingMs || 0) - (now - new Date(t.startedAt).getTime()));
    } else {
      t.elapsedMs = (t.elapsedMs || 0) + (now - new Date(t.startedAt).getTime());
    }
    t.running = false;
    t.startedAt = null;
    await saveTaskTimer(taskId);
    updateTaskTimerDisplay(taskId);
    ensureTickRunning();
  } else {
    // 开始
    t.running = true;
    t.startedAt = new Date().toISOString();
    await saveTaskTimer(taskId);
    updateTaskTimerDisplay(taskId);
    ensureTickRunning();
  }
}

async function completePhase(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.timer) return;
  const t = task.timer;

  if (t.phase === 'work') {
    t.pomodoroCount = (t.pomodoroCount || 0) + 1;
    const nextPhase = getNextPhase(t);
    t.phase = nextPhase;
    t.remainingMs = (nextPhase === 'longBreak' ? (t.longBreakDuration || 15) : (t.shortBreakDuration || 5)) * 60 * 1000;
    showToast(i18n.t('toastPomodoroWorkDone'), 'success');
  } else {
    t.phase = 'work';
    t.remainingMs = (t.workDuration || 25) * 60 * 1000;
    showToast(i18n.t('toastPomodoroBreakDone'), 'success');
  }
  t.running = true;
  t.startedAt = new Date().toISOString();
  await saveTaskTimer(taskId);
  updateTaskTimerDisplay(taskId);
}

function updateTaskTimerDisplay(taskId) {
  const task = tasks.find(t => t.id === taskId);
  const taskEl = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!taskEl) return;

  const btnEl = taskEl.querySelector('.task-timer-btn');
  const displayEl = taskEl.querySelector('.task-timer-display');
  const countEl = taskEl.querySelector('.task-pomodoro-count');
  const phaseEl = taskEl.querySelector('.task-pomodoro-phase');

  if (!btnEl || !displayEl) return;

  if (!task || !task.timer) {
    btnEl.textContent = '▶';
    btnEl.classList.remove('running');
    btnEl.title = i18n.t('timerStart');
    displayEl.textContent = '';
    displayEl.classList.remove('warning', 'overtime');
    if (countEl) countEl.textContent = '';
    if (phaseEl) { phaseEl.textContent = ''; phaseEl.className = 'task-pomodoro-phase'; }
    return;
  }

  const t = task.timer;

  if (t.running) {
    btnEl.textContent = '⏸';
    btnEl.classList.add('running');
    btnEl.title = i18n.t('timerStop');
  } else {
    btnEl.textContent = '▶';
    btnEl.classList.remove('running');
    btnEl.title = i18n.t('timerStart');
  }

  if (t.mode === 'pomodoro') {
    const remaining = getEffectiveRemaining(task);
    displayEl.textContent = formatTimerDisplay(Math.max(0, remaining));
    if (remaining <= 60000 && remaining > 0) {
      displayEl.classList.add('warning');
      displayEl.classList.remove('overtime');
    } else if (remaining <= 0 && !t.running) {
      displayEl.classList.add('overtime');
      displayEl.classList.remove('warning');
    } else {
      displayEl.classList.remove('warning', 'overtime');
    }
    if (countEl) countEl.textContent = `🍅×${t.pomodoroCount || 0}`;
    if (phaseEl) {
      phaseEl.textContent = i18n.t(t.phase === 'work' ? 'phaseWork' : (t.phase === 'longBreak' ? 'phaseLongBreak' : 'phaseShortBreak'));
      phaseEl.className = `task-pomodoro-phase ${t.phase}`;
    }
  } else {
    const elapsed = getEffectiveElapsed(task);
    displayEl.textContent = elapsed > 0 || t.running ? formatTimerDisplay(elapsed) : '';
    displayEl.classList.remove('warning', 'overtime');
    if (countEl) countEl.textContent = '';
    if (phaseEl) { phaseEl.textContent = ''; phaseEl.className = 'task-pomodoro-phase'; }
  }
}

async function saveTaskTimer(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  // 深拷贝 timer 避免引用问题
  const timerCopy = task.timer ? JSON.parse(JSON.stringify(task.timer)) : null;
  await safeCall(() => window.daityAPI.updateTask(taskId, { timer: timerCopy }), null, false);
}

// ========== 每日重置事件监听 ==========
function listenDailyReset() {
  window.daityAPI.onDailyReset(async () => {
    await loadTasks();
    renderTasks();
    // 停止所有计时（主进程已重置 timer 字段）
    ensureTickRunning();
  });
}

// ========== 每日任务判定 ==========
function isDailyTask(task) {
  if (task.type === 'daily') return true;
  if (task.tags && task.tags.some(t => dailyTags.includes(t))) return true;
  return false;
}

// ========== 渲染 ==========
function getFilteredTasks() {
  let filtered = tasks.filter(t => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'daily') return isDailyTask(t);
    return t.tags.includes(currentFilter);
  });

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(t => t.title.toLowerCase().includes(q));
  }

  // 排序：未完成优先 → 每日任务优先 → 按创建时间倒序
  filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const aDaily = isDailyTask(a);
    const bDaily = isDailyTask(b);
    if (aDaily && !bDaily) return -1;
    if (!aDaily && bDaily) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return filtered;
}

// ========== 构建单个任务项的 HTML ==========
function buildTaskHTML(task) {
  const daily = isDailyTask(task);

  // 每日任务图标
  let dailyIconHtml = '';
  if (daily) {
    dailyIconHtml = '<span class="task-daily-icon">🔄</span>';
  }

  // 复选框
  const checkedClass = task.completed ? 'checked' : '';

  // 标签
  const tagsHtml = task.tags.map(tag =>
    `<span class="task-tag">${escapeHtml(tag)}</span>`
  ).join('');

  // 截止日期
  let deadlineHtml = '';
  if (task.deadline) {
    const dl = new Date(task.deadline);
    const now = new Date();
    let dlClass = '';
    if (dl < now) {
      dlClass = 'overdue';
    } else if ((dl - now) < 24 * 60 * 60 * 1000) {
      dlClass = 'urgent';
    }
    deadlineHtml = `<span class="task-deadline ${dlClass}">📅 ${formatDate(dl)}</span>`;
  }

  // 每日任务徽章
  let dailyBadgeHtml = '';
  if (daily) {
    if (task.completed) {
      dailyBadgeHtml = `<span class="task-daily-badge completed-daily">${i18n.t('taskBadgeDailyComplete')}</span>`;
    } else {
      dailyBadgeHtml = `<span class="task-daily-badge incomplete">${i18n.t('taskBadgeDailyIncomplete')}</span>`;
    }
  }

  // 操作按钮
  let actionBtnHtml;
  if (daily) {
    actionBtnHtml = `<button class="task-action-btn" data-action="cancel-daily" data-id="${task.id}" title="${i18n.t('taskTooltipCancelDaily')}">🔓</button>`;
  } else {
    actionBtnHtml = `<button class="task-action-btn delete" data-action="delete" data-id="${task.id}" title="${i18n.t('taskTooltipDelete')}">🗑️</button>`;
  }

  const taskClass = daily ? 'task-item daily-task' + (task.completed ? ' completed-daily-task' : '') : 'task-item';

  return `
    <li class="${taskClass}" data-task-id="${task.id}">
      ${dailyIconHtml}
      <div class="task-checkbox ${checkedClass}" data-action="toggle" data-id="${task.id}"></div>
      <div class="task-body">
        <div class="task-title ${task.completed ? 'completed' : ''}">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          ${tagsHtml}
          ${deadlineHtml}
        </div>
      </div>
      ${dailyBadgeHtml}
      <span class="task-timer">
        <button class="task-timer-btn" data-action="timer" data-id="${task.id}" title="${i18n.t('timerStart')}">▶</button>
        <span class="task-timer-display"></span>
        <span class="task-pomodoro-count"></span>
        <span class="task-pomodoro-phase"></span>
      </span>
      <div class="task-actions">
        <button class="task-action-btn edit" data-action="edit" data-id="${task.id}" title="${i18n.t('taskTooltipEdit')}">✏️</button>
        ${actionBtnHtml}
      </div>
    </li>
  `;
}

// ========== 全量渲染任务列表 ==========
function renderTasks() {
  const filtered = getFilteredTasks();
  taskList.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    const emptyText = $('#empty-text');
    const emptyHint = $('#empty-hint-text');
    if (searchQuery.trim()) {
      emptyText.textContent = i18n.t('emptyNoMatch');
      emptyHint.textContent = i18n.t('emptyHintSearch');
    } else if (currentFilter !== 'all') {
      emptyText.textContent = i18n.t('emptyNoTag');
      emptyHint.textContent = i18n.t('emptyHint');
    } else {
      emptyText.textContent = i18n.t('emptyNoTasks');
      emptyHint.textContent = i18n.t('emptyHint');
    }
    updateStatusBar();
    return;
  }

  emptyState.classList.add('hidden');

  filtered.forEach(task => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = buildTaskHTML(task);
    const li = tempDiv.firstElementChild;

    // 事件委托
    li.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      const id = e.target.dataset.id;
      switch (action) {
        case 'toggle': toggleTask(id); break;
        case 'edit': openEditModal(id); break;
        case 'delete': openDeleteModal(id); break;
        case 'cancel-daily': cancelDailyTask(id); break;
        case 'timer': toggleTaskTimer(id); break;
      }
    });

    taskList.appendChild(li);
  });

  updateStatusBar();
  refreshAllTaskTimerDisplays();
}

// ========== 刷新所有任务计时显示 ==========
function refreshAllTaskTimerDisplays() {
  tasks.forEach(task => updateTaskTimerDisplay(task.id));
}

// ========== 增量更新单个任务项 ==========
function refreshSingleTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const existingLi = taskList.querySelector(`[data-task-id="${taskId}"]`);
  if (!existingLi) {
    // 任务不在当前视图中（被筛选掉了），全量刷新
    renderTasks();
    return;
  }

  // 重建该 li
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = buildTaskHTML(task);
  const newLi = tempDiv.firstElementChild;

  // 重新绑定事件
  newLi.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    const id = e.target.dataset.id;
    switch (action) {
      case 'toggle': toggleTask(id); break;
      case 'edit': openEditModal(id); break;
      case 'delete': openDeleteModal(id); break;
      case 'cancel-daily': cancelDailyTask(id); break;
      case 'timer': toggleTaskTimer(id); break;
    }
  });

  existingLi.replaceWith(newLi);
  updateStatusBar();
  updateTaskTimerDisplay(taskId);
}

function updateStatusBar() {
  const pending = tasks.filter(t => !t.completed).length;
  const daily = tasks.filter(t => isDailyTask(t)).length;
  const total = tasks.length;

  $('#status-pending-text').textContent = i18n.t('statusPending', { count: pending });
  $('#status-daily-text').textContent = i18n.t('statusDaily', { count: daily });
  $('#status-total-text').textContent = i18n.t('statusTotal', { count: total });
}

// ========== 预置标签定义 ==========
const PRESET_TAG_DEFS = [
  { tag: '工作', key: 'tagWork', icon: '💼' },
  { tag: '学习', key: 'tagStudy', icon: '📚' },
  { tag: '生活', key: 'tagLife', icon: '🏠' },
  { tag: '健康', key: 'tagHealth', icon: '💪' },
  { tag: '其他', key: 'tagOther', icon: '📌' },
];
const PRESET_TAG_NAMES = PRESET_TAG_DEFS.map(d => d.tag);

// ========== 标签排序辅助 ==========
function sortCustomTags(tags) {
  // 先按是否置顶排序，再按 tagOrder 排序
  const inOrder = tags.filter(t => tagOrder.includes(t)).sort((a, b) => tagOrder.indexOf(a) - tagOrder.indexOf(b));
  const notInOrder = tags.filter(t => !tagOrder.includes(t));
  return [...inOrder, ...notInOrder];
}

function getSortedDailyTags() {
  const allDaily = [...dailyTags];
  const pinned = allDaily.filter(t => pinnedTags.includes(t));
  const unpinned = allDaily.filter(t => !pinnedTags.includes(t));
  return [...sortCustomTags(pinned), ...sortCustomTags(unpinned)];
}

function getSortedNormalTags() {
  // 所有普通标签（预置 + 自定义），排除每日标签
  const allNormal = allTags.filter(t => !dailyTags.includes(t));
  const pinned = allNormal.filter(t => pinnedTags.includes(t));
  const unpinned = allNormal.filter(t => !pinnedTags.includes(t));
  return [...sortCustomTags(pinned), ...sortCustomTags(unpinned)];
}

// ========== 标签列表渲染（全量动态构建）==========
function renderTagList() {
  const tagListEl = $('#tag-list');
  tagListEl.innerHTML = '';

  // ---- 全部任务 ----
  tagListEl.appendChild(buildTagItem('all', '📋', 'tagAll'));

  // ---- 每日标签分组 ----
  const sortedDaily = getSortedDailyTags();
  addGroupLabel(tagListEl, 'tagGroupDaily');
  sortedDaily.forEach(tag => {
    const presetDef = PRESET_TAG_DEFS.find(d => d.tag === tag);
    if (presetDef) {
      tagListEl.appendChild(buildTagItem(tag, presetDef.icon, presetDef.key));
    } else {
      tagListEl.appendChild(buildTagItem(tag, '🔄', null));
    }
  });
  // "🔄 每日任务" 聚合筛选器
  const dailyFilterLi = buildTagItem('daily', '📋', 'tagDaily');
  dailyFilterLi.classList.add('tag-daily-filter');
  tagListEl.appendChild(dailyFilterLi);

  // ---- 普通标签分组 ----
  const sortedNormal = getSortedNormalTags();
  if (sortedNormal.length > 0) {
    addGroupLabel(tagListEl, 'tagGroupNormal');
    sortedNormal.forEach(tag => {
      const presetDef = PRESET_TAG_DEFS.find(d => d.tag === tag);
      if (presetDef) {
        tagListEl.appendChild(buildTagItem(tag, presetDef.icon, presetDef.key));
      } else {
        tagListEl.appendChild(buildTagItem(tag, '🏷️', null));
      }
    });
  }
}

function addGroupLabel(parent, i18nKey) {
  const li = document.createElement('li');
  li.className = 'tag-group-separator';
  li.innerHTML = `<span class="tag-group-label">${i18n.t(i18nKey)}</span>`;
  parent.appendChild(li);
  return li;
}

function buildTagItem(tag, icon, i18nKey) {
  const li = document.createElement('li');
  li.className = 'tag-item';
  li.dataset.tag = tag;
  li.dataset.isDaily = dailyTags.includes(tag) ? 'true' : 'false';

  // 标签文本
  const labelSpan = document.createElement('span');
  labelSpan.className = 'tag-label-text';
  if (i18nKey) {
    labelSpan.textContent = i18n.t(i18nKey);
    labelSpan.title = i18n.t(i18nKey);
  } else {
    const fullText = `${icon} ${tag}`;
    labelSpan.textContent = fullText;
    labelSpan.title = fullText;
  }
  li.appendChild(labelSpan);

  if (tag === currentFilter) li.classList.add('active');

  // 非系统标签（all / daily 不可操作，其余均可拖拽/编辑/删除/置顶）
  const isManageable = tag !== 'all' && tag !== 'daily';
  if (isManageable) {
    // 置顶标识
    if (pinnedTags.includes(tag)) li.classList.add('pinned-tag');

    // 操作按钮容器（仅拖拽手柄 + 删除按钮，置顶/编辑移到右键菜单）
    const actionsRow = document.createElement('span');
    actionsRow.className = 'tag-actions-row';

    // 拖拽手柄
    const dragHandle = document.createElement('span');
    dragHandle.className = 'tag-drag-handle';
    dragHandle.textContent = '⋮⋮';
    dragHandle.title = i18n.t('tagDragHandle');
    actionsRow.appendChild(dragHandle);

    // 删除按钮
    const delBtn = document.createElement('span');
    delBtn.className = 'tag-delete-btn';
    delBtn.textContent = '×';
    delBtn.title = i18n.currentLang === 'zh-CN' ? '删除标签' : 'Delete tag';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTag(tag);
    });
    actionsRow.appendChild(delBtn);

    li.appendChild(actionsRow);

    // 右键菜单
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTagContextMenu(e.clientX, e.clientY, tag);
    });

    // 拖拽事件
    li.draggable = true;
    li.addEventListener('dragstart', (e) => {
      dragSrcTag = tag;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tag);
      document.body.classList.add('tag-dragging');
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      document.body.classList.remove('tag-dragging');
      // 清除所有视觉状态
      document.querySelectorAll('.drag-over, .drag-invalid').forEach(el => {
        el.classList.remove('drag-over', 'drag-invalid');
      });
      dragSrcTag = null;
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragSrcTag || dragSrcTag === tag) return;
      const srcIsDaily = dailyTags.includes(dragSrcTag);
      const tgtIsDaily = dailyTags.includes(tag);
      if (srcIsDaily !== tgtIsDaily) {
        // 跨组拖拽 → 显示禁止
        e.dataTransfer.dropEffect = 'none';
        li.classList.add('drag-invalid');
        li.classList.remove('drag-over');
      } else {
        // 同组 → 允许
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('drag-over');
        li.classList.remove('drag-invalid');
      }
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over', 'drag-invalid');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over', 'drag-invalid');
      if (!dragSrcTag || dragSrcTag === tag) return;
      const srcIsDaily = dailyTags.includes(dragSrcTag);
      const tgtIsDaily = dailyTags.includes(tag);
      if (srcIsDaily !== tgtIsDaily) {
        showToast(i18n.t('dragErrorCrossGroup'), 'error');
        return;
      }
      // 更新 tagOrder
      moveTagInOrder(dragSrcTag, tag);
      renderTagList();
    });
  }

  // 点击标签主体 → 筛选
  li.addEventListener('click', (e) => {
    // 如果点击的是按钮区域，忽略
    if (e.target.closest('.tag-actions-row')) return;
    setFilter(tag);
  });
  return li;
}

// ========== 拖拽排序 ==========
function moveTagInOrder(srcTag, targetTag) {
  // 确保两个标签都在 tagOrder 中
  if (!tagOrder.includes(srcTag)) tagOrder.push(srcTag);
  if (!tagOrder.includes(targetTag)) tagOrder.push(targetTag);
  // 移除 srcTag，插入到 targetTag 之前
  tagOrder = tagOrder.filter(t => t !== srcTag);
  const idx = tagOrder.indexOf(targetTag);
  tagOrder.splice(idx, 0, srcTag);
  window.daityAPI.saveTagOrder(tagOrder).catch(() => {});
}

// ========== 置顶 ==========
async function togglePin(tag) {
  if (pinnedTags.includes(tag)) {
    pinnedTags = pinnedTags.filter(t => t !== tag);
  } else {
    pinnedTags.push(tag);
    // 确保在 tagOrder 最前面
    if (!tagOrder.includes(tag)) tagOrder.unshift(tag);
  }
  await safeCall(() => window.daityAPI.savePinnedTags(pinnedTags));
  renderTagList();
}

// ========== 编辑标签弹窗 ==========
function openEditTagModal(tag) {
  editingTagOldName = tag;
  $('#input-edit-tag-name').value = tag;
  $('#input-edit-tag-name').placeholder = i18n.t('inputTagName');
  $('#input-edit-tag-daily').checked = dailyTags.includes(tag);
  // 刷新 checkbox 翻译
  const dailySpan = modalEditTag.querySelector('[data-i18n="labelTagDaily"]');
  if (dailySpan) dailySpan.textContent = i18n.t('labelTagDaily');
  openModal(modalEditTag);
  $('#input-edit-tag-name').focus();
  $('#input-edit-tag-name').select();
}

async function saveEditTag() {
  const newName = $('#input-edit-tag-name').value.trim();
  const makeDaily = $('#input-edit-tag-daily').checked;
  const oldName = editingTagOldName;

  if (!newName) {
    showToast(i18n.t('alertEmptyTitle'), 'error');
    return;
  }

  if (!oldName) return;

  const wasDaily = dailyTags.includes(oldName);

  // 1. 重命名（如果名称变了）
  if (newName !== oldName) {
    await safeCall(() => window.daityAPI.renameTag(oldName, newName));
    // 更新渲染进程状态
    allTags = allTags.map(t => t === oldName ? newName : t);
    if (dailyTags.includes(oldName)) {
      dailyTags = dailyTags.map(t => t === oldName ? newName : t);
    }
    if (pinnedTags.includes(oldName)) {
      pinnedTags = pinnedTags.map(t => t === oldName ? newName : t);
    }
    if (tagOrder.includes(oldName)) {
      tagOrder = tagOrder.map(t => t === oldName ? newName : t);
    }
    editingTagOldName = newName;
  }

  const currentName = newName;

  // 2. 切换每日状态
  if (makeDaily !== dailyTags.includes(currentName)) {
    await safeCall(() => window.daityAPI.toggleTagDaily(currentName, makeDaily));
    if (makeDaily) {
      dailyTags.push(currentName);
    } else {
      dailyTags = dailyTags.filter(t => t !== currentName);
    }
    // 如果标签分组变了，可能需要调整筛选
    if (currentFilter === currentName && !makeDaily && wasDaily) {
      // 标签已变为普通，但仍在筛选它 → 不需要改变
    }
  }

  await loadTasks();
  renderTagList();
  renderTasks();
  closeModal(modalEditTag);
  editingTagOldName = null;
}

// ========== 右键菜单 ==========
let contextMenuTag = null;

function showTagContextMenu(x, y, tag) {
  contextMenuTag = tag;
  const menu = $('#tag-context-menu');

  // 更新置顶项文字
  const pinItem = menu.querySelector('[data-action="pin"]');
  if (pinItem) {
    const pinText = pinItem.querySelector('span:last-child');
    pinText.textContent = pinnedTags.includes(tag) ? i18n.t('tagUnpin') : i18n.t('tagPin');
  }

  // 定位菜单（确保不超出窗口）
  menu.style.left = Math.min(x, window.innerWidth - 170) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 150) + 'px';
  menu.classList.add('show');
}

function hideTagContextMenu() {
  $('#tag-context-menu').classList.remove('show');
  contextMenuTag = null;
}

function handleContextMenuAction(action) {
  const tag = contextMenuTag;
  hideTagContextMenu();
  if (!tag) return;
  switch (action) {
    case 'pin': togglePin(tag); break;
    case 'rename': openEditTagModal(tag); break;
    case 'delete': deleteTag(tag); break;
  }
}

// ========== 删除标签 ==========
async function deleteTag(tag) {
  await safeCall(() => window.daityAPI.cleanupTag(tag));

  allTags = allTags.filter(t => t !== tag);
  if (dailyTags.includes(tag)) {
    dailyTags = dailyTags.filter(t => t !== tag);
  }
  pinnedTags = pinnedTags.filter(t => t !== tag);
  tagOrder = tagOrder.filter(t => t !== tag);

  if (currentFilter === tag) {
    currentFilter = 'all';
    searchQuery = '';
    searchInput.value = '';
  }

  await loadTasks();
  renderTagList();
  renderTasks();
}

// ========== 操作 ==========
async function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  await safeCall(() => window.daityAPI.updateTask(id, { completed: !task.completed }));
  await loadTasks();
  refreshSingleTask(id);
  updateTagListIfNeeded();
}

async function addTask(taskData) {
  await safeCall(() => window.daityAPI.addTask(taskData));
  await loadTasks();
  renderTasks();
  updateTagListIfNeeded();
}

async function deleteTask(id) {
  await safeCall(() => window.daityAPI.deleteTask(id));
  await loadTasks();
  renderTasks();
  ensureTickRunning();
  updateTagListIfNeeded();
}

async function updateTask(id, updates) {
  await safeCall(() => window.daityAPI.updateTask(id, updates));
  await loadTasks();
  refreshSingleTask(id);
  updateTagListIfNeeded();
}

async function cancelDailyTask(id) {
  await safeCall(() => window.daityAPI.updateTask(id, { type: 'normal' }));
  await loadTasks();
  refreshSingleTask(id);
}

async function updateTagListIfNeeded() {
  const savedTags = await safeCall(() => window.daityAPI.getTags(), []);
  // 合并：任务标签 + 已知的每日标签（即使暂无任务）
  const merged = [...new Set([...PRESET_TAG_NAMES, ...savedTags, ...dailyTags])];
  const newAllTags = merged.filter(t => !PRESET_TAG_NAMES.includes(t) || PRESET_TAG_NAMES.includes(t));
  // 与当前 allTags 比较（额外包含用户手动创建但尚未用于任务的普通标签）
  const combined = [...new Set([...allTags, ...merged])];
  if (combined.length !== allTags.length || combined.some(t => !allTags.includes(t))) {
    allTags = combined;
    renderTagList();
  }
}

// ========== 筛选 ==========
function setFilter(tag) {
  currentFilter = tag;
  searchQuery = '';
  searchInput.value = '';
  renderTagList();
  renderTasks();
}

// ========== 弹窗管理 ==========
function openModal(modal) {
  modal.classList.add('show');
}

function closeModal(modal) {
  modal.classList.remove('show');
}

function closeAllModals() {
  $$('.modal').forEach(m => m.classList.remove('show'));
}

// 添加任务弹窗
function openAddModal() {
  editingTaskId = null;
  $('#modal-title').textContent = i18n.t('modalAddTitle');
  $('#input-title').value = '';
  $('#input-title').placeholder = i18n.t('inputTitle');
  $('#input-deadline').value = '';
  $('#input-new-tag').value = '';
  $('#input-new-tag').placeholder = i18n.t('inputNewTag');

  // 根据当前侧边栏筛选预选标签
  const preSelectedTags = [];
  if (currentFilter !== 'all' && currentFilter !== 'daily' && allTags.includes(currentFilter)) {
    preSelectedTags.push(currentFilter);
  }

  renderTagSelector(preSelectedTags);

  // 自动设置任务类型：选中的标签中有每日标签 → daily，否则 normal
  updateTaskTypeRadio();

  // 重置计时配置为"无"
  resetTimerConfig();

  openModal(modalTask);
  $('#input-title').focus();
}

function resetTimerConfig() {
  const noneRadio = document.querySelector('input[name="timer-mode"][value="none"]');
  if (noneRadio) noneRadio.checked = true;
  $('#pomodoro-config').style.display = 'none';
  $('#input-work-duration').value = 25;
  $('#input-short-break').value = 5;
  $('#input-long-break').value = 15;
  $('#input-long-break-interval').value = 4;
}

// 编辑任务弹窗
function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  $('#modal-title').textContent = i18n.t('modalEditTitle');
  $('#input-title').value = task.title;
  $('#input-title').placeholder = i18n.t('inputTitle');
  $('#input-deadline').value = task.deadline ? task.deadline.slice(0, 16) : '';
  $('#input-new-tag').value = '';
  $('#input-new-tag').placeholder = i18n.t('inputNewTag');
  renderTagSelector(task.tags);

  // 自动设置任务类型单选
  $(`input[name="task-type"][value="${task.type}"]`).checked = true;
  updateTaskTypeRadio();

  // 回填计时配置
  populateTimerConfig(task);

  openModal(modalTask);
  $('#input-title').focus();
}

function populateTimerConfig(task) {
  const timer = task.timer;
  if (!timer) {
    resetTimerConfig();
    return;
  }
  const modeRadio = document.querySelector(`input[name="timer-mode"][value="${timer.mode}"]`);
  if (modeRadio) modeRadio.checked = true;
  $('#pomodoro-config').style.display = timer.mode === 'pomodoro' ? 'block' : 'none';
  if (timer.mode === 'pomodoro') {
    $('#input-work-duration').value = timer.workDuration || 25;
    $('#input-short-break').value = timer.shortBreakDuration || 5;
    $('#input-long-break').value = timer.longBreakDuration || 15;
    $('#input-long-break-interval').value = timer.longBreakInterval || 4;
  }
}

// 删除确认弹窗
function openDeleteModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  deleteTargetId = id;
  $('#delete-task-title').textContent = `「${task.title}」`;
  openModal(modalDelete);
}

// ========== 标签选择器 ==========
function renderTagSelector(selectedTags) {
  const container = $('#tag-selector');
  container.innerHTML = '';

  allTags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    if (selectedTags.includes(tag)) chip.classList.add('selected');
    if (dailyTags.includes(tag)) chip.classList.add('daily-tag-chip');
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      // 标签选择变更时自动更新任务类型单选
      updateTaskTypeRadio();
    });
    container.appendChild(chip);
  });
}

// 根据当前选中的标签自动切换任务类型单选
function updateTaskTypeRadio() {
  const selected = getSelectedTags();
  const hasDailyTag = selected.some(t => dailyTags.includes(t));
  const radio = document.querySelector(`input[name="task-type"][value="${hasDailyTag ? 'daily' : 'normal'}"]`);
  if (radio) radio.checked = true;
}

function getSelectedTags() {
  const chips = $$('#tag-selector .tag-chip.selected');
  return Array.from(chips).map(c => c.textContent);
}

// ========== 保存任务 ==========
async function saveTaskFromModal() {
  const title = $('#input-title').value.trim();
  if (!title) {
    showToast(i18n.t('alertEmptyTitle'), 'error');
    return;
  }

  const type = document.querySelector('input[name="task-type"]:checked').value;
  const tags = getSelectedTags();
  const deadline = $('#input-deadline').value || null;

  // 构建计时器配置
  const timerMode = document.querySelector('input[name="timer-mode"]:checked').value;
  let timer = null;
  if (timerMode === 'forward') {
    // 编辑时保持已有累计值，添加时初始化为 0
    const existingTask = editingTaskId ? tasks.find(t => t.id === editingTaskId) : null;
    const oldTimer = existingTask ? existingTask.timer : null;
    const keepElapsed = (oldTimer && oldTimer.mode === 'forward') ? (oldTimer.elapsedMs || 0) : 0;
    timer = {
      mode: 'forward',
      elapsedMs: keepElapsed,
      remainingMs: 0,
      workDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      phase: 'work',
      pomodoroCount: 0,
      running: false,
      startedAt: null
    };
  } else if (timerMode === 'pomodoro') {
    const workDuration = parseInt($('#input-work-duration').value, 10) || 25;
    const shortBreakDuration = parseInt($('#input-short-break').value, 10) || 5;
    const longBreakDuration = parseInt($('#input-long-break').value, 10) || 15;
    const longBreakInterval = parseInt($('#input-long-break-interval').value, 10) || 4;
    // 编辑时若模式没变，保留进度；否则重新初始化
    const existingTask = editingTaskId ? tasks.find(t => t.id === editingTaskId) : null;
    const oldTimer = existingTask ? existingTask.timer : null;
    const keepState = (oldTimer && oldTimer.mode === 'pomodoro');
    timer = {
      mode: 'pomodoro',
      elapsedMs: 0,
      remainingMs: keepState ? (oldTimer.remainingMs || 0) : workDuration * 60 * 1000,
      workDuration,
      shortBreakDuration,
      longBreakDuration,
      longBreakInterval,
      phase: keepState ? (oldTimer.phase || 'work') : 'work',
      pomodoroCount: keepState ? (oldTimer.pomodoroCount || 0) : 0,
      running: false,
      startedAt: null
    };
  }

  const taskData = { title, type, tags, deadline, timer };

  if (editingTaskId) {
    await updateTask(editingTaskId, taskData);
  } else {
    await addTask(taskData);
  }

  closeModal(modalTask);
}

// ========== 事件绑定 ==========
function bindEvents() {
  // 添加任务
  $('#btn-add-task').addEventListener('click', openAddModal);

  // 弹窗关闭
  $$('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAllModals();
    });
  });

  // 点击弹窗遮罩关闭
  $$('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAllModals();
    });
  });

  // 保存任务
  $('#btn-save-task').addEventListener('click', saveTaskFromModal);
  $('#btn-cancel-task').addEventListener('click', () => closeModal(modalTask));

  // 回车保存
  $('#input-title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveTaskFromModal();
  });

  // 删除确认
  $('#btn-confirm-delete').addEventListener('click', async () => {
    if (deleteTargetId) {
      await deleteTask(deleteTargetId);
      deleteTargetId = null;
    }
    closeModal(modalDelete);
  });
  $('#btn-cancel-delete').addEventListener('click', () => {
    deleteTargetId = null;
    closeModal(modalDelete);
  });

  // 设置
  $('#btn-settings').addEventListener('click', async () => {
    const settings = await safeCall(() => window.daityAPI.getSettings(), {});
    $('#input-storage-path').value = settings.storagePath || '';
    $('#select-language').value = settings.language || i18n.currentLang;
    $('#input-reset-hour').value = settings.resetHour != null ? settings.resetHour : 4;
    $('#input-reset-minute').value = settings.resetMinute != null ? settings.resetMinute : 0;
    openModal(modalSettings);
  });
  $('#btn-cancel-settings').addEventListener('click', () => closeModal(modalSettings));
  $('#btn-save-settings').addEventListener('click', async () => {
    const newPath = $('#input-storage-path').value.trim();
    const newLang = $('#select-language').value;
    const newResetHour = parseInt($('#input-reset-hour').value, 10);
    const newResetMinute = parseInt($('#input-reset-minute').value, 10);
    let needReload = false;

    // 验证重置时间
    if (isNaN(newResetHour) || newResetHour < 0 || newResetHour > 23 ||
        isNaN(newResetMinute) || newResetMinute < 0 || newResetMinute > 59) {
      showToast('重置时间无效，请输入 0-23 小时、0-59 分钟', 'error');
      return;
    }

    // 构建要保存的设置对象
    const settingsToSave = {};
    if (newPath) {
      settingsToSave.storagePath = newPath;
    }
    settingsToSave.language = newLang;
    settingsToSave.resetHour = newResetHour;
    settingsToSave.resetMinute = newResetMinute;

    // 保存设置
    await safeCall(() => window.daityAPI.saveSettings(settingsToSave));

    // 切换语言
    if (newLang !== i18n.currentLang) {
      i18n.setLang(newLang);
      needReload = true;
    }

    closeModal(modalSettings);

    if (needReload) {
      i18n.apply();
      await loadTasks();
      await loadDailyTags();
      renderTagList();
      renderTasks();
      updateStatusBar();
    }
  });

  // 新建标签
  $('#btn-new-tag').addEventListener('click', () => {
    $('#input-tag-name').value = '';
    $('#input-tag-name').placeholder = i18n.t('inputTagName');
    $('#input-tag-daily').checked = false;
    // 刷新 checkbox 翻译文本
    const dailySpan = $('#modal-new-tag').querySelector('[data-i18n="labelTagDaily"]');
    if (dailySpan) dailySpan.textContent = i18n.t('labelTagDaily');
    openModal(modalNewTag);
    $('#input-tag-name').focus();
  });
  $('#btn-cancel-tag').addEventListener('click', () => closeModal(modalNewTag));
  $('#btn-save-tag').addEventListener('click', async () => {
    const tagName = $('#input-tag-name').value.trim();
    const isDaily = $('#input-tag-daily').checked;

    if (!tagName) {
      showToast(i18n.t('alertEmptyTitle'), 'error');
      return;
    }

    // 检查标签是否已存在于 allTags
    if (allTags.includes(tagName)) {
      // 标签已存在，如果用户勾选了每日重置但标签不在 dailyTags 中，帮用户转换
      if (isDaily && !dailyTags.includes(tagName)) {
        dailyTags.push(tagName);
        await safeCall(() => window.daityAPI.saveDailyTags(dailyTags));
        renderTagList();
        showToast(i18n.t('toastTagConvertedToDaily'), 'success');
      } else {
        showToast(i18n.t('toastTagAlreadyExists'), 'error');
      }
    } else {
      allTags.push(tagName);
      // 如果勾选了每日重置，添加到 dailyTags
      if (isDaily) {
        dailyTags.push(tagName);
        await safeCall(() => window.daityAPI.saveDailyTags(dailyTags));
      }
      renderTagList();
      // 如果标签选择器可见，也更新它
      if (modalTask.classList.contains('show')) {
        renderTagSelector(getSelectedTags());
      }
    }
    closeModal(modalNewTag);
  });
  $('#input-tag-name').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const tagName = $('#input-tag-name').value.trim();
      const isDaily = $('#input-tag-daily').checked;

      if (!tagName) {
        showToast(i18n.t('alertEmptyTitle'), 'error');
        return;
      }

      if (allTags.includes(tagName)) {
        if (isDaily && !dailyTags.includes(tagName)) {
          dailyTags.push(tagName);
          await safeCall(() => window.daityAPI.saveDailyTags(dailyTags));
          renderTagList();
          showToast(i18n.t('toastTagConvertedToDaily'), 'success');
        } else {
          showToast(i18n.t('toastTagAlreadyExists'), 'error');
        }
      } else {
        allTags.push(tagName);
        if (isDaily) {
          dailyTags.push(tagName);
          await safeCall(() => window.daityAPI.saveDailyTags(dailyTags));
        }
        renderTagList();
        if (modalTask.classList.contains('show')) {
          renderTagSelector(getSelectedTags());
        }
      }
      closeModal(modalNewTag);
    }
  });

  // 编辑标签弹窗
  $('#btn-cancel-edit-tag').addEventListener('click', () => {
    editingTagOldName = null;
    closeModal(modalEditTag);
  });
  $('#btn-save-edit-tag').addEventListener('click', saveEditTag);
  $('#input-edit-tag-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveEditTag();
  });

  // 标签筛选点击（通过事件委托在 tag-list 上）
  $('#tag-list').addEventListener('click', (e) => {
    const tagItem = e.target.closest('.tag-item');
    if (tagItem) {
      setFilter(tagItem.dataset.tag);
    }
  });

  // 搜索（带防抖）
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (searchQuery.trim()) {
        currentFilter = 'all';
        renderTagList();
      }
      renderTasks();
    }, 200);
  });

  // 右键菜单项点击
  $$('#tag-context-menu .context-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      handleContextMenuAction(action);
    });
  });

  // 点击任意位置关闭右键菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#tag-context-menu')) {
      hideTagContextMenu();
    }
  });

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    // Ctrl+N 添加任务
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      openAddModal();
    }
    // Escape 关闭弹窗
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });

  // 计时模式切换 → 显示/隐藏番茄钟配置
  document.querySelectorAll('input[name="timer-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      $('#pomodoro-config').style.display = radio.value === 'pomodoro' ? 'block' : 'none';
    });
  });
}

// ========== 工具函数 ==========
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
}

function formatDate(date) {
  const now = new Date();
  const diff = date - now;
  const absDiff = Math.abs(diff);
  const dayMs = 24 * 60 * 60 * 1000;
  const locale = i18n.currentLang === 'zh-CN' ? 'zh-CN' : 'en-US';

  function timeStr(d) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  if (absDiff < dayMs && date.getDate() === now.getDate()) {
    return `${i18n.t('taskDeadlineToday')} ${timeStr(date)}`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.getDate() === tomorrow.getDate() && date.getMonth() === tomorrow.getMonth()) {
    return `${i18n.t('taskDeadlineTomorrow')} ${timeStr(date)}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth()) {
    return `${i18n.t('taskDeadlineYesterday')} ${timeStr(date)}`;
  }

  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ========== 启动 ==========
init();
