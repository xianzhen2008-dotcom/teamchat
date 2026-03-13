const fs = require('fs');
const md = fs.readFileSync('./teamchat-history.md', 'utf8');

const messages = [];
const blocks = md.split('## ');

for (const block of blocks) {
  if (!block.trim() || block.startsWith('# TeamChat')) continue;
  
  const lines = block.split('\n');
  const firstLine = lines[0].trim();
  const senderMatch = firstLine.match(/^(.*?) - (.*)$/);
  
  if (!senderMatch) continue;
  
  const sender = senderMatch[1].trim();
  const timeStr = senderMatch[2].trim();
  const timestamp = new Date(timeStr).getTime();
  
  let text = lines.slice(1).join('\n').replace(/^---$/gm, '').trim();
  if (!text) continue;
  
  messages.push({ sender, text, timestamp });
}

console.log('解析到消息数:', messages.length);

const historyFile = './team_chat_history.json';
let existing = [];
try {
  existing = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
} catch(e) {}

console.log('现有消息数:', existing.length);

const seen = new Set();
const all = [...existing];
for (const m of messages) {
  const key = m.sender + '|' + m.text + '|' + m.timestamp;
  if (!seen.has(key)) {
    seen.add(key);
    all.push(m);
  }
}

all.sort((a, b) => a.timestamp - b.timestamp);

fs.writeFileSync(historyFile, JSON.stringify(all, null, 2));
console.log('合并后总数:', all.length);
