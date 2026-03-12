# TeamChat 开源化发布指南

## 当前状态

✅ **已完成**
- [x] 代码清理（移除日志、临时文件、备份）
- [x] 依赖整理（package.json 完善）
- [x] 开源文档（README 中英双语）
- [x] Git 仓库初始化和首次提交
- [x] .npmignore 配置

⏳ **待完成**
- [ ] 创建 GitHub 仓库
- [ ] 推送到远程
- [ ] 提交 OpenClaw 官方 PR

---

## 快速开始（本地测试）

```bash
cd ~/.openclaw/workspace/teamchat

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 或启动生产服务器
npm start
```

---

## 手动推送到 GitHub

由于当前环境无法自动创建 GitHub 仓库，请手动执行以下步骤：

### 1. 在 GitHub 创建仓库

访问 https://github.com/new 创建新仓库：
- Repository name: `teamchat`
- Description: `TeamChat - AI Agent 协作平台 | Web-based Multi-Agent Collaboration Platform for OpenClaw`
- Visibility: **Public**
- **不要**勾选 "Add a README file"
- **不要**勾选 "Add .gitignore"

### 2. 推送代码

在本地执行：

```bash
cd ~/.openclaw/workspace/teamchat

# 添加远程仓库（替换 YOUR_USERNAME 为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/teamchat.git

# 推送代码
git push -u origin main
```

### 3. Fork OpenClaw 官方仓库

1. 访问 https://github.com/openclawopenclaw/teamchat（或搜索 OpenClaw teamchat）
2. 点击 "Fork" 按钮创建分支
3. 添加上游仓库：
   ```bash
   git remote add upstream https://github.com/openclawopenclaw/teamchat.git
   ```

### 4. 提交 PR

```bash
# 创建功能分支
git checkout -b feat/add-teamchat-to-openclaw

# 推送到你的 fork
git push origin feat/add-teamchat-to-openclaw

# 在 GitHub 上创建 Pull Request
```

---

## 项目结构

```
teamchat/
├── index.html              # 主页面
├── team_chat_server.cjs    # 后端服务器
├── package.json            # 项目配置
├── vite.config.js          # Vite 配置
├── README.md               # 项目文档
├── LICENSE                 # MIT 许可证
├── .gitignore              # Git 忽略配置
├── .npmignore              # npm 发布忽略配置
├── assets/                 # 前端资源
│   ├── css/               # 样式文件
│   └── js/                # JavaScript 模块
├── public/                 # 静态资源
├── images/                 # 图片资源
├── scripts/                # 脚本文件
├── backups/                # 备份（已忽略）
└── node_modules/           # 依赖（已忽略）
```

---

## 开源协议

本项目使用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

## 后续工作

- [ ] 配置 GitHub Actions 自动构建
- [ ] 添加 CI/CD 流程
- [ ] 发布 npm 包
- [ ] 完善测试覆盖
