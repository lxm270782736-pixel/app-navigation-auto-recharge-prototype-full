#!/usr/bin/env python3
"""
模拟ROS Bridge WebSocket服务器
用于测试导航UI，无需完整ROS环境
"""

import asyncio
import websockets
import json
import time
import random
import math
import os
from pathlib import Path
from aiohttp import web


def normalize_message_type(msg_type: str) -> str:
    """
    Normalize ROS2 message types to internal format.
    ROS2: 'nav_msgs/msg/OccupancyGrid' -> 'nav_msgs/OccupancyGrid'
    ROS2: 'std_srvs/srv/Trigger' -> 'std_srvs/Trigger'
    ROS2: 'astribot_msgs/action/MoveChassis' -> 'astribot_msgs/MoveChassis'
    """
    if msg_type is None:
        return None
    return msg_type.replace('/msg/', '/').replace('/srv/', '/').replace('/action/', '/')

# 地图存储目录
MAPS_STORAGE_DIR = Path(__file__).parent / "mock_saved_maps"
MAPS_STORAGE_DIR.mkdir(exist_ok=True)


def normalize_message_type(msg_type: str) -> str:
    """
    Normalize ROS2 message types to internal format.
    ROS2 uses '/msg/', '/srv/', '/action/' in type strings, while internally we use shorter format.

    Examples:
        ROS2: 'nav_msgs/msg/OccupancyGrid' -> 'nav_msgs/OccupancyGrid'
        ROS2: 'std_srvs/srv/Trigger' -> 'std_srvs/Trigger'
        ROS2: 'astribot_msgs/action/MoveChassisTo' -> 'astribot_msgs/MoveChassisTo'
        ROS1: 'nav_msgs/OccupancyGrid' -> 'nav_msgs/OccupancyGrid' (unchanged)
    """
    if msg_type is None:
        return ""
    return msg_type.replace('/msg/', '/').replace('/srv/', '/').replace('/action/', '/')


