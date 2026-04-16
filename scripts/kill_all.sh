#!/bin/bash
# kill_all.sh — 安全杀死 open_multiwindow.sh 启动的所有进程
# 用法: 在 open_multiwindow.sh 开头调用本脚本，保证进程唯一性

TIMEOUT=5  # SIGTERM 后等待秒数，超时则 SIGKILL

# 需要匹配的进程模式列表
PATTERNS=(
    "meta_base src.api:AstribotNavigation"
    "meta_base src.api:Localization"
    "meta_base src.api:SalesReplay"
    "webots_mecanum.launch.py"
    "main.py"
    "astribot_simulation.py"
)

kill_by_pattern() {
    local pattern="$1"
    # 排除 grep 自身和本脚本
    local pids
    pids=$(pgrep -f "$pattern" | grep -v "$$")

    if [ -z "$pids" ]; then
        return
    fi

    echo "[kill_all] 发现匹配 '$pattern' 的进程: $pids"

    # 先发 SIGTERM，让进程优雅退出
    for pid in $pids; do
        kill -TERM "$pid" 2>/dev/null
    done

    # 等待进程退出，超时则强杀
    local waited=0
    while [ $waited -lt $TIMEOUT ]; do
        local alive=""
        for pid in $pids; do
            if kill -0 "$pid" 2>/dev/null; then
                alive="$alive $pid"
            fi
        done
        if [ -z "$alive" ]; then
            echo "[kill_all] '$pattern' 所有进程已退出"
            return
        fi
        sleep 1
        waited=$((waited + 1))
    done

    # 超时，SIGKILL 强杀
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "[kill_all] 进程 $pid 超时未退出，强制杀死"
            kill -9 "$pid" 2>/dev/null
        fi
    done
}

echo "[kill_all] 开始清理旧进程..."

for pattern in "${PATTERNS[@]}"; do
    kill_by_pattern "$pattern"
done

# 关闭 terminator 窗口
pkill -f "terminator" 2>/dev/null

echo "[kill_all] 清理完成"
