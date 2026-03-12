#!/bin/bash
# Team Chat 头像监控脚本
# 自动检测新增头像并压缩

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGES_DIR="$SCRIPT_DIR/images"
COMPRESSED_DIR="$SCRIPT_DIR/images/compressed"

# 压缩参数
MAX_WIDTH=200
JPEG_QUALITY=75
MAX_FILE_SIZE=30  # KB

# 压缩单个文件
compress_avatar() {
    local input="$1"
    local filename=$(basename "$input")
    local name="${filename%.*}"
    local output="$COMPRESSED_DIR/${name}_compressed.jpg"

    # 如果已存在且比原文件新，则跳过
    if [ -f "$output" ] && [ "$output" -nt "$input" ]; then
        return 0
    fi

    echo "📸 压缩: $filename"

    # 获取原始文件大小
    local original_size=$(stat -f%z "$input" 2>/dev/null || stat -c%s "$input" 2>/dev/null)
    local original_kb=$((original_size / 1024))

    # 第一步: 调整尺寸
    sips -Z $MAX_WIDTH "$input" --out "$output" > /dev/null 2>&1

    # 第二步: 设置 JPEG 质量
    sips -s format jpeg -s formatOptions $JPEG_QUALITY "$output" --out "$output" > /dev/null 2>&1

    # 第三步: 如果仍然太大，进一步压缩
    local compressed_size=$(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null)
    local compressed_kb=$((compressed_size / 1024))

    if [ $compressed_kb -gt $MAX_FILE_SIZE ]; then
        sips -s formatOptions 60 "$output" --out "$output" > /dev/null 2>&1
        compressed_size=$(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null)
        compressed_kb=$((compressed_size / 1024))
    fi

    # 计算压缩率
    local ratio=$(echo "scale=1; (1 - $compressed_size / $original_size) * 100" | bc)

    echo "   ✅ ${original_kb}KB → ${compressed_kb}KB (减少 ${ratio}%)"
}

# 检查所有头像
check_all() {
    echo "🔍 检查所有头像..."
    mkdir -p "$COMPRESSED_DIR"

    local total=0
    local compressed=0

    for img in "$IMAGES_DIR"/*.{png,jpg,jpeg,PNG,JPG,JPEG}; do
        [ -e "$img" ] || continue
        total=$((total + 1))

        if compress_avatar "$img"; then
            compressed=$((compressed + 1))
        fi
    done

    echo ""
    echo "📊 检查完成: $total 个文件, $compressed 个已处理"
}

# 监控模式 (使用 fswatch)
watch_mode() {
    if ! command -v fswatch &> /dev/null; then
        echo "❌ 需要安装 fswatch: brew install fswatch"
        exit 1
    fi

    echo "👀 启动监控模式..."
    echo "   监控目录: $IMAGES_DIR"
    echo "   按 Ctrl+C 停止"
    echo ""

    fswatch -o "$IMAGES_DIR" | while read f; do
        echo "📝 检测到文件变化，开始处理..."
        check_all
        echo ""
    done
}

# 主逻辑
case "${1:-check}" in
    check)
        check_all
        ;;
    watch)
        watch_mode
        ;;
    compress)
        shift
        if [ -f "$1" ]; then
            mkdir -p "$COMPRESSED_DIR"
            compress_avatar "$1"
        else
            echo "❌ 文件不存在: $1"
            exit 1
        fi
        ;;
    *)
        echo "用法: $0 [check|watch|compress <文件>]"
        echo ""
        echo "命令:"
        echo "  check              检查并压缩所有头像 (默认)"
        echo "  watch              监控模式，自动处理新增头像"
        echo "  compress <文件>    压缩单个文件"
        exit 1
        ;;
esac
