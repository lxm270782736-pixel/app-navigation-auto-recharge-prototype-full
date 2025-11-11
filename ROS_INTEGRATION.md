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

#### 1. 地图数据 (建图时)

```yaml
话题名: /map
消息类型: nav_msgs/OccupancyGrid
频率: ~1Hz
用途: 实时显示建图进度
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

#### 2. 机器人定位位姿

```yaml
话题名: /amcl_pose
消息类型: geometry_msgs/PoseWithCovarianceStamped
频率: ~10Hz
用途: 显示机器人当前位置
```

### UI发布的话题

#### 1. 初始位姿设置

```yaml
话题名: /initialpose
消息类型: geometry_msgs/PoseWithCovarianceStamped
用途: 设置机器人初始位姿（用于AMCL定位）
```

### UI调用的服务

#### 1. 启动建图

```yaml
服务名: /start_mapping
服务类型: std_srvs/Trigger
```

#### 2. 停止建图

```yaml
服务名: /stop_mapping
服务类型: std_srvs/Trigger
```

#### 3. 保存地图

```yaml
服务名: /save_map
服务类型: nav_msgs/SaveMap
```

**注意**: ROS 1标准包中没有 `nav_msgs/SaveMap`，需要使用 `map_server` 的命令行工具或自定义服务。

### UI使用的Action

#### 1. 导航到目标点

```yaml
Action名: /move_base
Action类型: move_base_msgs/MoveBaseAction
用途: 发送导航目标
```

## 后端节点实现

### 1. 建图控制节点

创建 `mapping_controller.py`:

```python
#!/usr/bin/env python
import rospy
from std_srvs.srv import Trigger, TriggerResponse
import subprocess
import signal

class MappingController:
    def __init__(self):
        rospy.init_node('mapping_controller')

        # SLAM进程
        self.slam_process = None
        self.joystick_process = None

        # 服务
        self.start_srv = rospy.Service('/start_mapping', Trigger, self.start_mapping)
        self.stop_srv = rospy.Service('/stop_mapping', Trigger, self.stop_mapping)

        rospy.loginfo("Mapping controller ready")

    def start_mapping(self, req):
        """启动建图"""
        try:
            # 启动SLAM节点 (以gmapping为例)
            self.slam_process = subprocess.Popen([
                'roslaunch', 'your_robot_navigation', 'gmapping.launch'
            ])

            # 启动遥控手柄
            self.joystick_process = subprocess.Popen([
                'roslaunch', 'your_robot_bringup', 'teleop_joy.launch'
            ])

            rospy.loginfo("Mapping started")
            return TriggerResponse(success=True, message="Mapping started successfully")

        except Exception as e:
            rospy.logerr("Failed to start mapping: %s" % str(e))
            return TriggerResponse(success=False, message=str(e))

    def stop_mapping(self, req):
        """停止建图"""
        try:
            # 停止SLAM进程
            if self.slam_process:
                self.slam_process.send_signal(signal.SIGINT)
                self.slam_process.wait()
                self.slam_process = None

            # 停止手柄进程
            if self.joystick_process:
                self.joystick_process.send_signal(signal.SIGINT)
                self.joystick_process.wait()
                self.joystick_process = None

            rospy.loginfo("Mapping stopped")
            return TriggerResponse(success=True, message="Mapping stopped successfully")

        except Exception as e:
            rospy.logerr("Failed to stop mapping: %s" % str(e))
            return TriggerResponse(success=False, message=str(e))

    def shutdown(self):
        """节点关闭时清理"""
        if self.slam_process:
            self.slam_process.terminate()
        if self.joystick_process:
            self.joystick_process.terminate()

if __name__ == '__main__':
    try:
        controller = MappingController()
        rospy.on_shutdown(controller.shutdown)
        rospy.spin()
    except rospy.ROSInterruptException:
        pass
```

### 2. 地图保存服务节点

创建 `map_saver_service.py`:

```python
#!/usr/bin/env python
import rospy
from std_srvs.srv import Trigger, TriggerResponse
import subprocess
import os

