"""
Navigation App — FastAPI entry point

Exposes REST + SSE endpoints for navigation control.
All ROS communication goes through logic.py — frontend never touches ROS directly.
Serves the built frontend SPA from ui/dist/ when available.
"""
import json
import asyncio
import logging
from pathlib import Path
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from .logic import BusinessLogic

app = FastAPI(title="Navigation App")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logic = BusinessLogic()


# ==================== SSE: 状态推送 ====================


@app.get("/api/state")
async def state_stream():
    """Push full state every 500ms — includes raw ROS topic data."""
    async def generate():
        loop = asyncio.get_running_loop()
        while True:
            state = await loop.run_in_executor(None, logic.get_state)
            yield {"data": json.dumps(state)}
            await asyncio.sleep(0.5)
    return EventSourceResponse(generate())


# ==================== 定位/建图 ====================


@app.post("/api/localization/start-mapping")
def start_mapping():
    return logic.start_mapping()


@app.post("/api/localization/stop-mapping")
def stop_mapping():
    return logic.stop_mapping()


@app.post("/api/localization/start")
def start_localization():
    return logic.start_localization()


@app.post("/api/localization/start-auto")
def start_localization_auto():
    return logic.start_localization_auto()


@app.post("/api/localization/start-obstacle-avoidance")
def start_obstacle_avoidance():
    return logic.start_obstacle_avoidance()


@app.post("/api/localization/stop")
def stop_localization():
    return logic.stop_localization()


@app.get("/api/localization/status")
def get_localization_status():
    return logic.get_localization_status()


@app.get("/api/localization/pose")
def get_pose():
    return logic.get_pose()


@app.post("/api/localization/shutdown")
def shutdown_localization():
    return logic.shutdown_localization()


# ==================== 遥控器 ====================


@app.post("/api/joystick/start")
def start_joystick():
    return logic.start_joystick()


@app.post("/api/joystick/stop")
def stop_joystick():
    return logic.stop_joystick()


# ==================== 系统节点 ====================


@app.post("/api/system/start-slam")
def start_slam_node():
    return logic.start_slam_node()


@app.post("/api/system/start-nav")
def start_navigation_node():
    return logic.start_navigation_node()


# ==================== 地图管理 ====================


@app.get("/api/maps")
def list_maps():
    return logic.list_maps()


@app.get("/api/maps/current")
def get_current_map():
    return logic.get_current_map_name()


class MapNameRequest(BaseModel):
    map_name: str


@app.get("/api/maps/{map_name}")
def load_map(map_name: str):
    return logic.load_map(map_name)


@app.post("/api/maps/apply")
def apply_map(req: MapNameRequest):
    return logic.apply_map(req.map_name)


class SaveMapRequest(BaseModel):
    map_name: str
    map_data: Optional[dict] = None


@app.post("/api/maps/save")
def save_map(req: SaveMapRequest):
    return logic.save_map(req.map_name, req.map_data)


@app.post("/api/maps/delete")
def delete_map(req: MapNameRequest):
    return logic.delete_map(req.map_name)


# ==================== 导航 ====================


class NavigateRequest(BaseModel):
    x: float
    y: float
    theta: float
    config: Optional[dict] = None
    tasks: Optional[list] = None


@app.post("/api/navigation/go")
def navigate_to(req: NavigateRequest):
    return logic.navigate_to(req.x, req.y, req.theta, req.config, req.tasks)


@app.post("/api/navigation/cancel")
def cancel_navigation():
    return logic.cancel_navigation()


class LocalNavRequest(BaseModel):
    x: float
    y: float
    theta: float


@app.post("/api/navigation/local-go")
def send_local_navigation_goal(req: LocalNavRequest):
    return logic.send_local_navigation_goal(req.x, req.y, req.theta)


# ==================== 多点巡航 ====================


class WaypointItem(BaseModel):
    pose: dict
    tasks: list = []
    navigationMode: str = "obstacle_avoidance"
    actionConfig: Optional[dict] = None