class MockROSBridge:
    def __init__(self):
        self.clients = set()
        self.subscriptions = {}
        self.mapping_active = False
        self.map_data = self.generate_sample_map()
        self.current_map_set = False  # 标记是否已设置当前地图（通过apply_map）
        self.pending_map_name = ""  # 待保存的地图名称（建图开始前设置）
        self.current_map_name = ""  # 当前应用的地图名称
        # 初始位置设置在地图中心可见区域
        self.robot_pose = {"x": 2.0, "y": 2.0, "theta": 0.0}
        self.movement_time = 0.0
        # 导航状态
        self.navigation_active = False
        self.navigation_goal = None
        self.navigation_start_pose = None
        self.navigation_start_time = 0.0
        # 节点运行状态
        self.slam_running = False
        self.navigation_node_running = False
        self.navigation_tasks = []
        # 定位服务状态
        self.localization_mode = "idle"  # idle, mapping, localization, localization_auto, obstacle_avoidance
        self.localization_status_message = "未启动"
        # 遥控器状态
        self.joystick_active = False
        # 地图存储（模拟数据库）
        self.saved_maps = {}  # {map_id: map_metadata}
        # 手动重定位状态
        self.waiting_for_initialpose = False  # 是否正在等待初始位姿
        self.localization_event = None  # 用于等待初始位姿的事件
        self.localization_result = None  # 重定位结果

        self.control_type = "twist"
        # 从文件加载已保存的地图
        self.load_maps_from_disk()

    def load_maps_from_disk(self):
        """从磁盘加载所有已保存的地图"""
        try:
            if not MAPS_STORAGE_DIR.exists():
                return

            map_files = list(MAPS_STORAGE_DIR.glob("*.json"))
            for map_file in map_files:
                try:
                    with open(map_file, 'r', encoding='utf-8') as f:
                        map_data = json.load(f)

                        # 修复 id 字段（使用文件名作为后备）
                        if "id" not in map_data or not map_data["id"]:
                            map_data["id"] = map_file.stem

                        map_id = map_data["id"]

                        # 修复 name 字段（使用 id 作为后备）
                        if "name" not in map_data or not map_data["name"]:
                            map_data["name"] = map_id

                        # 修复 created_at 字段（确保是时间戳数字）
                        if "created_at" not in map_data or not isinstance(map_data["created_at"], (int, float)):
                            # 如果没有 created_at 或格式不对，使用文件修改时间
                            map_data["created_at"] = int(map_file.stat().st_mtime)

                        # 确保必需字段有默认值
                        map_data.setdefault("width", 0)
                        map_data.setdefault("height", 0)
                        map_data.setdefault("resolution", 0.05)
                        map_data.setdefault("origin_x", 0.0)
                        map_data.setdefault("origin_y", 0.0)
                        map_data.setdefault("origin_orientation", 0.0)
                        map_data.setdefault("thumbnail", "")
                        map_data.setdefault("data", [])

                        self.saved_maps[map_id] = map_data
                        print(f"✓ 已加载地图: {map_data['name']}")
                except Exception as e:
                    print(f"✗ 加载地图文件 {map_file} 失败: {e}")

            print(f"📂 从磁盘加载了 {len(self.saved_maps)} 个地图")

            # 如果加载了地图且当前没有设置地图，自动设置最新的地图为当前地图
            if self.saved_maps and not self.current_map_name:
                # 按创建时间排序，选择最新的地图
                latest_map = max(self.saved_maps.values(), key=lambda m: m.get('created_at', 0))
                self.current_map_name = latest_map['id']
                # 设置当前地图数据
                self.map_data = {
                    "header": {
                        "frame_id": "map",
                        "stamp": {"secs": int(time.time()), "nsecs": 0}
                    },
                    "info": {
                        "width": latest_map["width"],
                        "height": latest_map["height"],
                        "resolution": latest_map["resolution"],
                        "origin": {
                            "position": {
                                "x": latest_map["origin_x"],
                                "y": latest_map["origin_y"],
                                "z": 0.0
                            },
                            "orientation": {
                                "x": 0.0,
                                "y": 0.0,
                                "z": latest_map["origin_orientation"],
                                "w": 1.0
                            }
                        }
                    },
                    "data": latest_map.get("data", [])
                }
                self.current_map_set = True
                print(f"✓ 自动设置当前地图: {self.current_map_name}")
        except Exception as e:
            print(f"✗ 加载地图目录失败: {e}")

    def save_map_to_disk(self, map_id, map_data):
        """保存地图到磁盘"""
        try:
            map_file = MAPS_STORAGE_DIR / f"{map_id}.json"
            with open(map_file, 'w', encoding='utf-8') as f:
                json.dump(map_data, f, ensure_ascii=False, indent=2)
            print(f"💾 地图已保存到磁盘: {map_file}")
            return True
        except Exception as e:
            print(f"✗ 保存地图到磁盘失败: {e}")
            return False

    def delete_map_from_disk(self, map_id):
        """从磁盘删除地图"""
        try:
            map_file = MAPS_STORAGE_DIR / f"{map_id}.json"
            if map_file.exists():
                os.remove(map_file)
                print(f"🗑️  地图已从磁盘删除: {map_file}")
                return True
            return False
        except Exception as e:
            print(f"✗ 从磁盘删除地图失败: {e}")
            return False

    def generate_sample_map(self):
        """生成示例地图数据"""
        width, height = 384, 384
        resolution = 0.05
        data = []

        # 创建一个简单的房间地图
        for y in range(height):
            for x in range(width):
                # 边界是墙
                if x < 10 or x > width-10 or y < 10 or y > height-10:
                    data.append(100)  # 障碍
                # 中间添加一些障碍物
                elif (150 < x < 180 and 150 < y < 180):
                    data.append(100)
                else:
                    data.append(0)  # 空闲

        return {
            "header": {
                "frame_id": "map",
                "stamp": {"secs": int(time.time()), "nsecs": 0}
            },
            "info": {
                "width": width,
                "height": height,
                "resolution": resolution,
                "origin": {
                    "position": {"x": -10.0, "y": -10.0, "z": 0.0},
                    "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
                }
            },
            "data": data
        }

    def print_system_status(self):
        """打印当前系统状态"""
        print("\n" + "="*50)
        print("📊 系统状态")
        print("="*50)
        print(f"定位模式: {self.localization_mode}")
        print(f"建图状态: {'运行中' if self.mapping_active else '已停止'}")
        print(f"遥控器: {'运行中' if self.joystick_active else '已停止'}")
        print(f"状态消息: {self.localization_status_message}")
        print("="*50 + "\n")

    async def handle_client(self, websocket, path):
        """处理客户端连接"""
        self.clients.add(websocket)
        print(f"客户端已连接: {websocket.remote_address}")

        try:
            async for message in websocket:
                await self.process_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            print(f"客户端断开连接: {websocket.remote_address}")
        finally:
            self.clients.remove(websocket)

    async def process_message(self, websocket, message):
        """处理客户端消息"""
        try:
            data = json.loads(message)
            op = data.get("op")

            # 添加详细日志
            if op in ["send_action_goal", "cancel_action_goal"]:
                print(f"\n📨 收到消息:")
                print(f"   op: {op}")
                print(f"   完整数据: {data}")

            if op == "subscribe":
                await self.handle_subscribe(websocket, data)
            elif op == "unsubscribe":
                await self.handle_unsubscribe(websocket, data)
            elif op == "publish":
                await self.handle_publish(websocket, data)
            elif op == "call_service":
                await self.handle_service_call(websocket, data)
            elif op == "advertise":
                print(f"Advertise: {data.get('topic')}")
            elif op == "unadvertise":
                print(f"Unadvertise: {data.get('topic')}")
            # Action 相关操作
            elif op == "advertise_action":
                print(f"Advertise Action: {data.get('action')}")
            elif op == "unadvertise_action":
                print(f"Unadvertise Action: {data.get('action')}")
            elif op == "send_action_goal":
                print(f"🎯 路由到 handle_action_goal")
                await self.handle_action_goal(websocket, data)
            elif op == "cancel_action_goal":
                print(f"🛑 路由到 handle_cancel_action")
                await self.handle_cancel_action(websocket, data)
            else:
                print(f"⚠️  未知的 op: {op}")

        except json.JSONDecodeError as e:
            print(f"❌ 无效的JSON消息: {message}")
            print(f"   解析错误: {e}")
        except Exception as e:
            print(f"❌ 处理消息时出错:")
            print(f"   错误类型: {type(e).__name__}")
            print(f"   错误信息: {e}")
            import traceback
            traceback.print_exc()

    async def handle_subscribe(self, websocket, data):
        """处理话题订阅"""
        topic = data.get("topic")
        msg_type = data.get("type")
        msg_type_normalized = normalize_message_type(msg_type)

        print(f"订阅话题: {topic} ({msg_type_normalized})")

        if topic not in self.subscriptions:
            self.subscriptions[topic] = set()
        self.subscriptions[topic].add(websocket)

        # 开始发布该话题的数据
        if topic == "/map":
            asyncio.create_task(self.publish_map(websocket))
        elif topic == "/loc_high_freq":
            asyncio.create_task(self.publish_robot_pose(websocket))
        elif topic == "/amcl_pose":
            asyncio.create_task(self.publish_amcl_pose(websocket))
        elif topic == "/localization/mode":
            asyncio.create_task(self.publish_localization_mode(websocket))
        elif topic == "/scan":
            asyncio.create_task(self.publish_laser_scan(websocket))
        elif topic == "/slam/status":
            # 立即发送当前SLAM节点状态，并启动定期发布
            asyncio.create_task(self.publish_slam_status_periodic(websocket))
        elif topic == "/navigation/status":
            # 立即发送当前导航节点状态，并启动定期发布
            asyncio.create_task(self.publish_navigation_status_periodic(websocket))

    async def handle_unsubscribe(self, websocket, data):
        """处理取消订阅"""
        topic = data.get("topic")
        if topic in self.subscriptions:
            self.subscriptions[topic].discard(websocket)

    async def handle_publish(self, websocket, data):
        """处理消息发布"""
        topic = data.get("topic")
        msg = data.get("msg")

        print(f"收到发布: {topic}")

        if topic == "/initialpose":
            # 更新机器人位姿
            pose = msg.get("pose", {}).get("pose", {})
            position = pose.get("position", {})
            orientation = pose.get("orientation", {})

            self.robot_pose["x"] = position.get("x", 0.0)
            self.robot_pose["y"] = position.get("y", 0.0)

            # 四元数转欧拉角
            z = orientation.get("z", 0.0)
            w = orientation.get("w", 1.0)
            self.robot_pose["theta"] = 2.0 * math.atan2(z, w)

            print(f"📍 收到初始位姿: x={self.robot_pose['x']:.2f}, y={self.robot_pose['y']:.2f}, theta={self.robot_pose['theta']:.2f}")

            # 如果正在等待初始位姿（手动重定位模式）
            if self.waiting_for_initialpose and self.localization_event:
                print("   ⏳ 开始粒子滤波初始化...")

                # 异步处理重定位初始化，不阻塞当前消息处理
                asyncio.create_task(self.process_manual_localization())
            else:
                print("   ℹ️  不在重定位等待状态，仅更新位姿")

        elif topic == "/small_range_goal":
            # 局部导航模式：接收小范围导航目标
            pose = msg.get("pose", {})
            position = pose.get("position", {})
            orientation = pose.get("orientation", {})

            goal_x = position.get("x", 0.0)
            goal_y = position.get("y", 0.0)
            goal_z = orientation.get("z", 0.0)
            goal_w = orientation.get("w", 1.0)
            goal_theta = 2.0 * math.atan2(goal_z, goal_w)

            print(f"🎯 收到局部导航目标: x={goal_x:.2f}, y={goal_y:.2f}, theta={goal_theta:.2f}")
            print(f"   当前位置: x={self.robot_pose['x']:.2f}, y={self.robot_pose['y']:.2f}")

            # 异步处理局部导航（简单的直线运动，3秒完成）
            asyncio.create_task(self.simulate_local_navigation(goal_x, goal_y, goal_theta))

        elif topic == "/move_chassis_to_server/goal":
            # Action Goal - 通过话题发布
            print(f"🎯 收到 Action Goal (通过话题)")
            print(f"   完整消息: {msg}")

            # 从 actionlib 消息中提取 goal
            goal_id = msg.get("goal_id", {})
            goal = msg.get("goal", {})

            # 生成 action_id
            action_id = goal_id.get("id", str(time.time()))

            print(f"   Goal ID: {action_id}")
            print(f"   Goal 数据: {goal}")

            # 调用 action goal 处理（复用现有逻辑）
            await self.handle_action_goal_from_topic(websocket, action_id, goal)

    async def handle_service_call(self, websocket, data):
        """处理服务调用"""
        service = data.get("service")
        service_type = data.get("type")
        service_type_normalized = normalize_message_type(service_type)
        args = data.get("args", {})
        call_id = data.get("id")

        print(f"服务调用: {service} ({service_type_normalized})")

        response = {"op": "service_response", "id": call_id, "values": {}}

        # 旧的建图服务（兼容性保留）
        if service == "/start_mapping":
            self.mapping_active = True
            response["values"] = {"success": True, "message": "建图已启动"}
            print("✓ 建图已启动")

        elif service == "/stop_mapping":
            self.mapping_active = False
            response["values"] = {"success": True, "message": "建图已停止"}
            print("✓ 建图已停止")

        elif service == "/save_map":
            map_name = args.get("map_name", "default_map")
            response["values"] = {"success": True, "message": f"地图 {map_name} 已保存"}
            print(f"✓ 地图已保存: {map_name}")

        # ========== 新的定位服务 ==========
        elif service == "/localization/start_mapping":
            if not self.joystick_active:
                print("⚠ 警告: 建图前应先启动遥控器")
            print("🗺️  正在进入建图模式...")
            print("   ⏳ 初始化SLAM算法 (5秒)...")
            await asyncio.sleep(5)  # 模拟建图节点启动过程
            self.localization_mode = "mapping"
            self.localization_status_message = "建图模式已启动"
            self.mapping_active = True

            # 开始建图时，标记地图可以发布（用于实时显示建图过程）
            self.current_map_set = True

            response["values"] = {"success": True, "message": "建图模式已启动"}
            if self.pending_map_name:
                print(f"✓ 定位服务: 建图模式已启动 (地图名称: '{self.pending_map_name}', 遥控器: {'已启动' if self.joystick_active else '未启动'})")
            else:
                print(f"✓ 定位服务: 建图模式已启动 (遥控器状态: {'已启动' if self.joystick_active else '未启动'})")
            self.print_system_status()

        elif service == "/localization/start_localization":
            print("📍 启动定位模式（手动）...")
            print("   ⏳ 等待用户在地图上点击设置初始位置...")

            # 进入等待状态
            self.localization_mode = "localization"
            self.localization_status_message = "等待初始位置设置..."
            self.waiting_for_initialpose = True
            self.localization_event = asyncio.Event()
            self.localization_result = None

            # 阻塞等待用户点击地图发布 /initialpose 话题
            # 设置超时时间为60秒
            try:
                await asyncio.wait_for(self.localization_event.wait(), timeout=60.0)

                # 获取重定位结果
                if self.localization_result:
                    response["values"] = self.localization_result
                    if self.localization_result["success"]:
                        print("✓ 定位服务: 手动重定位成功")
                    else:
                        print("✗ 定位服务: 手动重定位失败")
                else:
                    # 不应该发生
                    response["values"] = {
                        "success": False,
                        "message": "重定位过程异常"
                    }
                    print("✗ 定位服务: 重定位结果为空")

            except asyncio.TimeoutError:
                # 超时 - 用户60秒内没有点击地图
                self.waiting_for_initialpose = False
                self.localization_mode = "idle"
                response["values"] = {
                    "success": False,
                    "message": "等待初始位置设置超时（60秒）"
                }
                print("✗ 定位服务: 等待初始位置超时")
            finally:
                # 清理状态
                self.waiting_for_initialpose = False
                self.localization_event = None

        elif service == "/localization/start_localization_auto":
            print("📍 正在启动定位模式（自动）...")
            print("   ⏳ 自动搜索机器人位置...")
            self.localization_mode = "localization_auto"
            self.localization_status_message = "定位中（自动）..."
            # 模拟定位过程
            print("   ⏳ 全局定位计算中 (10秒)...")
            await asyncio.sleep(10)
            # 模拟成功/失败 (50%失败率)
            if random.random() < 0.1:
                self.localization_status_message = "定位失败（自动）: 无法找到匹配位置"
                # 失败时回到 idle 模式
                self.localization_mode = "idle"
                response["values"] = {
                    "success": False,
                    "message": "定位失败: 无法找到匹配位置"
                }
                print("✗ 定位服务: 定位失败（自动）- 无法找到匹配位置")
            else:
                self.localization_status_message = "定位成功（自动）"
                # 成功时保持 localization_auto 模式
                # self.localization_mode 已经设置为 "localization_auto"
                response["values"] = {
                    "success": True,
                    "message": "定位成功"
                }
                print("✓ 定位服务: 定位完成（自动）")
            self.print_system_status()

        elif service == "/localization/start_obstacle_avoidance":
            self.localization_mode = "obstacle_avoidance"
            self.localization_status_message = "纯避障模式已启动"
            response["values"] = {"success": True, "message": "纯避障模式已启动"}
            print("✓ 定位服务: 纯避障模式已启动")

        elif service == "/localization/stop":
            was_mapping = self.mapping_active
            if was_mapping:
                print("🛑 正在停止建图节点...")

                # 如果在建图模式且设置了地图名称，自动保存地图
                if self.pending_map_name and self.map_data:
                    print(f"   💾 自动保存地图 '{self.pending_map_name}'...")

                    # 获取当前地图数据
                    info = self.map_data.get("info", {})
                    origin = info.get("origin", {}).get("position", {})
                    origin_orientation = info.get("origin", {}).get("orientation", {})

                    # 保存地图元数据和完整数据
                    map_to_save = {
                        "id": self.pending_map_name,
                        "name": self.pending_map_name,
                        "created_at": int(time.time()),
                        "thumbnail": "",  # 前端会生成缩略图
                        "width": info.get("width", 0),
                        "height": info.get("height", 0),
                        "resolution": info.get("resolution", 0.05),
                        "origin_x": origin.get("x", 0.0),
                        "origin_y": origin.get("y", 0.0),
                        "origin_orientation": origin_orientation.get("z", 0.0),
                        "data": self.map_data.get("data", [])
                    }

                    # 保存到内存
                    self.saved_maps[self.pending_map_name] = map_to_save

                    # 保存到磁盘
                    disk_success = self.save_map_to_disk(self.pending_map_name, map_to_save)

                    if disk_success:
                        print(f"   ✓ 地图 '{self.pending_map_name}' 已自动保存到ROS")
                    else:
                        print(f"   ✗ 地图 '{self.pending_map_name}' 保存失败")

                    # 保存完成后清除待处理的地图名称
                    self.pending_map_name = ""
                else:
                    print("   ⏳ 保存地图数据 (2秒)...")
                    await asyncio.sleep(2)  # 模拟停止过程

            self.localization_mode = "idle"
            self.mapping_active = False
            self.localization_status_message = "定位服务已停止"
            response["values"] = {"success": True, "message": "定位服务已停止"}
            print(f"✓ 定位服务: 已停止 (遥控器状态: {'运行中' if self.joystick_active else '已停止'})")
            if was_mapping and self.joystick_active:
                print("💡 提示: 建图已停止，但遥控器仍在运行")
            self.print_system_status()

        elif service == "/localization/shutdown":
            self.localization_mode = "idle"
            self.localization_status_message = "定位服务已关闭"
            self.mapping_active = False
            response["values"] = {"success": True, "message": "定位服务已关闭"}
            print("✓ 定位服务: 已关闭")

        # ========== 遥控器服务 ==========
        elif service == "/joystick/start":
            if self.joystick_active:
                response["values"] = {"success": True, "message": "遥控器已经在运行"}
                print("⚠ 遥控器: 已经在运行")
            else:
                print("🚀 正在启动遥控器...")
                print("   ⏳ 模拟启动过程 (5秒)...")
                await asyncio.sleep(5)  # 模拟启动过程
                self.joystick_active = True
                response["values"] = {"success": True, "message": "遥控器已启动"}
                print("✓ 遥控器: 已启动")
            self.print_system_status()

        elif service == "/joystick/stop":
            if not self.joystick_active:
                response["values"] = {"success": True, "message": "遥控器已经停止"}
                print("⚠ 遥控器: 已经停止")
            else:
                print("🛑 正在停止遥控器...")
                print("   ⏳ 断开连接 (2秒)...")
                await asyncio.sleep(2)  # 模拟停止过程
                self.joystick_active = False
                response["values"] = {"success": True, "message": "遥控器已停止"}
                print("✓ 遥控器: 已停止")
                if self.localization_mode == "mapping":
                    print("⚠ 警告: 建图模式仍在运行，但遥控器已停止")
            self.print_system_status()

        # ========== 系统节点启动服务 (新增) ==========
        elif service == "/system/start_slam_node":
            print("🚀 正在启动SLAM节点...")
            print("   ⏳ 加载SLAM算法 (定位+建图) (4秒)...")
            await asyncio.sleep(4)  # 模拟启动过程

            # 模拟成功率（90%成功）
            if random.random() < 0.9:
                response["values"] = {"success": True, "message": "SLAM节点启动成功"}
                print("✓ 系统节点: SLAM节点已启动")

                # 更新节点状态
                self.slam_running = True
                # 发布SLAM状态话题
                asyncio.create_task(self.publish_slam_status(True))
            else:
                response["values"] = {"success": False, "message": "SLAM节点启动失败：激光雷达未连接"}
                print("✗ 系统节点: SLAM节点启动失败")

        elif service == "/system/start_navigation_node":
            print("🚀 正在启动导航节点...")
            print("   ⏳ 加载move_base/路径规划器 (5秒)...")
            await asyncio.sleep(5)  # 模拟启动过程

            # 模拟成功率（95%成功）
            if random.random() < 0.95:
                response["values"] = {"success": True, "message": "导航节点启动成功"}
                print("✓ 系统节点: 导航节点已启动")

                # 更新节点状态
                self.navigation_node_running = True
                # 发布导航状态话题
                asyncio.create_task(self.publish_navigation_status(True))
            else:
                response["values"] = {"success": False, "message": "导航节点启动失败：costmap参数缺失"}
                print("✗ 系统节点: 导航节点启动失败")
        elif service == "/astribot_chassis/control_type":
            if args["request"] in ["twist", "joy"]:
                self.control_type = args["request"]
                response_msg = self.control_type
                print(f"✓ 控制方式切换: {args['request']}")
            elif args["request"] == "get":
                pass
            else:
                response_msg = f"Invalid control type: {args['request']}. Use 'twist', 'joy', or 'get'"
                print(f"✗ 无效的控制方式请求: {args['request']}")
            response["values"] = {"response": self.control_type}

        # ========== 定位/地图管理服务 (新增) ==========
        elif service == "/map_manager/list_maps":
            # 服务类型: localization_msgs/ListMaps
            # 返回：MapMetadata[] maps（包含完整的元数据和缩略图）
            maps_list = []
            for map_id, map_meta in self.saved_maps.items():
                maps_list.append({
                    "id": map_meta["id"],
                    "name": map_meta["name"],
                    "created_at": map_meta["created_at"],
                    "thumbnail": map_meta.get("thumbnail", ""),  # 包含缩略图
                    "width": map_meta["width"],
                    "height": map_meta["height"],
                    "resolution": map_meta["resolution"],
                    "origin_x": map_meta["origin_x"],
                    "origin_y": map_meta["origin_y"],
                    "origin_orientation": map_meta["origin_orientation"],
                })

            response["values"] = {
                "success": True,
                "message": f"找到 {len(maps_list)} 个地图",
                "maps": maps_list  # MapMetadata[] 类型
            }
            print(f"✓ 定位服务: 列出地图 - 共 {len(maps_list)} 个（含元数据和缩略图）")
            for map_meta in maps_list:
                thumb_len = len(map_meta.get("thumbnail", ""))
                print(f"  - {map_meta['name']} ({map_meta['width']}x{map_meta['height']}, 缩略图: {thumb_len} bytes)")

        elif service == "/map_manager/load_map":
            # 服务类型: localization_msgs/LoadMap
            # 加载指定地图
            map_name = args.get("map_name", "")

            if map_name in self.saved_maps:
                map_meta = self.saved_maps[map_name]

                # 构建完整的地图数据
                map_data = {
                    "header": {
                        "frame_id": "map",
                        "stamp": {"secs": int(time.time()), "nsecs": 0}
                    },
                    "info": {
                        "width": map_meta["width"],
                        "height": map_meta["height"],
                        "resolution": map_meta["resolution"],
                        "origin": {
                            "position": {
                                "x": map_meta["origin_x"],
                                "y": map_meta["origin_y"],
                                "z": 0.0
                            },
                            "orientation": {
                                "x": 0.0,
                                "y": 0.0,
                                "z": map_meta["origin_orientation"],
                                "w": 1.0
                            }
                        }
                    },
                    "data": map_meta.get("data", [])
                }

                response["values"] = {
                    "success": True,
                    "message": f"成功加载地图: {map_name}",
                    "map_data": map_data
                }
                print(f"✓ 定位服务: 加载地图 '{map_name}' - {map_meta['width']}x{map_meta['height']}")
            else:
                response["values"] = {
                    "success": False,
                    "message": f"地图 '{map_name}' 不存在",
                    "map_data": {}
                }
                print(f"✗ 定位服务: 地图 '{map_name}' 不存在")

        elif service == "/map_manager/save_map":
            # 服务类型: localization_msgs/SaveMap
            # 保存地图（保存原生数据和缩略图）
            map_name = args.get("map_name", "")
            map_data = args.get("map_data", {})
            created_at = args.get("created_at", int(time.time()))
            thumbnail = args.get("thumbnail", "")

            if not map_name:
                response["values"] = {
                    "success": False,
                    "message": "地图名称不能为空"
                }
                print("✗ 定位服务: 保存地图失败 - 名称为空")
            elif not map_data:
                response["values"] = {
                    "success": False,
                    "message": "地图数据不能为空"
                }
                print("✗ 定位服务: 保存地图失败 - 数据为空")
            else:
                # 提取地图信息
                info = map_data.get("info", {})
                origin = info.get("origin", {}).get("position", {})
                origin_orientation = info.get("origin", {}).get("orientation", {})

                # 保存地图元数据、完整数据和缩略图
                map_to_save = {
                    "id": map_name,
                    "name": map_name,
                    "created_at": int(created_at),
                    "thumbnail": thumbnail,  # 保存缩略图（base64格式）
                    "width": info.get("width", 0),
                    "height": info.get("height", 0),
                    "resolution": info.get("resolution", 0.05),
                    "origin_x": origin.get("x", 0.0),
                    "origin_y": origin.get("y", 0.0),
                    "origin_orientation": origin_orientation.get("z", 0.0),
                    "data": map_data.get("data", [])
                }

                # 保存到内存
                self.saved_maps[map_name] = map_to_save

                # 保存到磁盘
                disk_success = self.save_map_to_disk(map_name, map_to_save)

                response["values"] = {
                    "success": True,
                    "message": f"地图 '{map_name}' 保存成功"
                }
                thumb_info = f", 缩略图: {len(thumbnail)} bytes" if thumbnail else ""
                print(f"✓ 定位服务: 保存地图 '{map_name}' - {info.get('width')}x{info.get('height')}{thumb_info} (原生数据{', 已写入磁盘' if disk_success else ''})")

        elif service == "/map_manager/delete_map":
            # 服务类型: localization_msgs/DeleteMap
            # 删除地图
            map_name = args.get("map_name", "")

            if map_name in self.saved_maps:
                # 从内存删除
                del self.saved_maps[map_name]

                # 从磁盘删除
                disk_success = self.delete_map_from_disk(map_name)

                response["values"] = {
                    "success": True,
                    "message": f"地图 '{map_name}' 已删除"
                }
                print(f"✓ 定位服务: 删除地图 '{map_name}'{' (已从磁盘删除)' if disk_success else ''}")
            else:
                response["values"] = {
                    "success": False,
                    "message": f"地图 '{map_name}' 不存在"
                }
                print(f"✗ 定位服务: 地图 '{map_name}' 不存在")

        elif service == "/map_manager/apply_map":
            # 服务类型: localization_msgs/ApplyMap
            # 应用地图（设置为当前地图）或设置地图名称（用于建图）
            map_name = args.get("map_name", "")

            if not map_name:
                response["values"] = {
                    "success": False,
                    "message": "地图名称不能为空"
                }
                print("✗ 定位服务: 地图名称不能为空")
            elif map_name in self.saved_maps:
                # 情况1: 地图存在，加载并应用该地图
                map_meta = self.saved_maps[map_name]

                # 将地图设置为当前地图
                self.map_data = {
                    "header": {
                        "frame_id": "map",
                        "stamp": {"secs": int(time.time()), "nsecs": 0}
                    },
                    "info": {
                        "width": map_meta["width"],
                        "height": map_meta["height"],
                        "resolution": map_meta["resolution"],
                        "origin": {
                            "position": {
                                "x": map_meta["origin_x"],
                                "y": map_meta["origin_y"],
                                "z": 0.0
                            },
                            "orientation": {
                                "x": 0.0,
                                "y": 0.0,
                                "z": map_meta["origin_orientation"],
                                "w": 1.0
                            }
                        }
                    },
                    "data": map_meta.get("data", [])
                }

                # 标记已设置当前地图，开始发布
                self.current_map_set = True
                self.current_map_name = map_name  # 记录当前地图名称

                response["values"] = {
                    "success": True,
                    "message": f"地图 '{map_name}' 已应用为当前地图"
                }
                print(f"✓ 定位服务: 应用地图 '{map_name}' 为当前地图")
                print(f"   地图将通过 /map 话题实时发布")
            else:
                # 情况2: 地图不存在，仅设置地图名称（用于建图）
                self.pending_map_name = map_name
                response["values"] = {
                    "success": True,
                    "message": f"地图名称已设置为 '{map_name}'（将用于新建地图）"
                }
                print(f"✓ 定位服务: 地图名称已设置为 '{map_name}'（将用于新建地图）")

        elif service == "/map_manager/get_current_map_name":
            # 服务类型: std_srvs/Trigger
            # 获取当前应用的地图名称（模仿真实ROS行为）
            if self.current_map_name:
                # 地图名称直接放在 message 字段中（std_srvs/Trigger 标准格式）
                response["values"] = {
                    "success": True,
                    "message": self.current_map_name
                }
                print(f"✓ 定位服务: 查询当前地图 - '{self.current_map_name}'")
            else:
                response["values"] = {
                    "success": False,
                    "message": "未设置当前地图"
                }
                print(f"✓ 定位服务: 查询当前地图 - 未设置")

        await websocket.send(json.dumps(response))

    async def publish_map(self, websocket):
        """定期发布地图数据（仅在设置了当前地图后发布）"""
        while websocket in self.clients and "/map" in self.subscriptions:
            # 只有在通过apply_map设置了当前地图后才发布
            if self.current_map_set:
                message = {
                    "op": "publish",
                    "topic": "/map",
                    "msg": self.map_data
                }
                try:
                    await websocket.send(json.dumps(message))
                except:
                    break
            await asyncio.sleep(1.0)

    async def publish_robot_pose(self, websocket):
        """定期发布机器人位姿（使用 nav_msgs/Odometry）"""
        while websocket in self.clients and "/loc_high_freq" in self.subscriptions:
            # 机器人位姿由导航过程更新，这里只负责发布当前位姿
            # 非导航状态下机器人保持静止在当前位置

            message = {
                "op": "publish",
                "topic": "/loc_high_freq",
                "msg": {
                    "header": {
                        "frame_id": "odom",
                        "stamp": {"secs": int(time.time()), "nsecs": 0}
                    },
                    "child_frame_id": "base_link",
                    "pose": {
                        "pose": {
                            "position": {
                                "x": self.robot_pose["x"],
                                "y": self.robot_pose["y"],
                                "z": 0.0
                            },
                            "orientation": {
                                "x": 0.0,
                                "y": 0.0,
                                "z": math.sin(self.robot_pose["theta"] / 2),
                                "w": math.cos(self.robot_pose["theta"] / 2)
                            }
                        },
                        "covariance": [0] * 36
                    },
                    "twist": {
                        "twist": {
                            "linear": {"x": 0.0, "y": 0.0, "z": 0.0},
                            "angular": {"x": 0.0, "y": 0.0, "z": 0.0}
                        },
                        "covariance": [0] * 36
                    }
                }
            }
            try:
                await websocket.send(json.dumps(message))
            except:
                break
            await asyncio.sleep(0.1)

    async def publish_amcl_pose(self, websocket):
        """定期发布 AMCL 位姿估计"""
        while websocket in self.clients and "/amcl_pose" in self.subscriptions:
            message = {
                "op": "publish",
                "topic": "/amcl_pose",
                "msg": {
                    "header": {
                        "frame_id": "map",
                        "stamp": {"secs": int(time.time()), "nsecs": 0}
                    },
                    "pose": {
                        "pose": {
                            "position": {
                                "x": self.robot_pose["x"],
                                "y": self.robot_pose["y"],
                                "z": 0.0
                            },
                            "orientation": {
                                "x": 0.0,
                                "y": 0.0,
                                "z": math.sin(self.robot_pose["theta"] / 2),
                                "w": math.cos(self.robot_pose["theta"] / 2)
                            }
                        },
                        "covariance": [0] * 36
                    }
                }
            }
            try:
                await websocket.send(json.dumps(message))
            except:
                break
            await asyncio.sleep(0.1)

    async def publish_localization_mode(self, websocket):
        """定期发布定位模式状态 /localization/mode (std_msgs/Int32)"""
        # 映射模式字符串到后端模式值
        mode_map = {
            "obstacle_avoidance": 0,
            "mapping": 1,
            "localization": 2,
            "localization_auto": 2,  # 自动定位也是2
            "idle": 3
        }

        while websocket in self.clients and "/localization/mode" in self.subscriptions:
            mode_value = mode_map.get(self.localization_mode, 3)
            message = {
                "op": "publish",
                "topic": "/localization/mode",
                "msg": {
                    "data": mode_value
                }
            }
            try:
                await websocket.send(json.dumps(message))
            except:
                break
            await asyncio.sleep(1.0)  # 每秒发布一次

    async def publish_laser_scan(self, websocket):
        """定期发布雷达扫描数据（sensor_msgs/LaserScan）"""
        while websocket in self.clients and "/scan" in self.subscriptions:
            # 生成模拟的雷达扫描数据
            scan_data = self.generate_laser_scan()

            message = {
                "op": "publish",
                "topic": "/scan",
                "msg": scan_data
            }

            try:
                await websocket.send(json.dumps(message))
            except:
                break
            await asyncio.sleep(0.1)  # 10Hz 发布频率

    def generate_laser_scan(self):
        """生成模拟的雷达扫描数据"""
        # 雷达参数（模拟360度激光雷达）
        angle_min = -math.pi  # -180度
        angle_max = math.pi   # 180度
        angle_increment = math.pi / 180.0  # 1度增量
        num_readings = int((angle_max - angle_min) / angle_increment)

        range_min = 0.15  # 最小距离 15cm
        range_max = 12.0  # 最大距离 12m

        # 获取当前地图数据和机器人位姿
        map_info = self.map_data.get("info", {})
        map_width = map_info.get("width", 384)
        map_height = map_info.get("height", 384)
        resolution = map_info.get("resolution", 0.05)
        origin = map_info.get("origin", {}).get("position", {"x": -10.0, "y": -10.0})
        map_grid = self.map_data.get("data", [])

        robot_x = self.robot_pose["x"]
        robot_y = self.robot_pose["y"]
        robot_theta = self.robot_pose["theta"]

        ranges = []

        # 为每个角度计算距离
        for i in range(num_readings):
            angle = angle_min + i * angle_increment
            # 雷达角度 + 机器人朝向
            world_angle = robot_theta + angle

            # 光线追踪：从机器人位置沿着该角度发射光线
            hit_distance = range_max  # 默认最大距离

            # 步进光线追踪（每次步进0.05米）
            step_size = resolution
            max_steps = int(range_max / step_size)

            for step in range(1, max_steps):
                # 计算当前检测点的世界坐标
                test_distance = step * step_size
                test_x = robot_x + test_distance * math.cos(world_angle)
                test_y = robot_y + test_distance * math.sin(world_angle)

                # 转换为地图栅格坐标
                grid_x = int((test_x - origin["x"]) / resolution)
                grid_y = int((test_y - origin["y"]) / resolution)

                # 检查是否超出地图边界
                if grid_x < 0 or grid_x >= map_width or grid_y < 0 or grid_y >= map_height:
                    hit_distance = test_distance
                    break

                # 获取栅格值
                grid_index = grid_y * map_width + grid_x
                if grid_index < len(map_grid):
                    grid_value = map_grid[grid_index]

                    # 如果碰到障碍物（栅格值 > 50）
                    if grid_value > 50:
                        hit_distance = test_distance
                        break

            # 添加一些噪声使雷达数据更真实
            noise = random.gauss(0, 0.01)  # 1cm标准差的高斯噪声
            final_distance = max(range_min, min(range_max, hit_distance + noise))

            ranges.append(final_distance)

        # 构建LaserScan消息
        return {
            "header": {
                "frame_id": "laser_frame",
                "stamp": {"secs": int(time.time()), "nsecs": 0}
            },
            "angle_min": angle_min,
            "angle_max": angle_max,
            "angle_increment": angle_increment,
            "time_increment": 0.0,  # 0表示所有测量同时进行
            "scan_time": 0.1,  # 扫描周期 0.1秒（10Hz）
            "range_min": range_min,
            "range_max": range_max,
            "ranges": ranges,
            "intensities": []  # 强度数据（可选，这里不生成）
        }

    async def publish_init_status(self, websocket, success: bool):
        """发布初始化状态（单次发送）"""
        if "/localization/init_status" in self.subscriptions:
            message = {
                "op": "publish",
                "topic": "/localization/init_status",
                "msg": {
                    "data": success
                }
            }
            try:
                print(f"📢 发送初始化状态: {'✓ 成功' if success else '✗ 失败'}")
                await websocket.send(json.dumps(message))
            except Exception as e:
                print(f"发送初始化状态失败: {e}")

    async def publish_slam_status(self, is_running: bool):
        """发布SLAM节点状态"""
        print(f"📢 发布SLAM状态: {'运行中' if is_running else '已停止'}")
        # 向所有订阅了/slam/status的客户端发布状态
        if "/slam/status" in self.subscriptions:
            message = {
                "op": "publish",
                "topic": "/slam/status",
                "msg": {
                    "data": is_running
                }
            }
            # 发送给所有订阅的客户端
            for websocket in list(self.subscriptions.get("/slam/status", [])):
                try:
                    await websocket.send(json.dumps(message))
                except:
                    pass

    async def send_slam_status_to_client(self, websocket, is_running: bool):
        """向单个客户端发送SLAM节点状态"""
        print(f"📢 向客户端发送SLAM状态: {'运行中' if is_running else '已停止'}")
        message = {
            "op": "publish",
            "topic": "/slam/status",
            "msg": {
                "data": is_running
            }
        }
        try:
            await websocket.send(json.dumps(message))
        except Exception as e:
            print(f"发送SLAM状态失败: {e}")

    async def publish_navigation_status(self, is_running: bool):
        """发布导航节点状态"""
        print(f"📢 发布导航状态: {'运行中' if is_running else '已停止'}")
        # 向所有订阅了/navigation/status的客户端发布状态
        if "/navigation/status" in self.subscriptions:
            message = {
                "op": "publish",
                "topic": "/navigation/status",
                "msg": {
                    "data": is_running
                }
            }
            # 发送给所有订阅的客户端
            for websocket in list(self.subscriptions.get("/navigation/status", [])):
                try:
                    await websocket.send(json.dumps(message))
                except:
                    pass

    async def send_navigation_status_to_client(self, websocket, is_running: bool):
        """向单个客户端发送导航节点状态"""
        print(f"📢 向客户端发送导航状态: {'运行中' if is_running else '已停止'}")
        message = {
            "op": "publish",
            "topic": "/navigation/status",
            "msg": {
                "data": is_running
            }
        }
        try:
            await websocket.send(json.dumps(message))
        except Exception as e:
            print(f"发送导航状态失败: {e}")

    async def publish_slam_status_periodic(self, websocket):
        """定期向订阅客户端发布SLAM节点状态"""
        print(f"🔄 开始定期发布SLAM状态 (当前: {'运行中' if self.slam_running else '已停止'})")
        while websocket in self.clients and "/slam/status" in self.subscriptions:
            message = {
                "op": "publish",
                "topic": "/slam/status",
                "msg": {
                    "data": self.slam_running
                }
            }
            try:
                if websocket in self.subscriptions.get("/slam/status", set()):
                    await websocket.send(json.dumps(message))
                else:
                    break
            except:
                break
            await asyncio.sleep(2.0)  # 每2秒发布一次
        print("⏹ 停止发布SLAM状态")

    async def publish_navigation_status_periodic(self, websocket):
        """定期向订阅客户端发布导航节点状态"""
        print(f"🔄 开始定期发布导航状态 (当前: {'运行中' if self.navigation_node_running else '已停止'})")
        while websocket in self.clients and "/navigation/status" in self.subscriptions:
            message = {
                "op": "publish",
                "topic": "/navigation/status",
                "msg": {
                    "data": self.navigation_node_running
                }
            }
            try:
                if websocket in self.subscriptions.get("/navigation/status", set()):
                    await websocket.send(json.dumps(message))
                else:
                    print("🔄 导航状态订阅已取消，停止发布")
                    break
            except:
                print("🔄 导航状态发布异常")
                break
            await asyncio.sleep(2.0)  # 每2秒发布一次
        print("⏹ 停止发布导航状态")

    async def process_localization_init(self, websocket):
        """处理定位初始化过程（模拟）- 旧方法，已废弃"""
        # 模拟定位初始化过程（2-3秒）
        import random
        await asyncio.sleep(2 + random.random())  # 2-3秒随机延迟

        # 模拟成功/失败（20%失败率，手动定位比自动定位更可靠）
        success = random.random() > 0.2

        if success:
            print("   ✓ 粒子滤波初始化成功")
            self.localization_status_message = "定位成功（手动）"
        else:
            print("   ✗ 粒子滤波初始化失败")
            self.localization_status_message = "定位失败（手动）"

        # 发送初始化状态
        await self.publish_init_status(websocket, success)

    async def process_manual_localization(self):
        """处理手动重定位过程（新方法）"""
        try:
            # 模拟粒子滤波初始化过程（2-3秒）
            import random
            await asyncio.sleep(2 + random.random())

            # 模拟成功/失败（20%失败率，手动定位比自动定位更可靠）
            success = random.random() > 0.2

            if success:
                print("   ✓ 粒子滤波初始化成功")
                self.localization_status_message = "定位成功（手动）"
                # 设置为定位模式
                self.localization_mode = "localization"
                self.localization_result = {
                    "success": True,
                    "message": "机器人位置初始化成功"
                }
            else:
                print("   ✗ 粒子滤波初始化失败")
                self.localization_status_message = "定位失败（手动）"
                # 失败时回到 idle 模式
                self.localization_mode = "idle"
                self.localization_result = {
                    "success": False,
                    "message": "粒子滤波收敛失败，无法确定机器人位置"
                }

            # 通知等待的服务调用
            if self.localization_event:
                self.localization_event.set()

        except Exception as e:
            print(f"   ✗ 手动重定位过程出错: {e}")
            self.localization_mode = "idle"
            self.localization_result = {
                "success": False,
                "message": f"重定位过程异常: {str(e)}"
            }
            if self.localization_event:
                self.localization_event.set()

    async def handle_action_goal(self, websocket, data):
        """处理导航 Action Goal (通过 send_action_goal 消息)"""
        action = data.get("action")
        # 支持两种字段名: type (rosbridge标准) 或 action_type (前端使用)
        action_type = data.get("type") or data.get("action_type")
        action_type_normalized = normalize_message_type(action_type) if action_type else ""
        goal = data.get("goal", {})
        action_id = data.get("id", "")

        print(f"📥 收到 Action Goal (send_action_goal): {action} ({action_type_normalized})")
        print(f"   Action ID: {action_id}")
        print(f"   完整 goal 数据: {goal}")
        print(f"   目标位姿: {goal.get('target_pose', {})}")

        if action == "/move_chassis_to_server":
            await self.process_navigation_goal(websocket, action_id, goal)

    async def handle_action_goal_from_topic(self, websocket, action_id: str, goal: dict):
        """处理导航 Action Goal (通过话题发布)"""
        print(f"📥 处理 Action Goal (从话题)")
        await self.process_navigation_goal(websocket, action_id, goal)

    async def process_navigation_goal(self, websocket, action_id: str, goal: dict):
        """处理导航目标的核心逻辑"""
        # 保存导航目标
        target_pose = goal.get("target_pose", {}).get("pose", {})
        position = target_pose.get("position", {})
        orientation = target_pose.get("orientation", {})

        # 提取目标坐标
        goal_x = position.get("x", 0.0)
        goal_y = position.get("y", 0.0)
        goal_z = orientation.get("z", 0.0)
        goal_w = orientation.get("w", 1.0)
        goal_theta = 2.0 * math.atan2(goal_z, goal_w)

        self.navigation_goal = {"x": goal_x, "y": goal_y, "theta": goal_theta}
        self.navigation_start_pose = dict(self.robot_pose)
        self.navigation_start_time = time.time()
        self.navigation_active = True

        # 提取任务配置和导航参数
        # ROS2格式: config参数在嵌套的config对象中
        use_default_config = goal.get("use_default_config", True)
        config = goal.get("config", {})
        safe_dist = config.get("safe_dist", 0.2)
        v_max = config.get("v_max", 0.5)
        w_max = config.get("w_max", 1.0)
        a_max = config.get("a_max", 0.5)
        dw_max = config.get("dw_max", 1.0)
        is_holonomic = config.get("is_holonomic", False)

        print(f"导航参数: use_default={use_default_config}, safe_dist={safe_dist}, v_max={v_max}, w_max={w_max}")
        print(f"         a_max={a_max}, dw_max={dw_max}, is_holonomic={is_holonomic}")

        # 提取任务配置（如果有）
        tasks_json = goal.get("tasks", "")
        if tasks_json:
            try:
                self.navigation_tasks = json.loads(tasks_json)
                print(f"收到 {len(self.navigation_tasks)} 个附加任务:")
                for i, task in enumerate(self.navigation_tasks):
                    print(f"  任务 {i+1}: {task.get('type')} - {task.get('params', {})}")
            except json.JSONDecodeError:
                print(f"解析任务配置失败: {tasks_json}")
                self.navigation_tasks = []
        else:
            self.navigation_tasks = []

        print(f"🚀 开始导航: 从 ({self.robot_pose['x']:.2f}, {self.robot_pose['y']:.2f}) 到 ({goal_x:.2f}, {goal_y:.2f})")
        print(f"   导航目标已设置: {self.navigation_goal}")
        print(f"   navigation_active: {self.navigation_active}")

        # 启动导航任务
        print(f"   创建导航模拟任务...")
        try:
            task = asyncio.create_task(self.simulate_navigation(websocket, action_id))
            print(f"   ✅ 导航任务已创建: {task}")
        except Exception as e:
            print(f"   ❌ 创建导航任务失败: {e}")
            import traceback
            traceback.print_exc()

    async def handle_cancel_action(self, websocket, data):
        """处理取消导航"""
        action_id = data.get("id", "")
        print(f"取消导航: {action_id}")

        self.navigation_active = False

        # 发送取消结果（使用 rosbridge action 协议格式）
        result_message = {
            "op": "action_result",
            "id": action_id,
            "action": "/move_chassis_to_server",
            "status": 5,  # ROS2: STATUS_CANCELED = 5
            "values": {
                "result": False,
                "result_text": "Navigation cancelled by user",
                "final_pose": {},
                "navigation_time": 0.0
            }
        }
        await self._send_message_to_all_clients(result_message)

        try:
            await websocket.send(json.dumps(result_message))
            print(f"   ✅ 取消结果已发送")
        except:
            pass

    async def simulate_navigation(self, websocket, action_id):
        """模拟导航过程"""
        try:
            print(f"\n🎯 simulate_navigation 开始执行")
            print(f"   websocket: {websocket}")
            print(f"   action_id: {action_id}")
            print(f"   navigation_goal: {self.navigation_goal}")

            if not self.navigation_goal:
                print(f"   ⚠️  navigation_goal 为空，退出")
                return

            goal_x = self.navigation_goal["x"]
            goal_y = self.navigation_goal["y"]
            goal_theta = self.navigation_goal["theta"]

            # 计算总距离
            start_x = self.navigation_start_pose["x"]
            start_y = self.navigation_start_pose["y"]
            total_distance = math.sqrt((goal_x - start_x)**2 + (goal_y - start_y)**2)

            # 模拟导航时间（假设速度 0.5 m/s）
            navigation_duration = max(total_distance / 0.5, 3.0)  # 至少3秒

            print(f"   📏 模拟导航: 距离 {total_distance:.2f}m, 预计用时 {navigation_duration:.1f}s")

            # 发送状态: STATUS_ACCEPTED (ROS2: 1)
            await self.send_action_status(websocket, action_id, 1)
            await asyncio.sleep(0.5)

            # 发送状态: STATUS_EXECUTING (ROS2: 2)
            await self.send_action_status(websocket, action_id, 2)

            # 模拟导航过程，发送反馈
            steps = 20
            for i in range(steps):
                if not self.navigation_active:
                    print("   导航已取消")
                    return

                # 计算当前进度
                progress = (i + 1) / steps

                # 插值计算当前位置
                current_x = start_x + (goal_x - start_x) * progress
                current_y = start_y + (goal_y - start_y) * progress
                current_theta = goal_theta  # 简化处理，直接使用目标角度

                # 更新机器人位姿
                self.robot_pose["x"] = current_x
                self.robot_pose["y"] = current_y
                self.robot_pose["theta"] = current_theta

                # 计算剩余距离
                remaining_distance = math.sqrt((goal_x - current_x)**2 + (goal_y - current_y)**2)
                eta = remaining_distance / 0.5

                # 发送反馈（使用 rosbridge action 协议格式）
                feedback_message = {
                    "op": "action_feedback",
                    "id": action_id,
                    "action": "/move_chassis_to_server",
                    "values": {
                        "current_status": {
                            "status": 1,  # ACTIVE
                            "message": "Navigating to goal"
                        },
                        "current_pose": {
                            "header": {
                                "stamp": {"sec": int(time.time()), "nanosec": 0},
                                "frame_id": "map"
                            },
                            "pose": {
                                "position": {"x": current_x, "y": current_y, "z": 0.0},
                                "orientation": {
                                    "x": 0.0,
                                    "y": 0.0,
                                    "z": math.sin(current_theta / 2),
                                    "w": math.cos(current_theta / 2)
                                }
                            }
                        },
                        "distance_to_goal": remaining_distance,
                        "elapsed_time": time.time() - self.navigation_start_time,
                        # 兼容旧格式
                        "progress": progress,
                        "eta": eta
                    }
                }

                await self._send_message_to_all_clients(feedback_message)
                await asyncio.sleep(navigation_duration / steps)

            # 检查是否被取消
            if not self.navigation_active:
                return

            # 确保机器人到达目标位置
            self.robot_pose["x"] = goal_x
            self.robot_pose["y"] = goal_y
            self.robot_pose["theta"] = goal_theta

            print(f"   ✅ 导航完成: 到达目标点 ({goal_x:.2f}, {goal_y:.2f})")

            # 执行附加任务（如果有）
            if self.navigation_tasks:
                print(f"\n开始执行 {len(self.navigation_tasks)} 个附加任务...")
                await self.execute_tasks(websocket, action_id, self.navigation_tasks)

            # 导航成功
            self.navigation_active = False
            print(f"   🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉 导航任务成功完成!  ({goal_x:.2f}, {goal_y:.2f})")

            # 发送成功结果（使用 rosbridge action 协议格式）
            result_message = {
                "op": "action_result",
                "id": action_id,
                "action": "/move_chassis_to_server",
                "status": 4,  # ROS2: STATUS_SUCCEEDED = 4
                "values": {
                    "result": True,
                    "result_text": "Successfully reached the goal",
                    "final_pose": {
                        "header": {
                            "stamp": {"sec": int(time.time()), "nanosec": 0},
                            "frame_id": "map"
                        },
                        "pose": {
                            "position": {"x": goal_x, "y": goal_y, "z": 0.0},
                            "orientation": {
                                "x": 0.0,
                                "y": 0.0,
                                "z": math.sin(goal_theta / 2),
                                "w": math.cos(goal_theta / 2)
                            }
                        }
                    },
                    "navigation_time": time.time() - self.navigation_start_time
                }
            }

            try:
                await websocket.send(json.dumps(result_message))
                print(f"   ✅ 导航结果已发送: status={result_message['status']}, result=True")
            except Exception as e:
                print(f"   ❌ 发送导航结果失败: {e}")

        except Exception as e:
            print(f"\n❌ simulate_navigation 执行出错:")
            print(f"   错误类型: {type(e).__name__}")
            print(f"   错误信息: {e}")
            import traceback
            traceback.print_exc()

            # 发送失败结果（使用 rosbridge action 协议格式）
            try:
                result_message = {
                    "op": "action_result",
                    "id": action_id,
                    "action": "/move_chassis_to_server",
                    "status": 6,  # ROS2: STATUS_ABORTED = 6
                    "values": {
                        "result": False,
                        "result_text": f"Navigation failed: {str(e)}",
                        "final_pose": {},
                        "navigation_time": 0.0
                    }
                }

                await websocket.send(json.dumps(result_message))
                print(f"   ✅ 导航失败结果已发送")
            except:
                pass

    async def simulate_local_navigation(self, goal_x, goal_y, goal_theta):
        """模拟局部导航（小范围快速移动，固定3秒）"""
        # 记录起始位置
        start_x = self.robot_pose["x"]
        start_y = self.robot_pose["y"]
        start_theta = self.robot_pose["theta"]

        # 计算距离
        total_distance = math.sqrt((goal_x - start_x)**2 + (goal_y - start_y)**2)

        print(f"🚀 开始局部导航: 距离 {total_distance:.2f}m, 用时 3.0s")

        # 固定3秒，分20步完成
        duration = 3.0
        steps = 20
        step_delay = duration / steps

        for i in range(steps):
            # 计算当前进度
            progress = (i + 1) / steps

            # 线性插值计算当前位置
            current_x = start_x + (goal_x - start_x) * progress
            current_y = start_y + (goal_y - start_y) * progress
            current_theta = start_theta + (goal_theta - start_theta) * progress

            # 更新机器人位姿
            self.robot_pose["x"] = current_x
            self.robot_pose["y"] = current_y
            self.robot_pose["theta"] = current_theta

            # 等待
            await asyncio.sleep(step_delay)

        # 确保到达精确位置
        self.robot_pose["x"] = goal_x
        self.robot_pose["y"] = goal_y
        self.robot_pose["theta"] = goal_theta

        print(f"✓ 局部导航完成: 到达目标点 ({goal_x:.2f}, {goal_y:.2f}, {goal_theta:.2f})")

    async def execute_tasks(self, websocket, action_id, tasks):
        """执行附加任务列表"""
        for i, task in enumerate(tasks):
            if not self.navigation_active:
                print("任务执行被取消")
                return

            task_type = task.get("type", "unknown")
            task_params = task.get("params", {})
            task_name = task.get("name", f"任务 {i+1}")

            print(f"\n执行任务 {i+1}/{len(tasks)}: {task_name} ({task_type})")

            # 发送任务反馈
            feedback_message = {
                "op": "action_feedback",
                "id": action_id,
                "action": "/move_chassis_to_server",
                "values": {
                    "current_task": f"{task_name} ({task_type})",
                    "distance_to_goal": 0.0,
                    "progress": 1.0,
                }
            }

            try:
                await self._send_message_to_all_clients(feedback_message)
            except:
                pass

            # 根据任务类型执行不同的操作
            if task_type == "wait":
                # 等待任务
                duration = task_params.get("duration", 5)
                print(f"  等待 {duration} 秒...")
                await asyncio.sleep(duration)
                print(f"  等待完成")

            elif task_type == "photo":
                # 拍照任务
                camera_id = task_params.get("cameraId", "default")
                count = task_params.get("count", 1)
                interval = task_params.get("interval", 1)
                print(f"  使用相机 {camera_id} 拍摄 {count} 张照片...")
                for j in range(count):
                    print(f"    拍照 {j+1}/{count}")
                    await asyncio.sleep(interval if j < count - 1 else 0.5)
                print(f"  拍照完成")

            elif task_type == "trajectory":
                # 轨迹任务
                trajectory_id = task_params.get("trajectoryId", "unknown")
                print(f"  执行轨迹 {trajectory_id}...")
                await asyncio.sleep(2)
                print(f"  轨迹执行完成")

            elif task_type == "scan":
                # 扫描任务
                scan_type = task_params.get("scanType", "3d")
                duration = task_params.get("duration", 5)
                scan_range = task_params.get("range", 5.0)
                print(f"  执行 {scan_type} 扫描 (范围: {scan_range}m, 时长: {duration}s)...")
                await asyncio.sleep(duration)
                print(f"  扫描完成，已保存扫描数据")

            elif task_type == "inspect":
                # 目标检测任务
                target_type = task_params.get("targetType", "object")
                confidence = task_params.get("confidenceThreshold", 0.7)
                timeout = task_params.get("timeout", 10)
                print(f"  开始检测目标: {target_type} (置信度阈值: {confidence})...")
                await asyncio.sleep(2)
                # 模拟检测结果
                detected = random.random() > 0.3
                if detected:
                    print(f"  检测成功: 发现 {target_type}")
                else:
                    print(f"  未检测到目标: {target_type}")

            elif task_type == "sound":
                # 声音任务
                text = task_params.get("text", "")
                audio_file = task_params.get("audioFile", "")
                volume = task_params.get("volume", 70)
                language = task_params.get("language", "zh-CN")
                print(f"  播放声音 (音量: {volume}%):")
                if text:
                    print(f"    TTS文本: {text} (语言: {language})")
                elif audio_file:
                    print(f"    音频文件: {audio_file}")
                await asyncio.sleep(1.5)
                print(f"  声音播放完成")

            elif task_type == "display":
                # 显示信息任务
                message_text = task_params.get("message", "")
                duration = task_params.get("duration", 5)
                position = task_params.get("position", "center")
                print(f"  显示消息 ({position}): {message_text}")
                print(f"  显示时长: {duration}秒")
                await asyncio.sleep(duration)
                print(f"  消息显示完成")

            elif task_type == "signal":
                # 信号灯任务
                pattern = task_params.get("pattern", "blink")
                color = task_params.get("color", "green")
                duration = task_params.get("duration", 3)
                frequency = task_params.get("frequency", 2)
                print(f"  信号灯: {color} {pattern} (频率: {frequency}Hz)")
                await asyncio.sleep(duration)
                print(f"  信号灯关闭")

            elif task_type == "pickup":
                # 拾取任务
                object_type = task_params.get("objectType", "object")
                grasp_type = task_params.get("graspType", "top")
                force = task_params.get("force", 50)
                print(f"  准备拾取物体: {object_type} (抓取方式: {grasp_type}, 力度: {force}%)")
                await asyncio.sleep(2)
                # 模拟成功率
                success = random.random() > 0.2
                if success:
                    print(f"  拾取成功")
                else:
                    print(f"  拾取失败，请重试")

            elif task_type == "place":
                # 放置任务
                location = task_params.get("location", {"x": 0, "y": 0, "z": 0})
                place_type = task_params.get("placeType", "normal")
                print(f"  放置物体到 ({location['x']:.2f}, {location['y']:.2f}, {location['z']:.2f})")
                print(f"  放置方式: {place_type}")
                await asyncio.sleep(1.5)
                print(f"  放置完成")

            elif task_type == "charge":
                # 充电任务
                target_level = task_params.get("targetLevel", 100)
                print(f"  开始充电，目标电量: {target_level}%")
                # 模拟充电过程
                for i in range(3):
                    await asyncio.sleep(1)
                    current_level = 50 + (i + 1) * 10
                    print(f"    当前电量: {current_level}%")
                print(f"  充电完成")

            elif task_type == "sequence":
                # 顺序任务
                sub_tasks = task_params.get("tasks", [])
                print(f"  开始执行顺序任务 ({len(sub_tasks)} 个子任务)")
                await self.execute_tasks(websocket, action_id, sub_tasks)

            elif task_type == "parallel":
                # 并行任务
                sub_tasks = task_params.get("tasks", [])
                print(f"  开始并行执行任务 ({len(sub_tasks)} 个子任务)")
                # 简化处理：顺序执行但打印为并行
                await self.execute_tasks(websocket, action_id, sub_tasks)

            else:
                print(f"  未知任务类型: {task_type}，跳过")
                await asyncio.sleep(0.5)

        print(f"\n所有任务执行完成！")

    async def send_action_status(self, websocket, action_id, status):
        """发送 Action 状态（使用 rosbridge 协议格式）"""
        # ROS2 action status codes:
        # 0: STATUS_UNKNOWN, 1: STATUS_ACCEPTED, 2: STATUS_EXECUTING
        # 3: STATUS_CANCELING, 4: STATUS_SUCCEEDED, 5: STATUS_CANCELED, 6: STATUS_ABORTED
        status_names = {
            0: "UNKNOWN",
            1: "ACCEPTED",
            2: "EXECUTING",
            3: "CANCELING",
            4: "SUCCEEDED",
            5: "CANCELED",
            6: "ABORTED"
        }

        # 发送 rosbridge 协议格式的状态消息
        status_message = {
            "op": "status",
            "id": action_id,
            "action": "/move_chassis_to_server",
            "status": status
        }

        try:
            await self._send_message_to_all_clients(status_message)
            print(f"   📊 发送状态: {status_names.get(status, 'UNKNOWN')}")
        except Exception as e:
            print(f"   ❌ 发送状态失败: {e}")

