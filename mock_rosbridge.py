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

class MockROSBridge:
    def __init__(self):
        self.clients = set()
        self.subscriptions = {}
        self.mapping_active = False
        self.map_data = self.generate_sample_map()
        # 初始位置设置在地图中心可见区域
        self.robot_pose = {"x": 2.0, "y": 2.0, "theta": 0.0}
        self.movement_time = 0.0

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

async def main():
    bridge = MockROSBridge()

    print("=" * 60)
    print("模拟ROS Bridge WebSocket服务器")
    print("=" * 60)
    print("监听地址: ws://localhost:9090")
    print("支持的功能:")
    print("  ✓ 地图数据发布 (/map)")
    print("  ✓ 机器人里程计发布 (/odom)")
    print("  ✓ 初始位姿设置 (/initialpose)")
    print("  ✓ 建图服务 (/start_mapping, /stop_mapping)")
    print("  ✓ 地图保存 (/save_map)")
    print("=" * 60)
    print("按 Ctrl+C 停止服务器")
    print()

    async with websockets.serve(bridge.handle_client, "localhost", 9090):
        await asyncio.Future()  # 永久运行

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n服务器已停止")
