"""
Navigation App — FastAPI entry point

Exposes REST + SSE endpoints for navigation control.
All ROS communication goes through logic.py — frontend never touches ROS directly.
"""
import json
import asyncio
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
        while True:
            yield {"data": json.dumps(logic.get_state())}
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


# ==================== 通用透传 ====================


class ServiceCallRequest(BaseModel):
    service_name: str
    service_type: str
    request: dict = {}


@app.post("/api/ros/service")
def call_ros_service(req: ServiceCallRequest):
    """Generic ROS service passthrough."""
    return logic.call_ros_service(req.service_name, req.service_type, req.request)


class TopicPublishRequest(BaseModel):
    topic_name: str
    msg_type: str
    message: dict


@app.post("/api/ros/publish")
def publish_topic(req: TopicPublishRequest):
    """Generic ROS topic publish passthrough."""
    return logic.publish_topic(req.topic_name, req.msg_type, req.message)


@app.get("/api/ros/topic/{topic_path:path}")
def get_topic(topic_path: str):
    """Get latest message for a topic (for heavy data like /map, /scan)."""
    topic_name = "/" + topic_path
    data = logic.get_topic(topic_name)
    if data is None:
        return {"success": False, "message": f"No data for {topic_name}"}
    return {"success": True, "data": data}

# ==================== Standalone runner ====================


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8080)
