// ========== i18n 国际化 ==========
const i18n = {
  currentLang: 'zh-CN',

  translations: {
    'zh-CN': {
      // 顶部栏
      appTitle: '📋 Daity',
      btnSettings: '⚙️',

      // 侧边栏
      tagFilter: '🏷️ 标签筛选',
      tagAll: '📋 全部任务',
      tagWork: '💼 工作',
      tagStudy: '📚 学习',
      tagLife: '🏠 生活',
      tagHealth: '💪 健康',
      tagOther: '📌 其他',
      tagDaily: '📋 每日总览',
      btnNewTag: '+ 新建标签',
      tagGroupDaily: '📅 每日标签',
      tagGroupNormal: '🏷️ 普通标签',

      // 工具栏
      searchPlaceholder: '搜索任务...',
      btnAddTask: '+ 添加任务',

      // 任务列表
      emptyNoTasks: '还没有任务',
      emptyNoMatch: '没有找到匹配的任务',
      emptyNoTag: '该标签下暂无任务',
      emptyHint: '点击 "+ 添加任务" 开始吧！',
      emptyHintSearch: '尝试其他关键词',

      // 任务项
      taskDeadlineToday: '今天',
      taskDeadlineTomorrow: '明天',
      taskDeadlineYesterday: '昨天',
      taskBadgeDailyComplete: '✅ 每日',
      taskBadgeDailyIncomplete: '🔄 每日',
      taskTooltipEdit: '编辑',
      taskTooltipDelete: '删除',
      taskTooltipCancelDaily: '取消每日',

      // 状态栏
      statusPending: '⏳ {count} 个待完成',
      statusDaily: '🔄 {count} 个每日任务',
      statusTotal: '📊 共 {count} 个任务',

      // 添加/编辑任务弹窗
      modalAddTitle: '添加任务',
      modalEditTitle: '编辑任务',
      inputTitle: '任务标题',
      taskTypeNormal: '普通任务',
      taskTypeDaily: '🔄 每日任务',
      labelTag: '🏷️ 标签',
      inputNewTag: '输入新标签名称...',
      labelDeadline: '📅 截止日期',
      btnCancel: '取消',
      btnSave: '保存',
      alertEmptyTitle: '请输入任务标题',

      // 删除弹窗
      modalDeleteTitle: '确认删除',
      deleteConfirm: '确定要删除这个任务吗？',
      deleteHint: '此操作不可撤销',
      btnDelete: '删除',

      // 设置弹窗
      modalSettingsTitle: '⚙️ 设置',
      labelStoragePath: '📁 数据存储路径',
      labelLanguage: '🌐 界面语言',
      labelResetTime: '⏰ 每日重置时间',
      hintResetTime: '到达此时间后每日任务自动重置为未完成',
      btnBrowse: '浏览...',
      btnSaveSettings: '保存设置',
      hintStoragePath: '修改后数据将自动迁移到新路径',

      // 新建标签弹窗
      modalNewTagTitle: '新建标签',
      inputTagName: '输入标签名称',
      labelTagDaily: '🔄 每日重置（该标签下的任务每天自动重置为未完成）',
      btnCreate: '创建',

      // 编辑标签弹窗
      modalEditTagTitle: '编辑标签',
      btnSaveTag: '保存修改',

      // 标签操作提示
      tagPin: '置顶',
      tagUnpin: '取消置顶',
      tagEditLabel: '编辑标签',
      tagDragHandle: '拖动排序',
      dragErrorCrossGroup: '不能将标签拖到不同分组',
      dragErrorDailyToNormal: '不能将每日标签拖到普通分组',
      dragErrorNormalToDaily: '不能将普通标签拖到每日分组',

      // 语言选项
      langZhCN: '中文',
      langEnUS: 'English',

      // Toast / 错误提示
      toastError: '操作失败，请重试',
    },

    'en-US': {
      // Top bar
      appTitle: '📋 Daity',
      btnSettings: '⚙️',

      // Sidebar
      tagFilter: '🏷️ Filter by Tag',
      tagAll: '📋 All Tasks',
      tagWork: '💼 Work',
      tagStudy: '📚 Study',
      tagLife: '🏠 Life',
      tagHealth: '💪 Health',
      tagOther: '📌 Other',
      tagDaily: '📋 Daily Overview',
      btnNewTag: '+ New Tag',
      tagGroupDaily: '📅 Daily Tags',
      tagGroupNormal: '🏷️ Normal Tags',

      // Toolbar
      searchPlaceholder: 'Search tasks...',
      btnAddTask: '+ Add Task',

      // Task list
      emptyNoTasks: 'No tasks yet',
      emptyNoMatch: 'No matching tasks',
      emptyNoTag: 'No tasks with this tag',
      emptyHint: 'Click "+ Add Task" to get started!',
      emptyHintSearch: 'Try another keyword',

      // Task items
      taskDeadlineToday: 'Today',
      taskDeadlineTomorrow: 'Tomorrow',
      taskDeadlineYesterday: 'Yesterday',
      taskBadgeDailyComplete: '✅ Daily',
      taskBadgeDailyIncomplete: '🔄 Daily',
      taskTooltipEdit: 'Edit',
      taskTooltipDelete: 'Delete',
      taskTooltipCancelDaily: 'Unmark Daily',

      // Status bar
      statusPending: '⏳ {count} pending',
      statusDaily: '🔄 {count} daily',
      statusTotal: '📊 {count} total',

      // Add/Edit task modal
      modalAddTitle: 'Add Task',
      modalEditTitle: 'Edit Task',
      inputTitle: 'Task title',
      taskTypeNormal: 'Normal Task',
      taskTypeDaily: '🔄 Daily Task',
      labelTag: '🏷️ Tag',
      inputNewTag: 'Enter new tag name...',
      labelDeadline: '📅 Deadline',
      btnCancel: 'Cancel',
      btnSave: 'Save',
      alertEmptyTitle: 'Please enter a task title',

      // Delete modal
      modalDeleteTitle: 'Confirm Delete',
      deleteConfirm: 'Are you sure you want to delete this task?',
      deleteHint: 'This action cannot be undone',
      btnDelete: 'Delete',

      // Settings modal
      modalSettingsTitle: '⚙️ Settings',
      labelStoragePath: '📁 Storage Path',
      labelLanguage: '🌐 Language',
      labelResetTime: '⏰ Daily Reset Time',
      hintResetTime: 'Daily tasks auto-reset after this time',
      btnBrowse: 'Browse...',
      btnSaveSettings: 'Save Settings',
      hintStoragePath: 'Data will be migrated to the new path',

      // New tag modal
      modalNewTagTitle: 'New Tag',
      inputTagName: 'Enter tag name',
      labelTagDaily: '🔄 Daily Reset (tasks with this tag auto-reset daily)',
      btnCreate: 'Create',

      // Edit tag modal
      modalEditTagTitle: 'Edit Tag',
      btnSaveTag: 'Save Changes',

      // Tag actions
      tagPin: 'Pin to top',
      tagUnpin: 'Unpin',
      tagEditLabel: 'Edit tag',
      tagDragHandle: 'Drag to reorder',
      dragErrorCrossGroup: 'Cannot drag tag to a different group',
      dragErrorDailyToNormal: 'Cannot drag daily tag to normal group',
      dragErrorNormalToDaily: 'Cannot drag normal tag to daily group',

      // Language options
      langZhCN: '中文',
      langEnUS: 'English',

      // Toast / error
      toastError: 'Operation failed, please retry',
    }
  },

  // 获取翻译文本
  t(key, replacements = {}) {
    let text = this.translations[this.currentLang][key] || this.translations['zh-CN'][key] || key;
    Object.entries(replacements).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v);
    });
    return text;
  },

  // 切换语言
  setLang(lang) {
    if (this.translations[lang]) {
      this.currentLang = lang;
    }
  },

  // 应用翻译到页面
  apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (el.tagName === 'OPTION') {
        el.textContent = this.t(key);
      } else if (el.tagName === 'INPUT' && el.type === 'text') {
        el.placeholder = this.t(key);
      } else if (el.tagName === 'INPUT' && el.type === 'datetime-local') {
        // datetime input - skip
      } else if (el.dataset.i18nAttr === 'placeholder') {
        el.placeholder = this.t(key);
      } else if (el.dataset.i18nAttr === 'title') {
        el.title = this.t(key);
      } else if (el.dataset.i18nAttr === 'skip') {
        // 跳过——由 JS 用 t(key, replacements) 动态更新
      } else {
        el.textContent = this.t(key);
      }
    });
  }
};

window.i18n = i18n;