# 地图存储目录
MAPS_DIR = Path(__file__).parent / "saved_maps"
MAPS_DIR.mkdir(exist_ok=True)

# 导航配置存储目录
NAV_CONFIG_DIR = Path(__file__).parent / "saved_nav_configs"
NAV_CONFIG_DIR.mkdir(exist_ok=True)
NAV_CONFIG_FILE = NAV_CONFIG_DIR / "navigation_config.json"


class MapStorageHandler:
    """HTTP API 处理地图存储"""

    async def get_all_maps(self, request):
        """获取所有地图元数据"""
        try:
            maps = []
            if MAPS_DIR.exists():
                for map_file in MAPS_DIR.glob("*.json"):
                    with open(map_file, 'r', encoding='utf-8') as f:
                        map_data = json.load(f)
                        # 只返回元数据，不包含大量的地图数据
                        metadata = {k: v for k, v in map_data.items() if k != 'data'}
                        metadata['id'] = map_file.stem
                        maps.append(metadata)

            return web.json_response(maps)
        except Exception as e:
            return web.json_response({'error': str(e)}, status=500)

    async def get_map(self, request):
        """获取单个地图的完整数据"""
        try:
            map_id = request.match_info['map_id']
            map_file = MAPS_DIR / f"{map_id}.json"

            if not map_file.exists():
                return web.json_response({'error': '地图不存在'}, status=404)

            with open(map_file, 'r', encoding='utf-8') as f:
                map_data = json.load(f)
                map_data['id'] = map_id
                return web.json_response(map_data)
        except Exception as e:
            return web.json_response({'error': str(e)}, status=500)

    async def save_map(self, request):
        """保存地图"""
        try:
            data = await request.json()
            map_id = data.get('id')

            if not map_id:
                return web.json_response({'error': '缺少地图ID'}, status=400)

            map_file = MAPS_DIR / f"{map_id}.json"

            # 保存地图数据
            with open(map_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)

            print(f"✓ 地图已保存到服务器: {map_file}")
            return web.json_response({'success': True, 'message': f'地图 {data.get("name")} 已保存'})
        except Exception as e:
            print(f"✗ 保存地图失败: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def delete_map(self, request):
        """删除地图"""
        try:
            map_id = request.match_info['map_id']
            map_file = MAPS_DIR / f"{map_id}.json"

            if not map_file.exists():
                return web.json_response({'error': '地图不存在'}, status=404)

            os.remove(map_file)
            print(f"✓ 地图已删除: {map_id}")
            return web.json_response({'success': True, 'message': '地图已删除'})
        except Exception as e:
            return web.json_response({'error': str(e)}, status=500)


class NavigationConfigHandler:
    """HTTP API 处理导航配置存储"""

    async def get_config(self, request):
        """获取导航配置"""
        try:
            if not NAV_CONFIG_FILE.exists():
                return web.json_response({'success': False, 'message': '配置不存在'}, status=404)

            with open(NAV_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return web.json_response({'success': True, 'data': config})
        except Exception as e:
            print(f"✗ 读取导航配置失败: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)

    async def save_config(self, request):
        """保存导航配置"""
        try:
            data = await request.json()
            config = data.get('config', {})

            # 保存配置到文件
            with open(NAV_CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)

            print(f"✓ 导航配置已保存到: {NAV_CONFIG_FILE}")
            return web.json_response({'success': True, 'message': '导航配置已保存'})
        except Exception as e:
            print(f"✗ 保存导航配置失败: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)

    async def delete_config(self, request):
        """删除导航配置"""
        try:
            if NAV_CONFIG_FILE.exists():
                os.remove(NAV_CONFIG_FILE)
                print(f"✓ 导航配置已删除")
                return web.json_response({'success': True, 'message': '导航配置已删除'})
            else:
                return web.json_response({'success': False, 'message': '配置不存在'}, status=404)
        except Exception as e:
            print(f"✗ 删除导航配置失败: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)



async def create_http_server():
    """创建 HTTP API 服务器"""
    app = web.Application()
    map_handler = MapStorageHandler()
    nav_config_handler = NavigationConfigHandler()

    # 配置地图存储路由
    app.router.add_get('/api/maps', map_handler.get_all_maps)
    app.router.add_get('/api/maps/{map_id}', map_handler.get_map)
    app.router.add_post('/api/maps', map_handler.save_map)
    app.router.add_delete('/api/maps/{map_id}', map_handler.delete_map)

    # 配置导航配置存储路由
    app.router.add_get('/api/navigation-config', nav_config_handler.get_config)
    app.router.add_post('/api/navigation-config', nav_config_handler.save_config)
    app.router.add_delete('/api/navigation-config', nav_config_handler.delete_config)

    # 启用 CORS
    async def cors_middleware(app, handler):
        async def middleware_handler(request):
            if request.method == 'OPTIONS':
                return web.Response(
                    headers={
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    }
                )
            response = await handler(request)
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response
        return middleware_handler

    app.middlewares.append(cors_middleware)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, 'localhost', 8080)
    await site.start()
    return runner


async def main():
    print("=" * 60)
    print("模拟ROS Bridge WebSocket服务器 + HTTP API")
    print("=" * 60)

    # 初始化 MockROSBridge（会自动从磁盘加载地图）
    bridge = MockROSBridge()
    print()

    print("WebSocket地址: ws://localhost:9090")
    print("HTTP API地址: http://localhost:8080")
    print()
    print("支持的功能:")
    print("  ✓ 地图数据发布 (/map)")
    print("  ✓ 机器人高频位姿发布 (/loc_high_freq)")
    print("  ✓ AMCL位姿估计 (/amcl_pose)")
    print("  ✓ 激光雷达扫描数据 (/scan) - 模拟360度激光雷达")
    print("  ✓ 初始位姿设置 (/initialpose)")
    print()
    print("定位服务 (Localization Service):")
    print("  ✓ 建图模式 (/localization/start_mapping)")
    print("  ✓ 定位模式-手动 (/localization/start_localization)")
    print("  ✓ 定位模式-自动 (/localization/start_localization_auto)")
    print("  ✓ 纯避障模式 (/localization/start_obstacle_avoidance)")
    print("  ✓ 停止服务 (/localization/stop)")
    print("  ✓ 关闭服务 (/localization/shutdown)")
    print("  ✓ 模式状态发布 (/localization/mode - std_msgs/Int32)")
    print("    - 0: obstacle avoidance, 1: mapping, 2: localization, 3: idle")
    print()
    print("地图管理服务 (Localization Map Management):")
    print("  ✓ 列出地图 (/map_manager/list_maps)")
    print("  ✓ 加载地图 (/map_manager/load_map)")
    print("  ✓ 保存地图 (/map_manager/save_map)")
    print("  ✓ 删除地图 (/map_manager/delete_map)")
    print("  ✓ 应用地图 (/map_manager/apply_map)")
    print("  ✓ 获取当前地图 (/map_manager/get_current_map_name)")
    print()
    print("建图服务 (旧接口, 兼容性保留):")
    print("  ✓ 启动建图 (/start_mapping)")
    print("  ✓ 停止建图 (/stop_mapping)")
    print("  ✓ 地图保存 (/save_map)")
    print()
    print("导航服务:")
    print("  ✓ 导航 Action (/move_chassis_to_server)")
    print("    - 模拟导航过程（状态、反馈、结果）")
    print("    - 实时位置插值")
    print("    - 支持取消导航")
    print("    - 支持附加任务（15+ 任务类型）")
    print()
    print("HTTP API 端点:")
    print("  GET    /api/maps          - 获取所有地图")
    print("  GET    /api/maps/{id}     - 获取单个地图")
    print("  POST   /api/maps          - 保存地图")
    print("  DELETE /api/maps/{id}     - 删除地图")
    print("  GET    /api/navigation-config     - 获取导航配置")
    print("  POST   /api/navigation-config    - 保存导航配置")
    print("  DELETE /api/navigation-config    - 删除导航配置")
    print()
    print(f"Mock地图存储位置: {MAPS_STORAGE_DIR.absolute()}")
    print(f"HTTP地图存储位置: {MAPS_DIR.absolute()}")
    print(f"导航配置存储位置: {NAV_CONFIG_DIR.absolute()}")
    print("=" * 60)
    print("按 Ctrl+C 停止服务器")
    print()

    # 启动 HTTP 服务器
    http_runner = await create_http_server()
    print("✓ HTTP API 服务器已启动")

    # 启动 WebSocket 服务器（设置更大的消息大小限制以支持地图数据传输）
    async with websockets.serve(
        bridge.handle_client,
        "localhost",
        9090,
        max_size=50 * 1024 * 1024  # 50MB 消息大小限制（支持大地图传输）
    ):
        print("✓ WebSocket 服务器已启动 (max_size: 50MB)")
        await asyncio.Future()  # 永久运行

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n服务器已停止")
