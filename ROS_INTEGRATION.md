# ROS后端集成指南

本文档详细说明如何配置ROS 1后端与导航UI系统集成。

## 目录

1. [系统要求](#系统要求)
2. [ROS包依赖](#ros包依赖)
3. [ROS话题和服务](#ros话题和服务)
4. [后端节点实现](#后端节点实现)
5. [启动文件配置](#启动文件配置)
6. [测试和调试](#测试和调试)

## 系统要求

- **ROS版本**: ROS 1 Melodic/Noetic
- **操作系统**: Ubuntu 18.04/20.04
- **Python**: 2.7 (Melodic) 或 3.8+ (Noetic)

## ROS包依赖

### 必需的ROS包

```bash
# ROS Bridge - WebSocket通信
sudo apt-get install ros-$ROS_DISTRO-rosbridge-suite

# SLAM (选择其一)
sudo apt-get install ros-$ROS_DISTRO-gmapping           # GMapping
sudo apt-get install ros-$ROS_DISTRO-cartographer-ros   # Cartographer
sudo apt-get install ros-$ROS_DISTRO-slam-toolbox       # SLAM Toolbox

# 导航
sudo apt-get install ros-$ROS_DISTRO-navigation
sudo apt-get install ros-$ROS_DISTRO-amcl

# 地图服务器
sudo apt-get install ros-$ROS_DISTRO-map-server

# TF变换
sudo apt-get install ros-$ROS_DISTRO-tf2-ros

# 其他工具
sudo apt-get install ros-$ROS_DISTRO-robot-state-publisher
```

## ROS话题和服务

### UI订阅的话题

#### 1. 地图数据 (实时更新)

```yaml
话题名: /map
消息类型: nav_msgs/OccupancyGrid
频率: ~1Hz
用途: 实时显示建图进度或已加载的地图
```

消息结构:
```
header:
  frame_id: "map"
info:
  width: 384
  height: 384
  resolution: 0.05  # 米/像素
  origin:
    position: {x: -10.0, y: -10.0, z: 0.0}
    orientation: {x: 0.0, y: 0.0, z: 0.0, w: 1.0}
data: [...]  # -1=未知, 0=空闲, 100=占据
```

#### 2. 机器人里程计位姿

```yaml
话题名: /odom
消息类型: nav_msgs/Odometry
频率: ~10Hz
用途: 显示机器人当前位置（未校准）
```

#### 3. 机器人定位位姿

```yaml
话题名: /amcl_pose
消息类型: geometry_msgs/PoseWithCovarianceStamped
频率: ~10Hz
用途: 显示机器人当前位置（AMCL校准后）
```

#### 4. 定位服务状态

```yaml
话题名: /localization/status
消息类型: std_msgs/String
频率: ~1Hz
用途: 实时显示定位服务状态信息
```

### UI发布的话题

#### 1. 初始位姿设置

```yaml
话题名: /initialpose
消息类型: geometry_msgs/PoseWithCovarianceStamped
用途: 设置机器人初始位姿（用于AMCL定位）
```

### UI调用的服务

#### 定位模式控制服务

所有服务使用 `std_srvs/Trigger` 类型，返回格式：
```
success: bool
message: string
```

| 服务名称 | 功能说明 |
|---------|---------|
| `/localization/start_mapping` | 启动建图模式（SLAM） |
| `/localization/start_localization` | 启动定位模式（手动初始化） |
| `/localization/start_localization_auto` | 启动定位模式（自动重定位） |
| `/localization/start_obstacle_avoidance` | 启动纯避障模式 |
| `/localization/stop` | 停止当前模式 |
| `/localization/shutdown` | 关闭定位服务 |

#### 地图管理服务

| 服务名称 | 请求参数 | 返回参数 | 功能说明 |
|---------|---------|---------|---------|
| `/localization/list_maps` | `{}` | `success, message, maps[]` | 列出所有已保存地图 |
| `/localization/load_map` | `map_name` | `success, message, map_data` | 加载指定地图的完整数据 |
| `/localization/save_map` | `map_name, map_data, created_at` | `success, message` | 保存地图到服务器 |
| `/localization/delete_map` | `map_name` | `success, message` | 删除指定地图 |
| `/localization/apply_map` | `map_name` | `success, message` | 应用地图为当前地图 |

#### 遥控器控制服务

| 服务名称 | 功能说明 |
|---------|---------|
| `/joystick/start` | 启动遥控器 |
| `/joystick/stop` | 停止遥控器 |

详细的服务接口文档请参考：[LOCALIZATION_SERVICES.md](./LOCALIZATION_SERVICES.md)

### UI使用的Action

#### 1. 导航到目标点

```yaml
Action名: /move_chassis_to_server
Action类型: move_base_msgs/MoveBaseAction (或自定义Action)
用途: 发送导航目标（支持附加任务）
```

**Goal 消息格式**:
```python
{
  "target_pose": {
    "header": {"frame_id": "map"},
    "pose": {
      "position": {"x": 1.0, "y": 2.0, "z": 0.0},
      "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
    }
  },
  "tasks": "[...]",  # JSON字符串，包含附加任务配置
  "use_default_config": true,
  "safe_dist": 0.2,
  "v_max": 0.5,
  "w_max": 1.0
}
```

**Feedback 消息格式**:
```python
{
  "distance_to_goal": 2.5,  # 剩余距离（米）
  "progress": 0.6,          # 进度（0-1）
  "eta": 5.0,               # 预计到达时间（秒）
  "current_task": "等待任务" # 当前执行的任务
}
```

**Result 消息格式**:
```python
{
  "success": true,
  "message": "Navigation completed successfully"
}
```

## 后端节点实现

### 1. 定位控制节点 (localization_controller.py)

这是核心节点，管理建图、定位和避障模式。

```python
#!/usr/bin/env python3
import rospy
from std_srvs.srv import Trigger, TriggerResponse
from std_msgs.msg import String
from nav_msgs.msg import OccupancyGrid
import subprocess
import signal
import json
import os

class LocalizationController:
    def __init__(self):
        rospy.init_node('localization_controller')

        # 当前模式
        self.current_mode = "idle"  # idle, mapping, localization, localization_auto, obstacle_avoidance

        # SLAM/定位进程
        self.slam_process = None
        self.amcl_process = None

        # 地图存储
        self.maps_dir = rospy.get_param('~maps_directory', os.path.expanduser('~/maps'))
        os.makedirs(self.maps_dir, exist_ok=True)
        self.saved_maps = {}
        self.load_maps_from_disk()

        # 发布器
        self.status_pub = rospy.Publisher('/localization/status', String, queue_size=10)
        self.map_pub = rospy.Publisher('/map', OccupancyGrid, queue_size=1, latch=True)

        # 定位模式控制服务
        rospy.Service('/localization/start_mapping', Trigger, self.start_mapping)
        rospy.Service('/localization/start_localization', Trigger, self.start_localization)
        rospy.Service('/localization/start_localization_auto', Trigger, self.start_localization_auto)
        rospy.Service('/localization/start_obstacle_avoidance', Trigger, self.start_obstacle_avoidance)
        rospy.Service('/localization/stop', Trigger, self.stop)
        rospy.Service('/localization/shutdown', Trigger, self.shutdown_service)

        # 地图管理服务
        rospy.Service('/localization/list_maps', Trigger, self.list_maps)
        rospy.Service('/localization/load_map', Trigger, self.load_map)
        rospy.Service('/localization/save_map', Trigger, self.save_map)
        rospy.Service('/localization/delete_map', Trigger, self.delete_map)
        rospy.Service('/localization/apply_map', Trigger, self.apply_map)

        # 状态发布定时器
        rospy.Timer(rospy.Duration(1.0), self.publish_status)

        rospy.loginfo("Localization controller ready")

    def publish_status(self, event):
        """定期发布状态"""
        status_msg = String()

        if self.current_mode == "idle":
            status_msg.data = "未启动"
        elif self.current_mode == "mapping":
            status_msg.data = "建图模式已启动"
        elif self.current_mode == "localization":
            status_msg.data = "定位中（手动）"
        elif self.current_mode == "localization_auto":
            status_msg.data = "定位中（自动）"
        elif self.current_mode == "obstacle_avoidance":
            status_msg.data = "纯避障模式已启动"

        self.status_pub.publish(status_msg)

    def start_mapping(self, req):
        """启动建图模式"""
        try:
            if self.current_mode != "idle":
                return TriggerResponse(False, "请先停止当前模式")

            # 启动SLAM节点
            self.slam_process = subprocess.Popen([
                'roslaunch', 'your_robot_navigation', 'gmapping.launch'
            ])

            self.current_mode = "mapping"
            rospy.loginfo("Mapping mode started")
            return TriggerResponse(True, "建图模式已启动")

        except Exception as e:
            rospy.logerr(f"Failed to start mapping: {e}")
            return TriggerResponse(False, str(e))

    def start_localization(self, req):
        """启动定位模式（手动）"""
        try:
            if self.current_mode != "idle":
                return TriggerResponse(False, "请先停止当前模式")

            # 启动AMCL节点
            self.amcl_process = subprocess.Popen([
                'roslaunch', 'your_robot_navigation', 'amcl.launch'
            ])

            self.current_mode = "localization"
            rospy.loginfo("Localization mode started (manual)")
            return TriggerResponse(True, "定位模式已启动（手动）")

        except Exception as e:
            rospy.logerr(f"Failed to start localization: {e}")
            return TriggerResponse(False, str(e))

    def start_localization_auto(self, req):
        """启动定位模式（自动）"""
        try:
            if self.current_mode != "idle":
                return TriggerResponse(False, "请先停止当前模式")

            # 启动AMCL节点（带全局定位参数）
            self.amcl_process = subprocess.Popen([
                'roslaunch', 'your_robot_navigation', 'amcl.launch',
                'global_localization:=true'
            ])

            self.current_mode = "localization_auto"
            rospy.loginfo("Localization mode started (auto)")
            return TriggerResponse(True, "定位模式已启动（自动）")

        except Exception as e:
            rospy.logerr(f"Failed to start auto localization: {e}")
            return TriggerResponse(False, str(e))

    def start_obstacle_avoidance(self, req):
        """启动纯避障模式"""
        try:
            if self.current_mode != "idle":
                return TriggerResponse(False, "请先停止当前模式")

            self.current_mode = "obstacle_avoidance"
            rospy.loginfo("Obstacle avoidance mode started")
            return TriggerResponse(True, "纯避障模式已启动")

        except Exception as e:
            rospy.logerr(f"Failed to start obstacle avoidance: {e}")
            return TriggerResponse(False, str(e))

    def stop(self, req):
        """停止当前模式"""
        try:
            if self.slam_process:
                self.slam_process.send_signal(signal.SIGINT)
                self.slam_process.wait()
                self.slam_process = None

            if self.amcl_process:
                self.amcl_process.send_signal(signal.SIGINT)
                self.amcl_process.wait()
                self.amcl_process = None

            self.current_mode = "idle"
            rospy.loginfo("Localization stopped")
            return TriggerResponse(True, "定位服务已停止")

        except Exception as e:
            rospy.logerr(f"Failed to stop: {e}")
            return TriggerResponse(False, str(e))

    def shutdown_service(self, req):
        """关闭服务"""
        self.stop(req)
        return TriggerResponse(True, "定位服务已关闭")

    def load_maps_from_disk(self):
        """从磁盘加载地图元数据"""
        for map_file in os.listdir(self.maps_dir):
            if map_file.endswith('.json'):
                with open(os.path.join(self.maps_dir, map_file), 'r') as f:
                    map_data = json.load(f)
                    self.saved_maps[map_data['id']] = map_data
        rospy.loginfo(f"Loaded {len(self.saved_maps)} maps from disk")

    def list_maps(self, req):
        """列出所有地图"""
        maps_list = [
            {
                "id": m["id"],
                "name": m["name"],
                "created_at": m["created_at"],
                "thumbnail": "",
                "width": m["width"],
                "height": m["height"],
                "resolution": m["resolution"],
                "origin_x": m["origin"]["x"],
                "origin_y": m["origin"]["y"],
                "origin_orientation": m["origin"]["orientation"]
            }
            for m in self.saved_maps.values()
        ]

        response = TriggerResponse()
        response.success = True
        response.message = json.dumps({"maps": maps_list})
        return response

    def save_map(self, req):
        """保存地图"""
        # 从请求中解析参数（需要自定义服务类型或使用请求字符串）
        # 这里简化示例
        map_name = "map_example"
        map_file = os.path.join(self.maps_dir, f"{map_name}.json")

        # 保存地图数据
        # map_data = {...}
        # with open(map_file, 'w') as f:
        #     json.dump(map_data, f)

        return TriggerResponse(True, f"地图 '{map_name}' 保存成功")

    def load_map(self, req):
        """加载地图"""
        # 实现地图加载逻辑
        return TriggerResponse(True, "地图加载成功")

    def delete_map(self, req):
        """删除地图"""
        # 实现地图删除逻辑
        return TriggerResponse(True, "地图删除成功")

    def apply_map(self, req):
        """应用地图"""
        # 加载地图并发布到 /map 话题
        return TriggerResponse(True, "地图应用成功")

    def cleanup(self):
        """清理资源"""
        if self.slam_process:
            self.slam_process.terminate()
        if self.amcl_process:
            self.amcl_process.terminate()

if __name__ == '__main__':
    try:
        controller = LocalizationController()
        rospy.on_shutdown(controller.cleanup)
        rospy.spin()
    except rospy.ROSInterruptException:
        pass
```

### 2. 遥控器控制节点 (joystick_controller.py)

```python
#!/usr/bin/env python3
import rospy
from std_srvs.srv import Trigger, TriggerResponse
import subprocess
import signal

class JoystickController:
    def __init__(self):
        rospy.init_node('joystick_controller')

        self.joystick_process = None

        # 服务
        rospy.Service('/joystick/start', Trigger, self.start_joystick)
        rospy.Service('/joystick/stop', Trigger, self.stop_joystick)

        rospy.loginfo("Joystick controller ready")

    def start_joystick(self, req):
        """启动遥控器"""
        try:
            if self.joystick_process:
                return TriggerResponse(True, "遥控器已经在运行")

            self.joystick_process = subprocess.Popen([
                'roslaunch', 'your_robot_bringup', 'teleop_joy.launch'
            ])

            rospy.loginfo("Joystick started")
            return TriggerResponse(True, "遥控器已启动")

        except Exception as e:
            rospy.logerr(f"Failed to start joystick: {e}")
            return TriggerResponse(False, str(e))

    def stop_joystick(self, req):
        """停止遥控器"""
        try:
            if not self.joystick_process:
                return TriggerResponse(True, "遥控器已经停止")

            self.joystick_process.send_signal(signal.SIGINT)
            self.joystick_process.wait()
            self.joystick_process = None

            rospy.loginfo("Joystick stopped")
            return TriggerResponse(True, "遥控器已停止")

        except Exception as e:
            rospy.logerr(f"Failed to stop joystick: {e}")
            return TriggerResponse(False, str(e))

    def cleanup(self):
        if self.joystick_process:
            self.joystick_process.terminate()

if __name__ == '__main__':
    try:
        controller = JoystickController()
        rospy.on_shutdown(controller.cleanup)
        rospy.spin()
    except rospy.ROSInterruptException:
        pass
```

### 3. 任务执行节点 (task_executor.py)

此节点集成到导航Action服务器中，处理附加任务。

```python
#!/usr/bin/env python3
import rospy
import actionlib
from move_base_msgs.msg import MoveBaseAction, MoveBaseGoal, MoveBaseFeedback, MoveBaseResult
import json
import time

class NavigationTaskExecutor:
    def __init__(self):
        rospy.init_node('navigation_task_executor')

        # Action服务器
        self.server = actionlib.SimpleActionServer(
            '/move_chassis_to_server',
            MoveBaseAction,
            execute_cb=self.execute_navigation,
            auto_start=False
        )
        self.server.start()

        # move_base客户端
        self.move_base_client = actionlib.SimpleActionClient('move_base', MoveBaseAction)
        self.move_base_client.wait_for_server()

        rospy.loginfo("Navigation task executor ready")

    def execute_navigation(self, goal):
        """执行导航任务"""
        # 1. 导航到目标点
        move_base_goal = MoveBaseGoal()
        move_base_goal.target_pose = goal.target_pose

        self.move_base_client.send_goal(
            move_base_goal,
            feedback_cb=self.navigation_feedback
        )

        # 等待导航完成
        self.move_base_client.wait_for_result()

        # 检查导航结果
        if self.move_base_client.get_state() != actionlib.GoalStatus.SUCCEEDED:
            self.server.set_aborted(MoveBaseResult(), "Navigation failed")
            return

        # 2. 执行附加任务
        if hasattr(goal, 'tasks') and goal.tasks:
            try:
                tasks = json.loads(goal.tasks)
                for task in tasks:
                    self.execute_task(task)
            except Exception as e:
                rospy.logerr(f"Task execution error: {e}")
                self.server.set_aborted(MoveBaseResult(), f"Task failed: {e}")
                return

        # 3. 返回成功
        result = MoveBaseResult()
        self.server.set_succeeded(result, "Navigation and tasks completed")

    def navigation_feedback(self, feedback):
        """转发导航反馈"""
        self.server.publish_feedback(feedback)

    def execute_task(self, task):
        """执行单个任务"""
        task_type = task.get('type')
        params = task.get('params', {})

        rospy.loginfo(f"Executing task: {task_type}")

        if task_type == 'wait':
            time.sleep(params.get('duration', 5))

        elif task_type == 'photo':
            # 触发相机拍照
            # rospy.ServiceProxy('/camera/trigger', Trigger)()
            pass

        elif task_type == 'trajectory':
            # 播放预录轨迹
            pass

        # 更多任务类型...

if __name__ == '__main__':
    try:
        executor = NavigationTaskExecutor()
        rospy.spin()
    except rospy.ROSInterruptException:
        pass
```

## 启动文件配置

### 1. 主启动文件 (astribot_navigation.launch)

```xml
<?xml version="1.0"?>
<launch>
  <!-- ROS Bridge WebSocket -->
  <include file="$(find rosbridge_server)/launch/rosbridge_websocket.launch">
    <arg name="port" value="9090"/>
  </include>

  <!-- 定位控制节点 -->
  <node name="localization_controller" pkg="your_package" type="localization_controller.py" output="screen">
    <param name="maps_directory" value="$(env HOME)/astribot_maps"/>
  </node>

  <!-- 遥控器控制节点 -->
  <node name="joystick_controller" pkg="your_package" type="joystick_controller.py" output="screen"/>

  <!-- 任务执行节点 -->
  <node name="navigation_task_executor" pkg="your_package" type="task_executor.py" output="screen"/>

  <!-- 导航栈 (move_base) -->
  <include file="$(find your_robot_navigation)/launch/move_base.launch"/>

</launch>
```

### 2. SLAM启动文件 (gmapping.launch)

```xml
<?xml version="1.0"?>
<launch>
  <node pkg="gmapping" type="slam_gmapping" name="slam_gmapping" output="screen">
    <param name="base_frame" value="base_link"/>
    <param name="odom_frame" value="odom"/>
    <param name="map_frame" value="map"/>
    <param name="map_update_interval" value="1.0"/>

    <param name="maxUrange" value="5.0"/>
    <param name="maxRange" value="6.0"/>
    <param name="delta" value="0.05"/>
  </node>
</launch>
```

### 3. AMCL定位启动文件 (amcl.launch)

```xml
<?xml version="1.0"?>
<launch>
  <arg name="global_localization" default="false"/>

  <node pkg="amcl" type="amcl" name="amcl" output="screen">
    <param name="odom_frame_id" value="odom"/>
    <param name="base_frame_id" value="base_link"/>
    <param name="global_frame_id" value="map"/>

    <!-- 粒子滤波参数 -->
    <param name="min_particles" value="500"/>
    <param name="max_particles" value="2000"/>

    <!-- 全局定位 -->
    <param name="initial_pose_x" value="0.0" unless="$(arg global_localization)"/>
    <param name="initial_pose_y" value="0.0" unless="$(arg global_localization)"/>
    <param name="global_localization" value="$(arg global_localization)"/>
  </node>
</launch>
```

## 测试和调试

### 1. 测试ROS Bridge连接

```bash
# 启动rosbridge
roslaunch rosbridge_server rosbridge_websocket.launch

# 测试WebSocket连接
wscat -c ws://localhost:9090
```

### 2. 测试定位服务

```bash
# 启动建图
rosservice call /localization/start_mapping "{}"

# 查看状态
rostopic echo /localization/status

# 停止建图
rosservice call /localization/stop "{}"

# 列出地图
rosservice call /localization/list_maps "{}"
```

### 3. 测试遥控器

```bash
# 启动遥控器
rosservice call /joystick/start "{}"

# 停止遥控器
rosservice call /joystick/stop "{}"
```

### 4. 测试导航Action

```bash
# 使用rostopic发送导航目标
rostopic pub /move_chassis_to_server/goal move_base_msgs/MoveBaseActionGoal ...

# 查看导航反馈
rostopic echo /move_chassis_to_server/feedback

# 查看导航结果
rostopic echo /move_chassis_to_server/result
```

### 5. 调试工具

```bash
# 查看话题列表
rostopic list

# 查看节点列表
rosnode list

# 查看TF树
rosrun rqt_tf_tree rqt_tf_tree

# 图形化调试
rqt
```

## 常见问题

### 1. rosbridge连接失败

- 检查防火墙: `sudo ufw allow 9090`
- 检查rosbridge是否运行: `rosnode list | grep rosbridge`
- 检查端口占用: `netstat -tlnp | grep 9090`

### 2. 地图数据不更新

- 确认SLAM节点发布 `/map` 话题: `rostopic list | grep map`
- 检查话题频率: `rostopic hz /map`
- 检查地图数据: `rostopic echo /map -n 1`

### 3. 定位服务调用失败

- 确认服务存在: `rosservice list | grep localization`
- 测试服务调用: `rosservice call /localization/list_maps "{}"`
- 查看节点日志: `rosnode info /localization_controller`

### 4. 导航无法启动

- 确认move_base节点运行: `rosnode info /move_base`
- 检查TF树完整性: `rosrun tf view_frames`
- 查看costmap: `rostopic echo /move_base/global_costmap/costmap`

### 5. 定位不准确

- 调整AMCL参数（粒子数、初始协方差等）
- 确保激光雷达数据正常: `rostopic echo /scan`
- 检查里程计数据: `rostopic echo /odom`

## 架构说明

### 服务架构变更

**旧版架构** (已废弃):
- `/start_mapping`, `/stop_mapping`, `/save_map`
- 地图存储在本地文件系统

**新版架构** (当前):
- `/localization/*` 系列服务统一管理
- 地图通过ROS服务存储和加载
- 支持远程地图管理

### 地图存储策略

- **服务端**: 只存储原生栅格数据（`data` 字段）
- **客户端**: 按需从原始数据生成缩略图
- **持久化**: JSON文件存储，支持重启后自动加载

详细的服务接口文档请参考：[LOCALIZATION_SERVICES.md](./LOCALIZATION_SERVICES.md)

## 参考资料

- [ROS Navigation Stack](http://wiki.ros.org/navigation)
- [rosbridge_suite](http://wiki.ros.org/rosbridge_suite)
- [gmapping](http://wiki.ros.org/gmapping)
- [move_base](http://wiki.ros.org/move_base)
- [Localization Services API](./LOCALIZATION_SERVICES.md)
- [Navigation Events](./NAVIGATION_EVENTS.md)
