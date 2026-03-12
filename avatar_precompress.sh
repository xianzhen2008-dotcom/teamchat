#!/bin/bash
# Team Chat 头像预压缩方案
# 解决 index 页面头像加载慢的问题

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGES_DIR="$SCRIPT_DIR/images"
COMPRESSED_DIR="$SCRIPT_DIR/images/compressed"

# 压缩参数
MAX_WIDTH=200
JPEG_QUALITY=75
MAX_FILE_SIZE=30  # KB

echo "🚀 启动头像预压缩方案..."
echo "================================"

# 创建压缩目录
mkdir -p "$COMPRESSED_DIR"

# 检查是否安装了必要的工具
if ! command -v sips &> /dev/null; then
    echo "❌ 错误: 需要 macOS 的 sips 工具"
    exit 1
fi

# 统计信息
TOTAL=0
COMPRESSED=0
SKIPPED=0

# 遍历所有图片
for img in "$IMAGES_DIR"/*.{png,jpg,jpeg,PNG,JPG,JPEG}; do
    [ -e "$img" ] || continue

    filename=$(basename "$img")
    name="${filename%.*}"
    ext="${filename##*.}"
    output="$COMPRESSED_DIR/${name}_compressed.jpg"

    TOTAL=$((TOTAL + 1))

    # 如果已存在且比原文件新，则跳过
    if [ -f "$output" ] && [ "$output" -nt "$img" ]; then
        echo "⏭️  跳过 (已压缩): $filename"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    echo "📸 压缩: $filename"

    # 获取原始文件大小
    original_size=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null)
    original_kb=$((original_size / 1024))

    # 第一步: 调整尺寸
    sips -Z $MAX_WIDTH "$img" --out "$output" > /dev/null 2>&1

    # 第二步: 设置 JPEG 质量
    sips -s format jpeg -s formatOptions $JPEG_QUALITY "$output" --out "$output" > /dev/null 2>&1

    # 第三步: 如果仍然太大，进一步压缩
    compressed_size=$(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null)
    compressed_kb=$((compressed_size / 1024))

    if [ $compressed_kb -gt $MAX_FILE_SIZE ]; then
        echo "   📦 文件仍较大 (${compressed_kb}KB)，进一步压缩..."
        sips -s formatOptions 60 "$output" --out "$output" > /dev/null 2>&1
        compressed_size=$(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null)
        compressed_kb=$((compressed_size / 1024))
    fi

    # 计算压缩率
    ratio=$(echo "scale=1; (1 - $compressed_size / $original_size) * 100" | bc)

    echo "   ✅ ${original_kb}KB → ${compressed_kb}KB (减少 ${ratio}%)"
    COMPRESSED=$((COMPRESSED + 1))
done

echo ""
echo "================================"
echo "📊 压缩统计:"
echo "   总计: $TOTAL 个文件"
echo "   新压缩: $COMPRESSED 个"
echo "   跳过: $SKIPPED 个"
echo ""
echo "💡 使用方式:"
echo "   原图: images/xxx.png"
echo "   压缩图: images/compressed/xxx_compressed.jpg"
echo "================================"

# 生成压缩后的头像映射文件
echo "📝 生成头像映射配置..."
cat > "$SCRIPT_DIR/avatar-config.json" << EOF
{
  "version": "1.0",
  "generatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "compression": {
    "maxWidth": $MAX_WIDTH,
    "quality": $JPEG_QUALITY,
    "maxFileSizeKB": $MAX_FILE_SIZE
  },
  "avatars": {
$(for img in "$COMPRESSED_DIR"/*_compressed.jpg; do
    [ -e "$img" ] || continue
    name=$(basename "$img" "_compressed.jpg")
    size=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null)
    size_kb=$((size / 1024))
    echo "    \"$name\": {"
    echo "      \"original\": \"images/${name}.png\","
    echo "      \"compressed\": \"images/compressed/${name}_compressed.jpg\","
    echo "      \"sizeKB\": $size_kb"
    echo "    },"
done | sed '$ s/,$//')
  }
}
EOF

echo "✅ 配置已保存到: avatar-config.json"
