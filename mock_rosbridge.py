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

        # 导航成功
        self.navigation_active = False

        # 确保机器人到达目标位置
        self.robot_pose["x"] = goal_x
        self.robot_pose["y"] = goal_y
        self.robot_pose["theta"] = goal_theta

        print(f"导航完成: 到达目标点 ({goal_x:.2f}, {goal_y:.2f})")

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
    bridge = MockROSBridge()

    print("=" * 60)
    print("模拟ROS Bridge WebSocket服务器 + HTTP API")
    print("=" * 60)
    print("WebSocket地址: ws://localhost:9090")
    print("HTTP API地址: http://localhost:8080")
    print()
    print("支持的功能:")
    print("  ✓ 地图数据发布 (/map)")
    print("  ✓ 机器人里程计发布 (/odom)")
    print("  ✓ AMCL位姿估计 (/amcl_pose)")
    print("  ✓ 初始位姿设置 (/initialpose)")
    print("  ✓ 建图服务 (/start_mapping, /stop_mapping)")
    print("  ✓ 地图保存 (/save_map)")
    print("  ✓ 导航 Action (/move_chassis_to_server)")
    print("    - 模拟导航过程（状态、反馈、结果）")
    print("    - 实时位置插值")
    print("    - 支持取消导航")
    print()
    print("HTTP API 端点:")
    print("  GET    /api/maps          - 获取所有地图")
    print("  GET    /api/maps/{id}     - 获取单个地图")
    print("  POST   /api/maps          - 保存地图")
    print("  DELETE /api/maps/{id}     - 删除地图")
    print()
    print(f"地图存储位置: {MAPS_DIR.absolute()}")
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