class StartPatrolRequest(BaseModel):
    waypoints: list[WaypointItem]
    start_index: int = 0


class UpdateWaypointsRequest(BaseModel):
    waypoints: list[WaypointItem]


@app.post("/api/patrol/start")
def start_patrol(req: StartPatrolRequest):
    waypoints = [w.model_dump() for w in req.waypoints]
    return logic.start_patrol(waypoints, req.start_index)


@app.post("/api/patrol/stop")
def stop_patrol():
    return logic.stop_patrol()


@app.get("/api/patrol/status")
def get_patrol_status():
    return logic.get_patrol_status()


@app.post("/api/patrol/waypoints")
def update_patrol_waypoints(req: UpdateWaypointsRequest):
    waypoints = [w.model_dump() for w in req.waypoints]
    return logic.update_patrol_waypoints(waypoints)


# ==================== 房间配置（点位录制） ====================


@app.get("/api/room-config")
def get_room_config():
    return logic.get_room_config()


class SaveRoomConfigRequest(BaseModel):
    config: dict


@app.post("/api/room-config")
def save_room_config(req: SaveRoomConfigRequest):
    return logic.save_room_config(req.config)


class AddRoomRequest(BaseModel):
    room_id: str
    room_name: str


@app.post("/api/room-config/rooms")
def add_room(req: AddRoomRequest):
    return logic.add_room(req.room_id, req.room_name)


@app.delete("/api/room-config/rooms/{room_id}")
def delete_room(room_id: str):
    return logic.delete_room(room_id)


class RecordWaypointRequest(BaseModel):
    waypoint_type: str


@app.post("/api/room-config/rooms/{room_id}/record")
def record_waypoint(room_id: str, req: RecordWaypointRequest):
    return logic.record_room_waypoint(room_id, req.waypoint_type)


@app.post("/api/room-config/record-start")
def record_start_position():
    return logic.record_room_waypoint("", "start_position")


# ==================== 巡房任务 ====================


class StartRoomPatrolRequest(BaseModel):
    task_config: Optional[dict] = None


@app.post("/api/room-patrol/start")
def start_room_patrol(req: StartRoomPatrolRequest):
    return logic.start_room_patrol(req.task_config)


@app.post("/api/room-patrol/stop")
def stop_room_patrol():
    return logic.stop_room_patrol()


@app.get("/api/room-patrol/status")
def get_room_patrol_status():
    return logic.get_room_patrol_status()


@app.get("/api/room-patrol/task-config")
def get_task_config():
    return logic.get_task_config()


class SaveTaskConfigRequest(BaseModel):
    config: dict


@app.post("/api/room-patrol/task-config")
def save_task_config(req: SaveTaskConfigRequest):
    return logic.save_task_config(req.config)


# ==================== 告警 ====================


@app.get("/api/alerts")
def get_alerts(status: Optional[str] = None, date: Optional[str] = None):
    return logic.get_alerts(status=status, date=date)


@app.post("/api/alerts/{date}/{alert_id}/confirm")
def confirm_alert(date: str, alert_id: str):
    return logic.confirm_alert(alert_id, date)


@app.post("/api/alerts/{date}/{alert_id}/close")
def close_alert(date: str, alert_id: str):
    return logic.close_alert(alert_id, date)


# ==================== 巡房记录 ====================


@app.get("/api/patrol-records")
def get_patrol_records():
    return logic.get_patrol_records()


@app.get("/api/patrol-records/{date}/{record_id}")
def get_patrol_record(date: str, record_id: str):
    return logic.get_patrol_record(record_id, date)


# ==================== 底盘控制 ====================


class VelocityRequest(BaseModel):
    linear_x: float
    angular_z: float


@app.post("/api/chassis/velocity")
def send_velocity(req: VelocityRequest):
    return logic.send_velocity(req.linear_x, req.angular_z)


class PoseRequest(BaseModel):
    x: float
    y: float
    theta: float


