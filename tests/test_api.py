"""Tests for FastAPI endpoints — mock BusinessLogic to avoid ROS dependency."""
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create TestClient with BusinessLogic mocked out."""
    with patch("src.main.BusinessLogic") as MockLogic:
        mock_logic = MagicMock()
        MockLogic.return_value = mock_logic

        # Re-import to pick up the mock
        import importlib
        import src.main as main_mod
        importlib.reload(main_mod)
        main_mod.logic = mock_logic

        yield TestClient(main_mod.app), mock_logic


# ═══════════════════════════════════════════════════════════════
# Localization endpoints
# ═══════════════════════════════════════════════════════════════


class TestLocalizationEndpoints:
    def test_start_mapping(self, client):
        tc, mock = client
        mock.start_mapping.return_value = {"success": True, "message": ""}
        resp = tc.post("/api/localization/start-mapping")
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        mock.start_mapping.assert_called_once()

    def test_stop_mapping(self, client):
        tc, mock = client
        mock.stop_mapping.return_value = {"success": True, "message": ""}
        resp = tc.post("/api/localization/stop-mapping")
        assert resp.status_code == 200
        mock.stop_mapping.assert_called_once()

    def test_start_localization(self, client):
        tc, mock = client
        mock.start_localization.return_value = {"success": True, "message": ""}
        resp = tc.post("/api/localization/start")
        assert resp.status_code == 200
        mock.start_localization.assert_called_once()

    def test_stop_localization(self, client):
        tc, mock = client
        mock.stop_localization.return_value = {"success": True, "message": ""}
        resp = tc.post("/api/localization/stop")
        assert resp.status_code == 200

    def test_shutdown_localization(self, client):
        tc, mock = client
        mock.shutdown_localization.return_value = {"success": True, "message": ""}
        resp = tc.post("/api/localization/shutdown")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════
# Map management endpoints
# ═══════════════════════════════════════════════════════════════


class TestMapEndpoints:
    def test_list_maps(self, client):
        tc, mock = client
        mock.list_maps.return_value = {"maps": ["map1", "map2"]}
        resp = tc.get("/api/maps")
        assert resp.status_code == 200
        assert resp.json()["maps"] == ["map1", "map2"]

    def test_get_current_map(self, client):
        tc, mock = client
        mock.get_current_map_name.return_value = {"success": True, "message": "office"}
        resp = tc.get("/api/maps/current")
        assert resp.status_code == 200

    def test_load_map(self, client):
        tc, mock = client
        mock.load_map.return_value = {"success": True}
        resp = tc.get("/api/maps/office")
        assert resp.status_code == 200
        mock.load_map.assert_called_once_with("office")

    def test_apply_map(self, client):
        tc, mock = client
        mock.apply_map.return_value = {"success": True}
        resp = tc.post("/api/maps/apply", json={"map_name": "office"})
        assert resp.status_code == 200
        mock.apply_map.assert_called_once_with("office")

    def test_save_map(self, client):
        tc, mock = client
        mock.save_map.return_value = {"success": True}
        resp = tc.post("/api/maps/save", json={"map_name": "new_map"})
        assert resp.status_code == 200
        mock.save_map.assert_called_once_with("new_map", None)

    def test_delete_map(self, client):
        tc, mock = client
        mock.delete_map.return_value = {"success": True}
        resp = tc.post("/api/maps/delete", json={"map_name": "old_map"})
        assert resp.status_code == 200
        mock.delete_map.assert_called_once_with("old_map")


# ═══════════════════════════════════════════════════════════════
# Navigation endpoints
# ═══════════════════════════════════════════════════════════════


class TestNavigationEndpoints:
    def test_navigate_to(self, client):
        tc, mock = client
        mock.navigate_to.return_value = {"success": True, "message": "Navigation goal sent"}
        resp = tc.post("/api/navigation/go", json={"x": 1.0, "y": 2.0, "theta": 0.5})
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        mock.navigate_to.assert_called_once_with(1.0, 2.0, 0.5, None, None)

    def test_navigate_to_with_config(self, client):
        tc, mock = client
        mock.navigate_to.return_value = {"success": True, "message": ""}
        config = {"safe_dist": 0.5, "v_max": 1.0}
        resp = tc.post("/api/navigation/go", json={
            "x": 1.0, "y": 2.0, "theta": 0.0, "config": config
        })
        assert resp.status_code == 200
        mock.navigate_to.assert_called_once_with(1.0, 2.0, 0.0, config, None)

    def test_cancel_navigation(self, client):
        tc, mock = client
        mock.cancel_navigation.return_value = {"success": True, "message": "Cancel requested"}
        resp = tc.post("/api/navigation/cancel")
        assert resp.status_code == 200

    def test_local_navigation(self, client):
        tc, mock = client
        mock.send_local_navigation_goal.return_value = {"success": True}
        resp = tc.post("/api/navigation/local-go", json={"x": 0.5, "y": 0.5, "theta": 0.0})
        assert resp.status_code == 200
        mock.send_local_navigation_goal.assert_called_once_with(0.5, 0.5, 0.0)


# ═══════════════════════════════════════════════════════════════
# Chassis endpoints
# ═══════════════════════════════════════════════════════════════


class TestChassisEndpoints:
    def test_send_velocity(self, client):
        tc, mock = client
        mock.send_velocity.return_value = {"success": True, "message": "Velocity sent"}
        resp = tc.post("/api/chassis/velocity", json={"linear_x": 0.5, "angular_z": 0.1})
        assert resp.status_code == 200
        mock.send_velocity.assert_called_once_with(0.5, 0.1)

    def test_set_initial_pose(self, client):
        tc, mock = client
        mock.set_initial_pose.return_value = {"success": True}
        resp = tc.post("/api/chassis/initial-pose", json={"x": 1.0, "y": 2.0, "theta": 0.0})
        assert resp.status_code == 200
        mock.set_initial_pose.assert_called_once_with(1.0, 2.0, 0.0)

    def test_get_chassis_control_type(self, client):
        tc, mock = client
        mock.get_chassis_control_type.return_value = {"response": "twist"}
        resp = tc.get("/api/chassis/control-type")
        assert resp.status_code == 200

    def test_set_chassis_control_type(self, client):
        tc, mock = client
        mock.set_chassis_control_type.return_value = {"response": "velocity"}
        resp = tc.post("/api/chassis/control-type", json={"control_type": "velocity"})
        assert resp.status_code == 200
        mock.set_chassis_control_type.assert_called_once_with("velocity")


# ═══════════════════════════════════════════════════════════════
# Patrol endpoints
# ═══════════════════════════════════════════════════════════════


class TestPatrolEndpoints:
    def test_start_patrol(self, client):
        tc, mock = client
        mock.start_patrol.return_value = {"success": True, "message": "Patrol started"}
        waypoints = [
            {"pose": {"x": 1, "y": 2, "theta": 0}, "tasks": [], "navigationMode": "obstacle_avoidance"},
        ]
        resp = tc.post("/api/patrol/start", json={"waypoints": waypoints})
        assert resp.status_code == 200
        mock.start_patrol.assert_called_once()

    def test_stop_patrol(self, client):
        tc, mock = client
        mock.stop_patrol.return_value = {"success": True}
        resp = tc.post("/api/patrol/stop")
        assert resp.status_code == 200

    def test_get_patrol_status(self, client):
        tc, mock = client
        mock.get_patrol_status.return_value = {
            "active": False, "status": "idle", "current_index": -1,
            "completed": [], "skipped": [], "total": 0, "error": "", "waypoints": [],
        }
        resp = tc.get("/api/patrol/status")
        assert resp.status_code == 200
        assert resp.json()["status"] == "idle"


# ═══════════════════════════════════════════════════════════════
# Dock endpoints
# ═══════════════════════════════════════════════════════════════


class TestDockEndpoints:
    def test_dock(self, client):
        tc, mock = client
        mock.send_dock_goal.return_value = {"success": True}
        resp = tc.post("/api/dock/dock", json={})
        assert resp.status_code == 200
        mock.send_dock_goal.assert_called_once_with(False)

    def test_undock(self, client):
        tc, mock = client
        mock.send_undock_goal.return_value = {"success": True}
        resp = tc.post("/api/dock/undock", json={})
        assert resp.status_code == 200
        mock.send_undock_goal.assert_called_once_with(True)

    def test_cancel_dock(self, client):
        tc, mock = client
        mock.cancel_dock.return_value = {"success": True}
        resp = tc.post("/api/dock/cancel")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════
# ROS passthrough endpoints
# ═══════════════════════════════════════════════════════════════


class TestRosPassthrough:
    def test_call_ros_service(self, client):
        tc, mock = client
        mock.call_ros_service.return_value = {"success": True}
        resp = tc.post("/api/ros/service", json={
            "service_name": "/test_svc",
            "service_type": "std_srvs/srv/Trigger",
            "request": {},
        })
        assert resp.status_code == 200

    def test_publish_topic(self, client):
        tc, mock = client
        mock.publish_topic.return_value = {"success": True}
        resp = tc.post("/api/ros/publish", json={
            "topic_name": "/cmd_vel",
            "msg_type": "geometry_msgs/msg/Twist",
            "message": {"linear": {"x": 0}},
        })
        assert resp.status_code == 200

    def test_get_topic_found(self, client):
        tc, mock = client
        mock.get_topic.return_value = {"data": [1, 2, 3]}
        resp = tc.get("/api/ros/topic/map")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_get_topic_not_found(self, client):
        tc, mock = client
        mock.get_topic.return_value = None
        resp = tc.get("/api/ros/topic/nonexistent")
        assert resp.status_code == 200
        assert resp.json()["success"] is False


# ═══════════════════════════════════════════════════════════════
# Room config endpoints
# ═══════════════════════════════════════════════════════════════


class TestRoomConfigEndpoints:
    def test_get_room_config(self, client):
        tc, mock = client
        mock.get_room_config.return_value = {"rooms": [], "start_position": None}
        resp = tc.get("/api/room-config")
        assert resp.status_code == 200

    def test_save_room_config(self, client):
        tc, mock = client
        mock.save_room_config.return_value = {"success": True}
        resp = tc.post("/api/room-config", json={"config": {"rooms": []}})
        assert resp.status_code == 200

    def test_add_room(self, client):
        tc, mock = client
        mock.add_room.return_value = {"success": True}
        resp = tc.post("/api/room-config/rooms", json={"room_id": "r1", "room_name": "Room 1"})
        assert resp.status_code == 200
        mock.add_room.assert_called_once_with("r1", "Room 1")

    def test_delete_room(self, client):
        tc, mock = client
        mock.delete_room.return_value = {"success": True}
        resp = tc.delete("/api/room-config/rooms/r1")
        assert resp.status_code == 200
        mock.delete_room.assert_called_once_with("r1")


# ═══════════════════════════════════════════════════════════════
# Request validation (Pydantic)
# ═══════════════════════════════════════════════════════════════


class TestRequestValidation:
    def test_navigate_missing_required_fields(self, client):
        tc, _ = client
        resp = tc.post("/api/navigation/go", json={"x": 1.0})
        assert resp.status_code == 422

    def test_velocity_missing_fields(self, client):
        tc, _ = client
        resp = tc.post("/api/chassis/velocity", json={"linear_x": 0.5})
        assert resp.status_code == 422

    def test_patrol_empty_waypoints(self, client):
        tc, mock = client
        mock.start_patrol.return_value = {"success": False, "message": "No waypoints"}
        resp = tc.post("/api/patrol/start", json={"waypoints": []})
        # FastAPI will validate list[WaypointItem] — empty list is valid at schema level
        assert resp.status_code == 200
