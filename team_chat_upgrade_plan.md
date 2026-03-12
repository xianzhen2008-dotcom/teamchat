# Team Chat 升级优化计划

## 问题清单

### P0 - 紧急问题
1. **工作看板日志功能** - 显示Agent运行日志（工具调用、思考过程）
   - 需要后端API支持读取Agent会话日志
   - 前端展示Markdown格式的详细日志
   - 支持点击头像进入详细日志页面

2. **任务中断问题** - 检查为什么任务不能持续执行
   - 检查WebSocket连接稳定性
   - 检查超时配置
   - 检查错误处理逻辑

3. **消息重复显示问题** - 小龙虾消息重复
   - 检查消息去重逻辑
   - 检查WebSocket消息处理

### P1 - 重要功能
4. **远程模式文件上传** - 完善进度显示和错误处理
   - 显示上传进度百分比
   - 显示上传失败原因
   - 支持重试

5. **系统消息优化** - 减少不必要的系统通知
   - 使用Toast替代部分系统消息
   - 合并相似通知
   - 添加消息频率限制

6. **头像缓存优化** - 减少刷新时的重新加载
   - 实现本地缓存
   - 使用Service Worker

### P2 - 体验优化
7. **移动端UI美化** - 优化移动端显示效果
   - 调整间距和字体大小
   - 优化触摸交互
   - 适配不同屏幕尺寸

8. **消息搜索功能** - 支持搜索历史消息
   - 添加搜索框
   - 支持关键词高亮
   - 支持按时间范围筛选

## 任务分工

### 小前 (frontend) - 前端UI专家
- [ ] 移动端UI美化
- [ ] 消息搜索功能UI
- [ ] 头像缓存优化（前端部分）

### 小后 (backend) - 后端API专家
- [ ] 工作看板日志API（读取Agent会话日志）
- [ ] 文件上传进度API
- [ ] 消息搜索API

### 小运 (devops) - 运维和稳定性
- [ ] 任务中断问题排查
- [ ] WebSocket连接稳定性优化
- [ ] 错误监控和告警

### 小移 (mobile) - 移动端专家
- [ ] 移动端UI适配
- [ ] 触摸交互优化
- [ ] 移动端性能优化

### 小测 (qa) - 测试验证
- [ ] 功能测试
- [ ] 性能测试
- [ ] 兼容性测试

## 执行计划

### 阶段1：紧急问题修复（1-2天）
- 工作看板日志功能
- 任务中断问题
- 消息重复显示问题

### 阶段2：重要功能完善（2-3天）
- 远程模式文件上传
- 系统消息优化
- 头像缓存优化

### 阶段3：体验优化（2-3天）
- 移动端UI美化
- 消息搜索功能

## Swarm任务分配

```javascript
const swarmTask = require('./lib/swarm-task');

// 注册Worker
swarmTask.registerWorker('frontend', ['ui', 'css', 'react', 'mobile']);
swarmTask.registerWorker('backend', ['api', 'database', 'nodejs']);
swarmTask.registerWorker('devops', ['deploy', 'monitor', 'websocket']);
swarmTask.registerWorker('mobile', ['ios', 'android', 'responsive']);
swarmTask.registerWorker('qa', ['test', 'automation', 'performance']);

// 创建任务
swarmTask.createTask('work-log-api', async () => {
  // 后端：工作看板日志API
}, { requiredCapabilities: ['api'], priority: 10 });

swarmTask.createTask('task-interrupt-fix', async () => {
  // 运维：任务中断问题排查
}, { requiredCapabilities: ['websocket'], priority: 10 });

swarmTask.createTask('message-dedup', async () => {
  // 后端：消息去重逻辑
}, { requiredCapabilities: ['api'], priority: 10 });

swarmTask.createTask('file-upload-progress', async () => {
  // 后端：文件上传进度API
}, { requiredCapabilities: ['api'], priority: 8 });

swarmTask.createTask('system-message-opt', async () => {
  // 前端：系统消息优化
}, { requiredCapabilities: ['ui'], priority: 7 });

swarmTask.createTask('avatar-cache', async () => {
  // 前端：头像缓存优化
}, { requiredCapabilities: ['ui'], priority: 6 });

swarmTask.createTask('mobile-ui', async () => {
  // 移动端：UI美化
}, { requiredCapabilities: ['responsive'], priority: 5 });

swarmTask.createTask('message-search', async () => {
  // 全栈：消息搜索功能
}, { requiredCapabilities: ['ui', 'api'], priority: 4 });

// 执行任务
await swarmTask.runAll();
```

## 验收标准

### 工作看板日志
- ✅ 显示Agent运行日志（工具调用、思考过程）
- ✅ 支持Markdown格式
- ✅ 点击头像进入详细日志页面

### 任务中断问题
- ✅ 任务能够持续执行直到完成
- ✅ WebSocket连接稳定
- ✅ 错误能够自动恢复

### 消息重复显示
- ✅ 消息不会重复显示
- ✅ 消息顺序正确

### 文件上传
- ✅ 显示上传进度百分比
- ✅ 显示上传失败原因
- ✅ 支持重试

### 系统消息
- ✅ 减少不必要的系统通知
- ✅ 使用Toast替代部分系统消息

### 移动端UI
- ✅ 在不同屏幕尺寸下显示正常
- ✅ 触摸交互流畅
- ✅ 性能良好