@app.post("/api/chassis/initial-pose")
def set_initial_pose(req: PoseRequest):
    return logic.set_initial_pose(req.x, req.y, req.theta)


@app.get("/api/chassis/control-type")
def get_chassis_control_type():
    return logic.get_chassis_control_type()


class ControlTypeRequest(BaseModel):
    control_type: str


@app.post("/api/chassis/control-type")
def set_chassis_control_type(req: ControlTypeRequest):
    return logic.set_chassis_control_type(req.control_type)


# ==================== Dock ====================


class DockRequest(BaseModel):
    force_retry: bool = False


@app.post("/api/dock/dock")
def send_dock_goal(req: DockRequest):
    return logic.send_dock_goal(req.force_retry)


class UndockRequest(BaseModel):
    save_position: bool = True


@app.post("/api/dock/undock")
def send_undock_goal(req: UndockRequest):
    return logic.send_undock_goal(req.save_position)


@app.post("/api/dock/cancel")
def cancel_dock():
    return logic.cancel_dock()


# ==================== 任务预设 ====================


class SavePresetRequest(BaseModel):
    preset: dict


class DuplicatePresetRequest(BaseModel):
    new_name: str


@app.get("/api/task-presets")
def get_task_presets():
    return logic.get_task_presets()


@app.post("/api/task-presets")
def save_task_preset(req: SavePresetRequest):
    return logic.save_task_preset(req.preset)


@app.delete("/api/task-presets/{preset_id}")
def delete_task_preset(preset_id: str):
    return logic.delete_task_preset(preset_id)


@app.post("/api/task-presets/{preset_id}/duplicate")
def duplicate_task_preset(preset_id: str, req: DuplicatePresetRequest):
    return logic.duplicate_task_preset(preset_id, req.new_name)


@app.post("/api/task-presets/{preset_id}/default")
def set_default_preset(preset_id: str):
    return logic.set_default_preset(preset_id)


# ==================== 自定义步骤类型 ====================


class SaveCustomStepTypeRequest(BaseModel):
    definition: dict


@app.get("/api/custom-step-types")
def get_custom_step_types():
    return logic.get_custom_step_types()


@app.post("/api/custom-step-types")
def save_custom_step_type(req: SaveCustomStepTypeRequest):
    return logic.save_custom_step_type(req.definition)


@app.delete("/api/custom-step-types/{step_id}")
def delete_custom_step_type(step_id: str):
    return logic.delete_custom_step_type(step_id)


# ==================== Meta 服务管理 ====================


@app.post("/api/meta/start")
def start_meta():
    """一键启动：connect → configure → activate"""
    return logic.start_meta()


@app.post("/api/meta/connect")
def connect_meta():
    return logic.connect_meta()


@app.post("/api/meta/activate")
def activate_meta():
    return logic.activate_meta()


@app.post("/api/meta/deactivate")
def deactivate_meta():
    return logic.deactivate_meta()


@app.get("/api/meta/status")
def meta_status():
    return logic.get_meta_status()


# ==================== 前端静态文件 ====================

_UI_DIR = Path(__file__).parent.parent / "ui" / "dist"

if _UI_DIR.exists():
    # Serve built assets (JS, CSS)
    _ASSETS_DIR = _UI_DIR / "assets"
    if _ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="static-assets")

    # SPA catch-all: non-API routes serve index.html
    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        # Return 404 JSON for unknown API paths instead of silently serving HTML
        if path.startswith("api/"):
            from fastapi.responses import JSONResponse
            return JSONResponse({"error": f"API not found: /{path}"}, status_code=404)
        # Guard against path traversal (e.g. GET /../../etc/passwd)
        ui_root = _UI_DIR.resolve()
        resolved = (ui_root / path).resolve()
        if resolved.is_file() and resolved.is_relative_to(ui_root):
            return FileResponse(str(resolved))
        # Otherwise serve index.html for SPA routing
        index = _UI_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return {"error": "Frontend not built. Run: cd ui && npm run build"}


# ==================== Standalone runner ====================


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8080)
