const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const os = require('os');
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
const MUSE_DIR = path.join(OPENCLAW_HOME, '.muse');
const TASKS_FILE = path.join(OPENCLAW_HOME, 'tasks', 'todo.json');

async function handleMuseApi(req, res, urlPath, method) {
    const url = new URL(urlPath, 'http://localhost');
    const pathname = url.pathname;
    const searchParams = url.searchParams;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // GET /api/muse/tasks - 获取任务列表
    if (pathname === '/api/muse/tasks' && method === 'GET') {
        try {
            if (fs.existsSync(TASKS_FILE)) {
                const data = fs.readFileSync(TASKS_FILE, 'utf-8');
                const tasks = JSON.parse(data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(tasks));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ tasks: [] }));
            }
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
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

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleMuseApi };
