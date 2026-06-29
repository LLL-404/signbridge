#!/usr/bin/env bash
# @file reindex-codegraph.sh
# @description 重建/同步 CodeGraph L2 符号级知识图谱索引
#
# 使用场景：
#   - 新环境/沙箱重置后重建索引（codegraph.db 不入库）
#   - 大量代码变动后强制全量重建
#   - CI / 新同事 onboarding 一键初始化
#
# 用法：
#   ./scripts/reindex-codegraph.sh          # 优先 sync，未初始化则 init
#   ./scripts/reindex-codegraph.sh --full   # 强制全量重建（删除旧索引后 init）
#   ./scripts/reindex-codegraph.sh --status # 仅查看索引状态
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v codegraph >/dev/null 2>&1; then
  echo "✗ codegraph CLI 未安装，请先运行：npm i -g @colbymchenry/codegraph" >&2
  exit 1
fi

MODE="${1:-auto}"

echo "=== CodeGraph 索引维护 ==="
echo "项目根目录: $PROJECT_ROOT"
echo ""

case "$MODE" in
  --status)
    codegraph status
    ;;
  --full)
    echo "● 强制全量重建（删除旧索引后 init）..."
    if [ -d .codegraph ]; then
      rm -rf .codegraph
      echo "  旧索引已删除"
    fi
    CODEGRAPH_TELEMETRY=0 codegraph init
    echo ""
    echo "✓ 全量重建完成"
    codegraph status
    ;;
  auto|--sync|*)
    if [ -f .codegraph/codegraph.db ]; then
      echo "● 增量同步（codegraph sync）..."
      CODEGRAPH_TELEMETRY=0 codegraph sync 2>/dev/null || {
        echo "  sync 失败（可能是版本升级后 schema 不兼容），回退到全量重建..."
        rm -rf .codegraph
        CODEGRAPH_TELEMETRY=0 codegraph init
      }
    else
      echo "● 首次初始化（codegraph init）..."
      CODEGRAPH_TELEMETRY=0 codegraph init
    fi
    echo ""
    echo "✓ 索引就绪"
    codegraph status
    ;;
esac

echo ""
echo "提示："
echo "  - 查询符号：codegraph explore <符号名>"
echo "  - 调用者：  codegraph callers <符号名>"
echo "  - 影响面：  codegraph impact <符号名>"
echo "  - TRAE IDE 中通过 MCP 自动调用（.trae/mcp.json 已配置）"
