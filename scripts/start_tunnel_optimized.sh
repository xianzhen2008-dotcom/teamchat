#!/bin/bash

# TeamChat Tunnel 优化启动脚本
# 目标：提升连接速度和稳定性

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
LOG_FILE="$OPENCLAW_HOME/logs/tunnel_team_chat.log"
PID_FILE="$OPENCLAW_HOME/logs/tunnel_team_chat.pid"

# 停止旧的 Tunnel 进程
echo "=== 停止旧的 Tunnel 进程 ==="
pkill -f "cloudflared.*18788" 2>/dev/null || true
sleep 2

# 清理日志
echo "=== 清理旧日志 ==="
if [ -f "$LOG_FILE" ]; then
    mv "$LOG_FILE" "$LOG_FILE.old"
fi

# 启动优化的 Tunnel
echo "=== 启动优化的 Tunnel ==="
nohup cloudflared tunnel \
    --url http://127.0.0.1:18788 \
    --logfile "$LOG_FILE" \
    --loglevel info \
    --protocol auto \
    --edge-ip-version auto \
    --grace-period 30s \
    --heartbeat-interval 30s \
    --heartbeat-timeout 90s \
    > /dev/null 2>&1 &

TUNNEL_PID=$!
echo $TUNNEL_PID > "$PID_FILE"

echo "✓ Tunnel 已启动 (PID: $TUNNEL_PID)"
echo "✓ 日志文件: $LOG_FILE"

# 等待 Tunnel 启动
echo "=== 等待 Tunnel 启动 ==="
sleep 5

# 检查启动状态
if ps -p $TUNNEL_PID > /dev/null 2>&1; then
    echo "✓ Tunnel 进程运行正常"
    
    # 提取 Tunnel URL
    echo "=== 提取 Tunnel URL ==="
    URL=$(grep -o "https://[a-zA-Z0-9.-]*\.trycloudflare\.com" "$LOG_FILE" | tail -1)
    
    if [ -n "$URL" ]; then
        echo "✓ Tunnel URL: $URL"
        
        # 保存 URL 到文件
        echo "$URL" > "$OPENCLAW_HOME/logs/tunnel_url.txt"
        
        # 发送通知到企业微信
        if [ -f "$OPENCLAW_HOME/workspace/teamchat/wecom_notify.sh" ]; then
            "$OPENCLAW_HOME/workspace/teamchat/wecom_notify.sh" "🌐 TeamChat Tunnel 已重启\n远程访问：$URL"
        fi
    else
        echo "⚠️  未找到 Tunnel URL，请检查日志"
    fi
else
    echo "❌ Tunnel 进程启动失败"
    echo "=== 查看错误日志 ==="
    tail -20 "$LOG_FILE"
    exit 1
fi

echo ""
echo "=== Tunnel 优化参数 ==="
echo "- 协议: auto (自动选择最佳协议)"
echo "- Edge IP: auto (自动选择 IPv4/IPv6)"
echo "- 优雅关闭: 30s"
echo "- 心跳间隔: 30s"
echo "- 心跳超时: 90s"
