# 启动脚本说明

> ⚠️ `start-sim.sh`、`start-real.sh`、`run.sh` 已删除。请使用以下方式启动：

## 开发模式

```bash
# 终端1：后端
python main.py

# 终端2：前端
cd ui && npm run dev
```

## 生产模式

```bash
cd ui && npm run build
python main.py
```

端口配置见项目根目录 `.env`（默认值参考 `.env.example`）。
