# 快速启动指南

## 🚀 启动方式

### 开发模式

```bash
# 终端1：启动后端
python main.py

# 终端2：启动前端开发服务器
cd ui && npm run dev
```

访问 **http://localhost:3500**

### 生产模式

```bash
# 构建前端
cd ui && npm run build

# 启动后端（同时托管构建产物）
python main.py
```

访问 **http://localhost:17659**

> 端口由项目根目录 `.env` 的 `BACKEND_PORT` / `FRONTEND_PORT` 控制，默认值见 `.env.example`。

---

## 🌐 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端（dev） | http://localhost:3500 | Vite dev server |
| 后端 API | http://localhost:17659 | FastAPI |
| 前端（prod） | http://localhost:17659 | 后端托管构建产物 |

---

## 🎯 功能导航

### 1. Dashboard 主页 (`/`)
- Meta 服务连接状态及一键启动
- 电池电量、位置、速度实时显示
- 定位模式切换（建图 / 定位 / 避障）

### 2. 地图管理 (`/maps`)
- 查看、编辑、删除已保存地图
- 加载地图进入导航

### 3. SLAM 建图 (`/mapping`)
- 一键启动/停止建图
- 实时地图预览
- 命名并保存地图

### 4. 导航 (`/navigation/:mapId`)
- 手动重定位（设置初始位姿）
- 点击地图设置目标点
- 配置附加任务（等待 / 拍照 / 轨迹等）
- 实时轨迹跟踪

---

## 🛠️ 故障排查

### 端口被占用
```bash
lsof -i :17659
kill -9 <PID>
```

### 后端无法启动
```bash
# 检查依赖
pip install -r requirements.txt

# 确认 .env 存在
cp .env.example .env
```

### 前端构建失败
```bash
cd ui
npm install
npm run build
```

---

## 📚 相关文档

- [README.md](../README.md) - 项目总览与架构说明
- [NAVIGATION_EVENTS.md](NAVIGATION_EVENTS.md) - 导航事件处理
- [TASK_SYSTEM.md](TASK_SYSTEM.md) - 任务系统架构
