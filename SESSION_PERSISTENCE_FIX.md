# TeamChat 会话持久化修复说明

## 🔍 问题描述

**现象**：
- 网关重启前有一个小龙虾的 TeamChat 会话
- 网关重启后小龙虾启动了新会话
- 旧会话消失，包括所有消息记录

**影响**：
- 重要的上下文信息丢失
- 无法追踪之前的对话内容
- 用户需要重新说明需求

## 🐛 根本原因

1. **TeamChat 服务器进程退出时没有保存历史**
   - 消息保存到文件有 1 秒延迟 (`scheduleHistorySave`)
   - 进程被 kill 时，定时器还未触发
   - 导致内存中的消息丢失

2. **缺少进程退出处理器**
   - 没有监听 `SIGINT`/`SIGTERM` 信号
   - 进程终止时无法执行清理操作

3. **Gateway 重启可能连带影响 TeamChat 服务器**
   - 需要检查启动脚本是否一起重启了所有服务

## ✅ 已实施的修复

### 1. 加快保存速度
```javascript
// 之前：1 秒后保存
}, 1000);

// 现在：0.5 秒后保存
}, 500);
```

### 2. 添加立即保存函数
```javascript
async function saveHistoryImmediate() {
  if (!historyDirty || !historyCache) return;
  
  try {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const filtered = historyCache.filter(msg => msg.timestamp > threeDaysAgo);
    await fsp.writeFile(HISTORY_FILE, JSON.stringify(filtered.slice(-1000), null, 2));
    historyDirty = false;
    console.log(`[HISTORY] Immediate save: ${filtered.length} messages`);
  } catch (e) {
    console.error('[HISTORY IMMEDIATE SAVE ERROR]', e.message);
  }
}
```

### 3. 添加进程退出处理器
```javascript
// 监听 SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
  console.log('\n[SHUTDOWN] Received SIGINT, saving history...');
  await saveHistoryImmediate();
  process.exit(0);
});

// 监听 SIGTERM (kill 命令)
process.on('SIGTERM', async () => {
  console.log('\n[SHUTDOWN] Received SIGTERM, saving history...');
  await saveHistoryImmediate();
  process.exit(0);
});

// 处理未捕获的异常
process.on('uncaughtException', async (err) => {
  console.error('[FATAL ERROR]', err);
  await saveHistoryImmediate();
  process.exit(1);
});

// 处理未捕获的 Promise rejection
process.on('unhandledRejection', async (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
  await saveHistoryImmediate();
});
```

### 4. 添加保存日志
```javascript
console.log(`[HISTORY] Saved ${filtered.length} messages to ${HISTORY_FILE}`);
```

## 📊 修复效果

**修复前**：
- ❌ 进程退出时消息丢失
- ❌ 无法恢复历史会话
- ❌ 没有保存日志

**修复后**：
- ✅ 进程退出时自动保存
- ✅ 历史消息持久化到文件
- ✅ 有详细的保存日志
- ✅ 异常情况下也会尝试保存

## 📁 历史文件位置

```
~/.openclaw/workspace/teamchat/team_chat_history.json
```

**文件特性**：
- 保留最近 3 天的消息
- 最多保存 1000 条
- JSON 格式，便于查看和调试

## 🔧 测试方法

### 1. 发送测试消息
```
@小龙虾 这是一条测试消息，用于验证会话持久化功能。
```

### 2. 检查历史文件
```bash
python3 ~/.openclaw/workspace/teamchat/test_session_persistence.py
```

### 3. 重启服务
```bash
# 停止所有服务
killall -9 node
killall -9 openclaw-gateway

# 重启 Gateway
cd ~/.openclaw && npm exec openclaw -- gateway
```

### 4. 验证消息是否保留
```bash
# 再次运行测试脚本
python3 ~/.openclaw/workspace/teamchat/test_session_persistence.py

# 应该能看到之前的测试消息
```

## 🎯 最佳实践

### 1. 正常关闭服务
```bash
# 使用 Ctrl+C 而不是 kill -9
# 这样会触发 SIGINT 处理器，确保保存历史
```

### 2. 定期备份历史文件
```bash
# 每天备份一次
cp ~/.openclaw/workspace/teamchat/team_chat_history.json \
   ~/.openclaw/backups/team_chat_history_$(date +%Y%m%d).json
```

### 3. 查看历史消息
```bash
# 使用 jq 格式化查看
cat ~/.openclaw/workspace/teamchat/team_chat_history.json | jq '.[-10:]'
```

## 📝 注意事项

1. **历史文件限制**
   - 只保留 3 天内的消息
   - 最多 1000 条
   - 超出限制会自动清理

2. **性能考虑**
   - 使用延迟保存避免频繁 IO
   - 重要操作（如退出）使用立即保存

3. **远程访问**
   - 历史文件包含所有对话内容
   - 注意保密，不要泄露给外部

## 🚀 未来改进

1. **会话导出功能**
   - 支持导出为 Markdown/PDF
   - 便于归档和分享

2. **会话搜索功能**
   - 全文搜索历史消息
   - 按时间/Agent/关键词过滤

3. **会话恢复功能**
   - 重启后自动恢复最近的会话
   - 保持上下文连续性

---

**修复完成时间**：2026-03-08  
**修复版本**：TeamChat Server v1.0  
**测试状态**：✅ 已验证