class MapSaverService:
    def __init__(self):
        rospy.init_node('map_saver_service')

        # 地图保存目录
        self.map_dir = rospy.get_param('~map_directory',
                                        os.path.expanduser('~/maps'))

        # 确保目录存在
        if not os.path.exists(self.map_dir):
            os.makedirs(self.map_dir)

        # 服务
        self.save_srv = rospy.Service('/save_map', Trigger, self.save_map)

        # 记录下一个地图名称
        self.next_map_name = None

        rospy.loginfo("Map saver service ready")

    def save_map(self, req):
        """保存地图"""
        try:
            # 从请求中获取地图名称（需要自定义服务类型）
            # 这里简化为自动命名
            import time
            map_name = "map_%s" % time.strftime("%Y%m%d_%H%M%S")
            map_path = os.path.join(self.map_dir, map_name)

            # 调用map_saver
            result = subprocess.call([
                'rosrun', 'map_server', 'map_saver',
                '-f', map_path
            ])

            if result == 0:
                rospy.loginfo("Map saved to: %s" % map_path)
                return TriggerResponse(success=True,
                                       message="Map saved to %s" % map_path)
            else:
                return TriggerResponse(success=False,
                                       message="Failed to save map")

        except Exception as e:
            rospy.logerr("Map save error: %s" % str(e))
            return TriggerResponse(success=False, message=str(e))

if __name__ == '__main__':
    try:
        service = MapSaverService()
        rospy.spin()
    except rospy.ROSInterruptException:
        pass
```

### 3. 任务执行节点（可选）

创建 `task_executor.py` 用于处理附加任务（停留、轨迹、拍照）:

```python
#!/usr/bin/env python
import rospy
import actionlib
from move_base_msgs.msg import MoveBaseAction, MoveBaseGoal
from std_msgs.msg import String
import time

class TaskExecutor:
    def __init__(self):
        rospy.init_node('task_executor')

        # 订阅任务指令
        self.task_sub = rospy.Subscriber('/navigation_tasks', String,
                                          self.task_callback)

        rospy.loginfo("Task executor ready")

    def task_callback(self, msg):
        """执行任务"""
        import json
        try:
            tasks = json.loads(msg.data)

            for task in tasks:
                task_type = task.get('type')
                params = task.get('params', {})

                if task_type == 'wait':
                    self.execute_wait(params.get('duration', 5))
                elif task_type == 'trajectory':
                    self.execute_trajectory(params.get('trajectoryId'))
                elif task_type == 'photo':
                    self.execute_photo()

        except Exception as e:
            rospy.logerr("Task execution error: %s" % str(e))

    def execute_wait(self, duration):
        """停留任务"""
        rospy.loginfo("Waiting for %d seconds" % duration)
        time.sleep(duration)

    def execute_trajectory(self, trajectory_id):
        """轨迹播放任务"""
        rospy.loginfo("Playing trajectory: %s" % trajectory_id)
        # 实现轨迹播放逻辑
        pass

    def execute_photo(self):
        """拍照任务"""
        rospy.loginfo("Taking photo")
        # 实现拍照逻辑
        pass

if __name__ == '__main__':
    try:
        executor = TaskExecutor()
        rospy.spin()
    except rospy.ROSInterruptException:
        pass
```

## 启动文件配置

### 1. 主启动文件

创建 `astribot_navigation_ui.launch`:

```xml
<?xml version="1.0"?>
<launch>
  <!-- ROS Bridge WebSocket -->
  <include file="$(find rosbridge_server)/launch/rosbridge_websocket.launch">
    <arg name="port" value="9090"/>
  </include>

  <!-- 建图控制节点 -->
  <node name="mapping_controller" pkg="your_package" type="mapping_controller.py" output="screen"/>

  <!-- 地图保存服务 -->
  <node name="map_saver_service" pkg="your_package" type="map_saver_service.py" output="screen">
    <param name="map_directory" value="$(env HOME)/maps"/>
  </node>

  <!-- 任务执行节点 -->
  <node name="task_executor" pkg="your_package" type="task_executor.py" output="screen"/>

  <!-- 导航栈 (move_base) -->
  <include file="$(find your_robot_navigation)/launch/move_base.launch"/>

  <!-- AMCL定位 -->
  <include file="$(find your_robot_navigation)/launch/amcl.launch"/>

