#!/usr/bin/env python3
"""
测试 TeamChat 会话持久化
"""
import json
import os
from datetime import datetime

HISTORY_FILE = os.path.expanduser('~/.openclaw/workspace/teamchat/team_chat_history.json')

def check_history():
    """检查历史文件"""
    if not os.path.exists(HISTORY_FILE):
        print(f"❌ 历史文件不存在：{HISTORY_FILE}")
        return False
    
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if not isinstance(data, list):
            print(f"❌ 文件格式错误，应该是数组")
            return False
        
        print(f"✅ 历史文件存在")
        print(f"📊 消息总数：{len(data)}")
        
        if len(data) == 0:
            print("⚠️  历史文件为空")
            return True
        
        # 显示最后 5 条消息
        print(f"\n📝 最后 5 条消息:")
        for i, msg in enumerate(data[-5:], 1):
            sender = msg.get('sender', 'N/A')
            text = msg.get('text', '')[:50]
            timestamp = msg.get('timestamp', 0)
            is_user = msg.get('isUser', False)
            
            time_str = datetime.fromtimestamp(timestamp/1000).strftime('%H:%M:%S') if timestamp else 'N/A'
            
            print(f"  {i}. [{time_str}] {'用户' if is_user else sender}: {text}...")
        
        # 检查是否有小龙虾的消息
        lobster_msgs = [m for m in data if m.get('sender') == '小龙虾' or m.get('agentId') == 'main']
        if lobster_msgs:
            print(f"\n✅ 找到 {len(lobster_msgs)} 条小龙虾的消息")
        else:
            print(f"\n⚠️  没有找到小龙虾的消息")
        
        # 检查是否有微拍堂相关的消息
        weipaitang_msgs = [m for m in data if '微拍堂' in m.get('text', '') or 'weipaitang' in m.get('text', '').lower()]
        if weipaitang_msgs:
            print(f"✅ 找到 {len(weipaitang_msgs)} 条微拍堂相关的消息")
        else:
            print("⚠️  没有找到微拍堂相关的消息")
        
        return True
        
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析错误：{e}")
        return False
    except Exception as e:
        print(f"❌ 读取错误：{e}")
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("TeamChat 会话持久化检查")
    print("=" * 60)
    check_history()
