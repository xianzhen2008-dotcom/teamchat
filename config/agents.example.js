// 自定义角色配置
// 复制为 config/agents.js 并修改为自己的角色
export const AGENTS = [
  { 
    id: 'main', 
    agentId: 'main', 
    name: '主 Agent', 
    role: '总助', 
    color: 'var(--cyber-red)', 
    img: 'agent-default.png' 
  },
  { 
    id: 'dev', 
    agentId: 'dev', 
    name: '开发 Agent', 
    role: '开发', 
    color: 'var(--cyber-purple)', 
    img: 'agent-default.png' 
  },
  { 
    id: 'mail', 
    agentId: 'mail', 
    name: '邮件 Agent', 
    role: '商务', 
    color: '#e3b341', 
    img: 'agent-default.png' 
  },
  { 
    id: 'data', 
    agentId: 'data', 
    name: '数据 Agent', 
    role: '数据分析', 
    color: '#388bfd', 
    img: 'agent-default.png' 
  }
];
