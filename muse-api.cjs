const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const os = require('os');
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
const MUSE_DIR = path.join(OPENCLAW_HOME, '.muse');
const TASKS_FILE = path.join(OPENCLAW_HOME, 'tasks', 'todo.json');

function readTasks() {
    try {
        if (fs.existsSync(TASKS_FILE)) {
            const data = fs.readFileSync(TASKS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Read tasks error:', e);
    }
    return { tasks: [], last_id: 0 };
}

function writeTasks(data) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function findTask(tasks, taskId) {
    return tasks.find(t => t.id === taskId);
}

async function handleMuseApi(req, res, urlPath, method) {
    const url = new URL(urlPath, 'http://localhost');
    const pathname = url.pathname;
    const searchParams = url.searchParams;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // GET /api/muse/tasks - 获取任务列表（支持筛选）
    if (pathname === '/api/muse/tasks' && method === 'GET') {
        try {
            const data = readTasks();
            let tasks = data.tasks || [];

            // 状态筛选
            const status = searchParams.get('status');
            if (status) {
                if (status === 'pending') {
                    tasks = tasks.filter(t => ['pending', 'in_progress', 'scheduled'].includes(t.status));
                } else if (status === 'completed') {
                    tasks = tasks.filter(t => t.status === 'completed');
                } else if (status === 'cancelled') {
                    tasks = tasks.filter(t => t.status === 'cancelled');
                } else {
                    tasks = tasks.filter(t => t.status === status);
                }
            }

            // 关键词搜索
            const q = searchParams.get('q');
            if (q) {
                const query = q.toLowerCase();
                tasks = tasks.filter(t => 
                    t.title.toLowerCase().includes(query) ||
                    (t.description && t.description.toLowerCase().includes(query))
                );
            }

            // 排序
            const sort = searchParams.get('sort') || 'created';
            const order = searchParams.get('order') || 'desc';
            tasks.sort((a, b) => {
                let valA, valB;
                if (sort === 'created') {
                    valA = new Date(a.created).getTime();
                    valB = new Date(b.created).getTime();
                } else if (sort === 'updated') {
                    valA = new Date(a.updated).getTime();
                    valB = new Date(b.updated).getTime();
                } else if (sort === 'priority') {
                    const pMap = { critical: 4, high: 3, medium: 2, low: 1 };
                    valA = pMap[a.priority] || 0;
                    valB = pMap[b.priority] || 0;
                } else if (sort === 'deadline') {
                    valA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
                    valB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
                } else {
                    valA = 0; valB = 0;
                }
                return order === 'desc' ? valB - valA : valA - valB;
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ tasks, total: tasks.length, filters: { status, q, sort, order } }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // POST /api/muse/tasks - 创建任务
    if (pathname === '/api/muse/tasks' && method === 'POST') {
        try {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const input = JSON.parse(body);
                const data = readTasks();
                const lastId = data.last_id || 0;
                const newId = `TASK-${String(lastId + 1).padStart(3, '0')}`;
                const now = new Date().toISOString();

                const newTask = {
                    id: newId,
                    title: input.title || '新任务',
                    status: input.status || 'pending',
                    priority: input.priority || 'medium',
                    complexity: input.complexity || 2,
                    tags: input.tags || [],
                    created: now,
                    updated: now,
                    background: input.background || '',
                    requirements: input.requirements || [],
                    goals: input.goals || [],
                    assignee: input.assignee || '',
                    deadline: input.deadline || '',
                    source: input.source || 'user',
                    agent_name: input.agent_name || '',
                    subtasks: [],
                    activities: [{
                        id: `ACT-${Date.now()}`,
                        action: '创建任务',
                        agent: input.agent_name || '用户',
                        details: `创建任务: ${input.title}`,
                        timestamp: now
                    }],
                    dependencies: input.dependencies || [],
                    dependents: input.dependents || []
                };

                data.tasks.push(newTask);
                data.last_id = lastId + 1;
                writeTasks(data);

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, task: newTask }));
            });
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // GET /api/muse/tasks/:id - 获取任务详情
    const taskIdMatch = pathname.match(/^\/api\/muse\/tasks\/(.+)$/);
    if (taskIdMatch && method === 'GET') {
        const taskId = taskIdMatch[1];
        try {
            const data = readTasks();
            const task = findTask(data.tasks, taskId);
            if (task) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ task }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Task not found' }));
            }
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // PUT /api/muse/tasks/:id - 更新任务
    if (taskIdMatch && method === 'PUT') {
        const taskId = taskIdMatch[1];
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const input = JSON.parse(body);
                const data = readTasks();
                const taskIndex = data.tasks.findIndex(t => t.id === taskId);
                
                if (taskIndex === -1) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Task not found' }));
                    return;
                }

                const task = data.tasks[taskIndex];
                const now = new Date().toISOString();
                const oldStatus = task.status;

                // 更新字段
                if (input.title !== undefined) task.title = input.title;
                if (input.status !== undefined) task.status = input.status;
                if (input.priority !== undefined) task.priority = input.priority;
                if (input.complexity !== undefined) task.complexity = input.complexity;
                if (input.assignee !== undefined) task.assignee = input.assignee;
                if (input.deadline !== undefined) task.deadline = input.deadline;
                if (input.background !== undefined) task.background = input.background;
                if (input.tags !== undefined) task.tags = input.tags;

                task.updated = now;

                // 记录状态变更活动
                if (input.status && input.status !== oldStatus) {
                    task.activities = task.activities || [];
                    task.activities.push({
                        id: `ACT-${Date.now()}`,
                        action: '状态变更',
                        agent: input.agent_name || '用户',
                        details: `${oldStatus} → ${input.status}`,
                        timestamp: now
                    });
                }

                data.tasks[taskIndex] = task;
                writeTasks(data);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, task }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // DELETE /api/muse/tasks/:id - 删除任务
    if (taskIdMatch && method === 'DELETE') {
        const taskId = taskIdMatch[1];
        try {
            const data = readTasks();
            const taskIndex = data.tasks.findIndex(t => t.id === taskId);
            
            if (taskIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Task not found' }));
                return;
            }

            data.tasks.splice(taskIndex, 1);
            writeTasks(data);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // POST /api/muse/tasks/:id/subtasks - 添加子任务
    const subtaskMatch = pathname.match(/^\/api\/muse\/tasks\/(.+)\/subtasks$/);
    if (subtaskMatch && method === 'POST') {
        const taskId = subtaskMatch[1];
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const input = JSON.parse(body);
                const data = readTasks();
                const task = findTask(data.tasks, taskId);
                
                if (!task) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Task not found' }));
                    return;
                }

                task.subtasks = task.subtasks || [];
                const subtaskId = `ST-${Date.now()}`;
                const subtask = {
                    id: subtaskId,
                    title: input.title || '子任务',
                    status: input.status || 'pending',
                    assignee: input.assignee || '',
                    created: new Date().toISOString()
                };
                task.subtasks.push(subtask);

                task.activities = task.activities || [];
                task.activities.push({
                    id: `ACT-${Date.now()}`,
                    action: '添加子任务',
                    agent: input.agent || '用户',
                    details: `添加子任务: ${subtask.title}`,
                    timestamp: new Date().toISOString()
                });

                task.updated = new Date().toISOString();
                writeTasks(data);

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, subtask }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // POST /api/muse/tasks/:id/activities - 记录活动
    const activityMatch = pathname.match(/^\/api\/muse\/tasks\/(.+)\/activities$/);
    if (activityMatch && method === 'POST') {
        const taskId = activityMatch[1];
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const input = JSON.parse(body);
                const data = readTasks();
                const task = findTask(data.tasks, taskId);
                
                if (!task) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Task not found' }));
                    return;
                }

                task.activities = task.activities || [];
                const activity = {
                    id: `ACT-${Date.now()}`,
                    action: input.action || '更新',
                    agent: input.agent || '用户',
                    details: input.details || '',
                    timestamp: new Date().toISOString()
                };
                task.activities.push(activity);
                task.updated = new Date().toISOString();

                writeTasks(data);

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, activity }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // GET /api/muse/memories - 获取记忆列表
    if (pathname === '/api/muse/memories' && method === 'GET') {
        try {
            const MEM0_HOST = 'https://mem0-cnlfjzigaku8gczkzo.mem0.volces.com:8000';
            const MEM0_API_KEY = process.env.MEM0_API_KEY || '';
            
            const response = await fetch(`${MEM0_HOST}/v1/memories/?user_id=openclaw-user&limit=50`, {
                headers: {
                    'Authorization': `Token ${MEM0_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message, results: [] }));
        }
        return;
    }

    // GET /api/muse/test - 测试连接
    if (pathname === '/api/muse/test' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            mem0: 'connected',
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // GET /api/muse/session-history?agent_id=main - 获取 Agent 会话历史
    if (pathname === '/api/muse/session-history' && method === 'GET') {
        try {
            const agentId = searchParams.get('agent_id') || 'main';
            const scriptPath = path.join(MUSE_DIR, 'load-session-history.sh');
            
            const { stdout } = await execAsync(`bash "${scriptPath}" "${agentId}"`);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stdout);
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: e.message, 
                agent_id: searchParams.get('agent_id') || 'main',
                history_count: 0,
                context: []
            }));
        }
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleMuseApi };
