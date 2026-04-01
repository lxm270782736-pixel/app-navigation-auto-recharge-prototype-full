"""
Navigation App — root entry point.

Usage:
    python main.py              # API + 前端（需先 cd ui && npm run build）
    python main.py --dev        # 仅 API（前端用 npm run dev 单独启动）
"""
import uvicorn

if __name__ == "__main__":
    log_config = uvicorn.config.LOGGING_CONFIG
    log_config["formatters"]["access"]["fmt"] = "%(asctime)s.%(msecs)03d %(levelname)s: %(message)s"
    log_config["formatters"]["access"]["datefmt"] = "%Y-%m-%d %H:%M:%S"
    log_config["formatters"]["default"]["fmt"] = "%(asctime)s.%(msecs)03d %(levelname)s: %(message)s"
    log_config["formatters"]["default"]["datefmt"] = "%Y-%m-%d %H:%M:%S"
    uvicorn.run("src.main:app", host="0.0.0.0", port=8080, log_config=log_config)