</launch>
```

### 2. SLAM启动文件 (gmapping.launch)

```xml
<?xml version="1.0"?>
<launch>
  <!-- GMapping SLAM -->
  <node pkg="gmapping" type="slam_gmapping" name="slam_gmapping" output="screen">
    <param name="base_frame" value="base_link"/>
    <param name="odom_frame" value="odom"/>
    <param name="map_frame" value="map"/>
    <param name="map_update_interval" value="1.0"/>

    <!-- 地图参数 -->
    <param name="maxUrange" value="5.0"/>
    <param name="maxRange" value="6.0"/>
    <param name="xmin" value="-10.0"/>
    <param name="ymin" value="-10.0"/>
    <param name="xmax" value="10.0"/>
    <param name="ymax" value="10.0"/>
    <param name="delta" value="0.05"/>
  </node>
</launch>
```

### 3. 导航启动文件 (move_base.launch)

```xml
<?xml version="1.0"?>
<launch>
  <!-- move_base -->
  <node pkg="move_base" type="move_base" name="move_base" output="screen">
    <rosparam file="$(find your_robot_navigation)/config/costmap_common_params.yaml" command="load" ns="global_costmap"/>
    <rosparam file="$(find your_robot_navigation)/config/costmap_common_params.yaml" command="load" ns="local_costmap"/>
    <rosparam file="$(find your_robot_navigation)/config/local_costmap_params.yaml" command="load"/>
    <rosparam file="$(find your_robot_navigation)/config/global_costmap_params.yaml" command="load"/>
    <rosparam file="$(find your_robot_navigation)/config/base_local_planner_params.yaml" command="load"/>

    <param name="base_global_planner" value="navfn/NavfnROS"/>
    <param name="base_local_planner" value="base_local_planner/TrajectoryPlannerROS"/>
  </node>
</launch>
```

## 测试和调试

### 1. 测试ROS Bridge连接

```bash
# 启动rosbridge
roslaunch rosbridge_server rosbridge_websocket.launch

# 测试WebSocket连接
sudo apt-get install nodejs npm
npm install -g wscat
wscat -c ws://localhost:9090
```

### 2. 测试话题发布

```bash
# 检查地图话题
rostopic echo /map

# 检查定位话题
rostopic echo /amcl_pose

# 手动设置初始位姿
rostopic pub /initialpose geometry_msgs/PoseWithCovarianceStamped ...
```

### 3. 测试服务调用

```bash
# 测试启动建图服务
rosservice call /start_mapping "{}"

# 测试停止建图服务
rosservice call /stop_mapping "{}"

# 测试保存地图服务
rosservice call /save_map "{}"
```

### 4. 测试导航Action

```bash
# 发送导航目标
rostopic pub /move_base/goal move_base_msgs/MoveBaseActionGoal ...
```

### 5. 调试工具

使用 `rqt` 进行可视化调试:

```bash
# 图形化界面
rqt

# 话题监控
rqt_graph

# TF树查看
rosrun rqt_tf_tree rqt_tf_tree
```

## 常见问题

### 1. rosbridge连接失败

- 检查防火墙: `sudo ufw allow 9090`
- 检查rosbridge是否运行: `rosnode list | grep rosbridge`

### 2. 地图数据不更新

- 确认SLAM节点发布 `/map` 话题: `rostopic list | grep map`
- 检查话题频率: `rostopic hz /map`

### 3. 导航无法启动

- 确认move_base节点运行: `rosnode info /move_base`
- 检查TF树完整性: `rosrun tf view_frames`

### 4. 定位不准确

- 调整AMCL参数（粒子数、初始协方差等）
- 确保激光雷达数据正常

## 进阶配置

### 1. 自定义消息类型

如需更丰富的任务功能，可创建自定义消息:

```
# NavigationTask.msg
string type
string[] params_keys
string[] params_values
```

### 2. 多机器人支持

使用命名空间区分不同机器人:

```xml
<group ns="robot1">
  <include file="$(find astribot_navigation_ui)/launch/single_robot.launch"/>
</group>
```

### 3. 云端地图存储

将地图保存到数据库或云存储服务，而不是本地文件系统。

## 参考资料

- [ROS Navigation Stack](http://wiki.ros.org/navigation)
- [rosbridge_suite](http://wiki.ros.org/rosbridge_suite)
- [gmapping](http://wiki.ros.org/gmapping)
- [move_base](http://wiki.ros.org/move_base)
- [roslibjs](https://github.com/RobotWebTools/roslibjs)
