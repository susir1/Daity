const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daityAPI', {
  // 任务操作
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  addTask: (taskData) => ipcRenderer.invoke('add-task', taskData),
  updateTask: (id, updates) => ipcRenderer.invoke('update-task', { id, updates }),
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),

  // 设置操作
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // 标签
  getTags: () => ipcRenderer.invoke('get-tags'),

  // 每日标签管理
  getDailyTags: () => ipcRenderer.invoke('get-daily-tags'),
  saveDailyTags: (tags) => ipcRenderer.invoke('save-daily-tags', tags),

  // 重置时间管理
  getResetTime: () => ipcRenderer.invoke('get-reset-time'),
  saveResetTime: (time) => ipcRenderer.invoke('save-reset-time', time),

  // 每日重置事件监听
  onDailyReset: (callback) => {
    ipcRenderer.on('daily-reset', callback);
    // 返回取消监听的函数
    return () => ipcRenderer.removeListener('daily-reset', callback);
  },

  // 标签管理
  cleanupTag: (tag) => ipcRenderer.invoke('cleanup-tag', tag),
  renameTag: (oldName, newName) => ipcRenderer.invoke('rename-tag', { oldName, newName }),
  toggleTagDaily: (tag, makeDaily) => ipcRenderer.invoke('toggle-tag-daily', { tag, makeDaily }),
  savePinnedTags: (tags) => ipcRenderer.invoke('save-pinned-tags', tags),
  saveTagOrder: (order) => ipcRenderer.invoke('save-tag-order', order),

  // 截止日期检查
  checkDeadlines: () => ipcRenderer.invoke('check-deadlines')
});
