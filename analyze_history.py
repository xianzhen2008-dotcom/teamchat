import json
from collections import Counter

with open('/Users/wusiwei/.openclaw/workspace/teamchat/team_chat_history.json', 'r') as f:
    data = json.load(f)

print('总消息数:', len(data))

# 模拟前端的去重逻辑
keys = []
for msg in data:
    key = f"{msg.get('timestamp')}-{msg.get('sender')}-{msg.get('text', '')[:100]}"
    keys.append(key)

key_counter = Counter(keys)
dups = [(k, cnt) for k, cnt in key_counter.items() if cnt > 1]
print('使用前端去重逻辑，重复 key 数量:', len(dups))
if dups:
    print('\n重复的消息:')
    for k, cnt in dups[:10]:
        print(f'  Key: {k[:80]}...')
        print(f'  重复次数: {cnt}')

# 检查服务器端去重逻辑
# 服务器端: 5秒内相同发送者+相同内容不重复添加
server_dups = 0
for i, msg in enumerate(data):
    for j in range(max(0, i-10), i):
        other = data[j]
        if (msg.get('sender') == other.get('sender') and 
            msg.get('text') == other.get('text') and 
            abs(msg.get('timestamp', 0) - other.get('timestamp', 0)) < 5000):
            server_dups += 1
            break

print(f'\n服务器端去重逻辑会过滤的消息数: {server_dups}')

# 检查消息是否有 deleted 标记
deleted = [m for m in data if m.get('deleted')]
print(f'已删除的消息数: {len(deleted)}')

# 检查最近的消息
print('\n最近10条消息:')
for m in data[-10:]:
    print(f"  {m.get('timestamp')} - {m.get('sender', '?')}: {m.get('text', '?')[:50]}...")
