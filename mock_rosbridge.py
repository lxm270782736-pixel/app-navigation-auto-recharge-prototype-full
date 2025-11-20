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

# 地图存储目录
MAPS_STORAGE_DIR = Path(__file__).parent / "mock_saved_maps"
MAPS_STORAGE_DIR.mkdir(exist_ok=True)

class MockROSBridge:
    def __init__(self):
        self.clients = set()
        self.subscriptions = {}
        self.mapping_active = False
        self.map_data = self.generate_sample_map()
        # 初始位置设置在地图中心可见区域
        self.robot_pose = {"x": 2.0, "y": 2.0, "theta": 0.0}
        self.movement_time = 0.0
        # 导航状态
        self.navigation_active = False
        self.navigation_goal = None
        self.navigation_start_pose = None
        self.navigation_start_time = 0.0
        self.navigation_tasks = []
        # 定位服务状态
        self.localization_mode = "idle"  # idle, mapping, localization, localization_auto, obstacle_avoidance
        self.localization_status_message = "未启动"
        # 遥控器状态
        self.joystick_active = False
        # 地图存储（模拟数据库）
        self.saved_maps = {}  # {map_id: map_metadata}

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
                        map_id = map_data.get("id", map_file.stem)
                        self.saved_maps[map_id] = map_data
                        print(f"✓ 已加载地图: {map_data.get('name', map_id)}")
                except Exception as e:
                    print(f"✗ 加载地图文件 {map_file} 失败: {e}")

            print(f"📂 从磁盘加载了 {len(self.saved_maps)} 个地图")
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
                await self.handle_action_goal(websocket, data)
            elif op == "cancel_action_goal":
                await self.handle_cancel_action(websocket, data)

        except json.JSONDecodeError:
            print(f"无效的JSON消息: {message}")

    async def handle_subscribe(self, websocket, data):
        """处理话题订阅"""
        topic = data.get("topic")
        msg_type = data.get("type")

        print(f"订阅话题: {topic} ({msg_type})")

        if topic not in self.subscriptions:
            self.subscriptions[topic] = set()
        self.subscriptions[topic].add(websocket)

        # 开始发布该话题的数据
        if topic == "/map":
            asyncio.create_task(self.publish_map(websocket))
        elif topic == "/odom":
            asyncio.create_task(self.publish_robot_pose(websocket))
        elif topic == "/amcl_pose":
            asyncio.create_task(self.publish_amcl_pose(websocket))
        elif topic == "/localization/status":
            asyncio.create_task(self.publish_localization_status(websocket))

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

            print(f"机器人位姿已更新: {self.robot_pose}")

    async def handle_service_call(self, websocket, data):
        """处理服务调用"""
        service = data.get("service")
        service_type = data.get("type")
        args = data.get("args", {})
        call_id = data.get("id")

        print(f"服务调用: {service} ({service_type})")

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
            print("🗺️  正在启动建图节点...")
            print("   ⏳ 初始化SLAM算法 (5秒)...")
            await asyncio.sleep(5)  # 模拟建图节点启动过程
            self.localization_mode = "mapping"
            self.localization_status_message = "建图模式已启动"
            self.mapping_active = True
            response["values"] = {"success": True, "message": "建图模式已启动"}
            print(f"✓ 定位服务: 建图模式已启动 (遥控器状态: {'已启动' if self.joystick_active else '未启动'})")
            self.print_system_status()

        elif service == "/localization/start_localization":
            print("📍 正在启动定位模式（手动）...")
            print("   ⏳ 等待初始位置设置...")
            self.localization_mode = "localization"
            self.localization_status_message = "定位中（手动）..."
            # 先返回启动消息
            response["values"] = {"success": True, "message": "定位模式已启动（手动）"}
            await websocket.send(json.dumps(response))
            # 模拟定位过程
            print("   ⏳ 粒子滤波定位中 (10秒)...")
            await asyncio.sleep(10)
            # 模拟成功/失败 (20%失败率)
            import random
            if random.random() < 0.5:
                self.localization_status_message = "定位失败（手动）: 粒子收敛失败"
                print("✗ 定位服务: 定位失败（手动）- 粒子收敛失败")
            else:
                self.localization_status_message = "定位成功（手动）"
                print("✓ 定位服务: 定位完成（手动）")
            self.print_system_status()
            return  # 已经发送过response，直接返回

        elif service == "/localization/start_localization_auto":
            print("📍 正在启动定位模式（自动）...")
            print("   ⏳ 自动搜索机器人位置...")
            self.localization_mode = "localization_auto"
            self.localization_status_message = "定位中（自动）..."
            # 先返回启动消息
            response["values"] = {"success": True, "message": "定位模式已启动（自动）"}
            await websocket.send(json.dumps(response))
            # 模拟定位过程
            print("   ⏳ 全局定位计算中 (10秒)...")
            await asyncio.sleep(10)
            # 模拟成功/失败 (20%失败率)
            import random
            if random.random() < 0.5:
                self.localization_status_message = "定位失败（自动）: 无法找到匹配位置"
                print("✗ 定位服务: 定位失败（自动）- 无法找到匹配位置")
            else:
                self.localization_status_message = "定位成功（自动）"
                print("✓ 定位服务: 定位完成（自动）")
            self.print_system_status()
            return  # 已经发送过response，直接返回

        elif service == "/localization/start_obstacle_avoidance":
            self.localization_mode = "obstacle_avoidance"
            self.localization_status_message = "纯避障模式已启动"
            response["values"] = {"success": True, "message": "纯避障模式已启动"}
            print("✓ 定位服务: 纯避障模式已启动")

        elif service == "/localization/stop":
            was_mapping = self.mapping_active
            if was_mapping:
                print("🛑 正在停止建图节点...")
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

        # ========== 定位/地图管理服务 (新增) ==========
        elif service == "/localization/list_maps":
            # 列出所有已保存的地图元数据（不包含 data，不生成缩略图）
            maps_list = []
            for map_id, map_meta in self.saved_maps.items():
                maps_list.append({
                    "id": map_meta["id"],
                    "name": map_meta["name"],
                    "created_at": map_meta["created_at"],
                    "thumbnail": "",  # 前端按需生成
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
                "maps": maps_list
            }
            print(f"✓ 定位服务: 列出地图 - 共 {len(maps_list)} 个")

        elif service == "/localization/load_map":
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

        elif service == "/localization/save_map":
            # 保存地图（保存原生数据，不保存缩略图）
            map_name = args.get("map_name", "")
            map_data = args.get("map_data", {})
            created_at = args.get("created_at", int(time.time()))

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

                # 保存地图元数据和完整数据（不保存缩略图）
                map_to_save = {
                    "id": map_name,
                    "name": map_name,
                    "created_at": int(created_at),
                    "thumbnail": "",  # 不保存缩略图，按需从原图生成
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
                print(f"✓ 定位服务: 保存地图 '{map_name}' - {info.get('width')}x{info.get('height')} (原生数据{', 已写入磁盘' if disk_success else ''})")

        elif service == "/localization/delete_map":
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

        elif service == "/localization/apply_map":
            # 应用地图（设置为当前地图）
            map_name = args.get("map_name", "")

            if map_name in self.saved_maps:
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

                response["values"] = {
                    "success": True,
                    "message": f"地图 '{map_name}' 已应用为当前地图"
                }
                print(f"✓ 定位服务: 应用地图 '{map_name}' 为当前地图")
                print(f"   地图将通过 /map 话题实时发布")
            else:
                response["values"] = {
                    "success": False,
                    "message": f"地图 '{map_name}' 不存在"
                }
                print(f"✗ 定位服务: 地图 '{map_name}' 不存在")

        await websocket.send(json.dumps(response))

    async def publish_map(self, websocket):
        """定期发布地图数据"""
        while websocket in self.clients and "/map" in self.subscriptions:
            if self.mapping_active or True:  # 总是发布地图用于测试
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
        while websocket in self.clients and "/odom" in self.subscriptions:
            # 模拟机器人沿圆形轨迹移动
            self.movement_time += 0.1
            radius = 3.0
            center_x = 2.0
            center_y = 2.0

            # 圆形运动
            self.robot_pose["x"] = center_x + radius * math.cos(self.movement_time * 0.2)
            self.robot_pose["y"] = center_y + radius * math.sin(self.movement_time * 0.2)
            self.robot_pose["theta"] = self.movement_time * 0.2 + math.pi / 2

            message = {
                "op": "publish",
                "topic": "/odom",
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

    async def publish_localization_status(self, websocket):
        """定期发布定位服务状态"""
        while websocket in self.clients and "/localization/status" in self.subscriptions:
            message = {
                "op": "publish",
                "topic": "/localization/status",
                "msg": {
                    "data": self.localization_status_message
                }
            }
            try:
                await websocket.send(json.dumps(message))
            except:
                break
            await asyncio.sleep(1.0)  # 每秒更新一次状态

    async def handle_action_goal(self, websocket, data):
        """处理导航 Action Goal"""
        action = data.get("action")
        action_type = data.get("type")
        goal = data.get("goal", {})
        action_id = data.get("id", "")

        print(f"收到 Action Goal: {action} ({action_type})")
        print(f"目标位姿: {goal.get('target_pose', {})}")

        if action == "/move_chassis_to_server":
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
            use_default_config = goal.get("use_default_config", True)
            safe_dist = goal.get("safe_dist", 0.2)
            v_max = goal.get("v_max", 0.5)
            w_max = goal.get("w_max", 1.0)

            print(f"导航参数: use_default={use_default_config}, safe_dist={safe_dist}, v_max={v_max}, w_max={w_max}")

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

            print(f"开始导航: 从 ({self.robot_pose['x']:.2f}, {self.robot_pose['y']:.2f}) 到 ({goal_x:.2f}, {goal_y:.2f})")

            # 启动导航任务
            asyncio.create_task(self.simulate_navigation(websocket, action_id))

    async def handle_cancel_action(self, websocket, data):
        """处理取消导航"""
        action_id = data.get("id", "")
        print(f"取消导航: {action_id}")

        self.navigation_active = False

        # 发送取消结果
        result_message = {
            "op": "action_result",
            "id": action_id,
            "action": "/move_chassis_to_server",
            "values": {
                "status": {
                    "goal_id": {"id": action_id},
                    "status": 2  # PREEMPTED
                },
                "result": {
                    "success": False,
                    "message": "Navigation cancelled by user"
                }
            }
        }

        try:
            await websocket.send(json.dumps(result_message))
        except:
            pass

    async def simulate_navigation(self, websocket, action_id):
        """模拟导航过程"""
        if not self.navigation_goal:
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

        print(f"模拟导航: 距离 {total_distance:.2f}m, 预计用时 {navigation_duration:.1f}s")

        # 发送状态: PENDING
        await self.send_action_status(websocket, action_id, 0)
        await asyncio.sleep(0.5)

        # 发送状态: ACTIVE
        await self.send_action_status(websocket, action_id, 1)

        # 模拟导航过程，发送反馈
        steps = 20
        for i in range(steps):
            if not self.navigation_active:
                print("导航已取消")
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

            # 发送反馈
            feedback_message = {
                "op": "action_feedback",
                "id": action_id,
                "action": "/move_chassis_to_server",
                "values": {
                    "distance_to_goal": remaining_distance,
                    "progress": progress,
                    "eta": eta,
                    "current_pose": {
                        "position": {"x": current_x, "y": current_y, "z": 0.0},
                        "orientation": {
                            "x": 0.0,
                            "y": 0.0,
                            "z": math.sin(current_theta / 2),
                            "w": math.cos(current_theta / 2)
                        }
                    }
                }
            }

            try:
                await websocket.send(json.dumps(feedback_message))
                print(f"导航进度: {progress*100:.0f}%, 剩余距离: {remaining_distance:.2f}m")
            except:
                break

            await asyncio.sleep(navigation_duration / steps)

        # 检查是否被取消
        if not self.navigation_active:
            return

        # 确保机器人到达目标位置
        self.robot_pose["x"] = goal_x
        self.robot_pose["y"] = goal_y
        self.robot_pose["theta"] = goal_theta

        print(f"导航完成: 到达目标点 ({goal_x:.2f}, {goal_y:.2f})")

        # 执行附加任务（如果有）
        if self.navigation_tasks:
            print(f"\n开始执行 {len(self.navigation_tasks)} 个附加任务...")
            await self.execute_tasks(websocket, action_id, self.navigation_tasks)

        # 导航成功
        self.navigation_active = False

        # 发送成功结果
        result_message = {
            "op": "action_result",
            "id": action_id,
            "action": "/move_chassis_to_server",
            "values": {
                "status": {
                    "goal_id": {"id": action_id},
                    "status": 3  # SUCCEEDED
                },
                "result": {
                    "success": True,
                    "message": "Navigation completed successfully"
                }
            }
        }

        try:
            await websocket.send(json.dumps(result_message))
        except:
            pass

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
                await websocket.send(json.dumps(feedback_message))
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
        """发送 Action 状态"""
        status_names = {
            0: "PENDING",
            1: "ACTIVE",
            2: "PREEMPTED",
            3: "SUCCEEDED",
            4: "ABORTED"
        }

        status_message = {
            "op": "action_status",
            "id": action_id,
            "action": "/move_chassis_to_server",
            "values": {
                "status": status,
                "text": status_names.get(status, "UNKNOWN")
            }
        }

        try:
            await websocket.send(json.dumps(status_message))
            print(f"发送状态: {status_names.get(status, 'UNKNOWN')}")
        except:
            pass


# 地图存储目录
MAPS_DIR = Path(__file__).parent / "saved_maps"
MAPS_DIR.mkdir(exist_ok=True)


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


async def create_http_server():
    """创建 HTTP API 服务器"""
    app = web.Application()
    handler = MapStorageHandler()

    # 配置路由
    app.router.add_get('/api/maps', handler.get_all_maps)
    app.router.add_get('/api/maps/{map_id}', handler.get_map)
    app.router.add_post('/api/maps', handler.save_map)
    app.router.add_delete('/api/maps/{map_id}', handler.delete_map)

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
    print("  ✓ 机器人里程计发布 (/odom)")
    print("  ✓ AMCL位姿估计 (/amcl_pose)")
    print("  ✓ 初始位姿设置 (/initialpose)")
    print()
    print("定位服务 (Localization Service):")
    print("  ✓ 建图模式 (/localization/start_mapping)")
    print("  ✓ 定位模式-手动 (/localization/start_localization)")
    print("  ✓ 定位模式-自动 (/localization/start_localization_auto)")
    print("  ✓ 纯避障模式 (/localization/start_obstacle_avoidance)")
    print("  ✓ 停止服务 (/localization/stop)")
    print("  ✓ 关闭服务 (/localization/shutdown)")
    print("  ✓ 状态发布 (/localization/status)")
    print()
    print("地图管理服务 (Localization Map Management):")
    print("  ✓ 列出地图 (/localization/list_maps)")
    print("  ✓ 加载地图 (/localization/load_map)")
    print("  ✓ 保存地图 (/localization/save_map)")
    print("  ✓ 删除地图 (/localization/delete_map)")
    print("  ✓ 应用地图 (/localization/apply_map)")
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
    print()
    print(f"Mock地图存储位置: {MAPS_STORAGE_DIR.absolute()}")
    print(f"HTTP地图存储位置: {MAPS_DIR.absolute()}")
    print("=" * 60)
    print("按 Ctrl+C 停止服务器")
    print()

    # 启动 HTTP 服务器
    http_runner = await create_http_server()
    print("✓ HTTP API 服务器已启动")

    # 启动 WebSocket 服务器
    async with websockets.serve(bridge.handle_client, "localhost", 9090):
        print("✓ WebSocket 服务器已启动")
        await asyncio.Future()  # 永久运行

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n服务器已停止")
