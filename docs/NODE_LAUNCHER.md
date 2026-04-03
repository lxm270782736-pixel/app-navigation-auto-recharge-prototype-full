# 节点启动器 (Node Launcher)

## 功能概述

节点启动器是Dashboard中的一键启动功能，允许用户通过单个按钮启动所有必需的ROS节点，包括：

1. **SLAM节点** - 负责机器人定位和地图构建（集成了AMCL定位和SLAM建图功能）
2. **导航节点** - 负责路径规划和导航控制

## UI设计

### 主界面

节点启动器位于Dashboard的连接状态卡片内，与ROS连接状态左右并列，采用渐变紫色背景设计：

- **位置**: Dashboard页面，与ROS连接状态在同一个Card内，右侧显示
- **布局**: 响应式设计，左右各占50%，在小屏幕上自动换行到下方
- **配色**: 紫色渐变背景（#667eea → #764ba2），白色文字和按钮
- **集成性**: 作为独立div（非Card），与ROS状态卡片无缝集成

### 主要元素

1. **标题区域**
   - 闪电图标 + "系统节点控制"
   - 进度百分比标签（启动后显示）

2. **进度条**
   - 显示整体启动进度（0-100%）
   - 绿色渐变配色
   - 状态指示：active（进行中）/ success（成功）/ exception（异常）

3. **启动按钮**
   - 大尺寸按钮（44px高度）
   - 白色背景，紫色文字
   - 火箭图标
   - 文字：未启动时显示"一键启动所有节点"，启动中显示"启动中..."
   - ROS未连接时禁用

4. **状态提示**
   - ROS未连接时显示警告
   - 启动后显示"查看详细状态"链接

5. **节点运行状态**
   - ROS连接后显示实时节点运行状态
   - 每个节点显示：
     - 圆形状态指示灯（绿色=运行中，灰色=已停止）
     - 节点名称和状态文字（"运行中"/"已停止"）
   - 半透明白色背景，与整体紫色设计融合
   - 实时订阅 `/slam/status` 和 `/navigation/status` 话题更新

### 详细状态Modal

点击"查看详细状态"后打开，显示每个节点的详细状态：

- **整体进度条**: 显示总体完成度
- **节点列表**: 每个节点显示：
  - 状态图标（加载中/成功/失败）
  - 节点名称
  - 状态标签
  - **重试按钮**（失败时显示，红色危险按钮）
  - 详细消息（成功或失败原因）
- **总结提示**:
  - 全部成功：绿色背景提示
  - 部分失败：红色背景提示

### 失败节点重试功能

当某个节点启动失败时：

1. 节点状态显示为"失败"（红色标签）
2. 在节点右侧出现红色"重试"按钮
3. 点击重试按钮：
   - 仅重启该失败的节点
   - 不影响其他已成功的节点
   - 更新该节点状态为"启动中"
   - 根据结果更新为"成功"或"失败"
4. 重试过程中禁用所有重试按钮（防止并发冲突）

## ROS服务接口要求

节点启动器需要ROS后端提供以下服务接口：

### 1. 启动SLAM节点

**服务名称**: `/system/start_slam_node`
**服务类型**: `std_srvs/Trigger`

**请求**: 空
**响应**:
```yaml
success: bool    # true表示启动成功
message: string  # 状态消息
```

**功能**: 启动SLAM节点（集成定位和建图功能，如AMCL、gmapping、cartographer等）

**状态话题**: 启动成功后应发布 `/slam/status` 话题
```yaml
话题: /slam/status
类型: std_msgs/Bool
消息: {data: true}  # true表示SLAM节点正在运行
```

### 2. 启动导航节点

**服务名称**: `/system/start_navigation_node`
**服务类型**: `std_srvs/Trigger`

**请求**: 空
**响应**:
```yaml
success: bool    # true表示启动成功
message: string  # 状态消息
```

**功能**: 启动move_base或其他导航规划节点

**状态话题**: 启动成功后应发布 `/navigation/status` 话题
```yaml
话题: /navigation/status
类型: std_msgs/Bool
消息: {data: true}  # true表示导航节点正在运行
```

## 启动流程

1. 用户点击"一键启动所有节点"按钮
2. 系统检查ROS连接状态（必须已连接）
3. 按顺序启动节点：
   - SLAM节点 → 等待500ms → 导航节点
4. 每个节点启动时：
   - 更新状态为"启动中"
   - 调用对应的ROS服务
   - 根据服务返回结果更新为"成功"或"失败"
   - **启动成功后，节点应发布对应的status话题标志自己已启动**
5. 显示整体启动结果

## 实现后端服务示例 (Python)

```python
#!/usr/bin/env python
import rospy
from std_srvs.srv import Trigger, TriggerResponse
from std_msgs.msg import Bool
import subprocess

class NodeLauncherServer:
    def __init__(self):
        rospy.init_node('node_launcher_server')

        # 状态发布器
        self.slam_status_pub = rospy.Publisher('/slam/status', Bool, queue_size=10, latch=True)
        self.nav_status_pub = rospy.Publisher('/navigation/status', Bool, queue_size=10, latch=True)

        # 注册服务
        rospy.Service('/system/start_slam_node', Trigger, self.start_slam)
        rospy.Service('/system/start_navigation_node', Trigger, self.start_navigation)

        rospy.loginfo("Node launcher server started")

    def start_slam(self, req):
        try:
            # 示例：启动SLAM节点（集成定位和建图）
            subprocess.Popen(['roslaunch', 'my_robot', 'slam.launch'])

            # 发布SLAM状态
            rospy.sleep(1)  # 等待节点初始化
            self.slam_status_pub.publish(Bool(data=True))

            return TriggerResponse(success=True, message="SLAM节点启动成功")
        except Exception as e:
            return TriggerResponse(success=False, message=f"启动失败: {str(e)}")

    def start_navigation(self, req):
        try:
            # 示例：启动导航节点
            subprocess.Popen(['roslaunch', 'my_robot', 'move_base.launch'])

            # 发布导航状态
            rospy.sleep(1)  # 等待节点初始化
            self.nav_status_pub.publish(Bool(data=True))

            return TriggerResponse(success=True, message="导航节点启动成功")
        except Exception as e:
            return TriggerResponse(success=False, message=f"启动失败: {str(e)}")

    def spin(self):
        rospy.spin()

if __name__ == '__main__':
    server = NodeLauncherServer()
    server.spin()
```

## 使用说明

### 真实ROS环境

1. **确保ROS Bridge已连接**
   - Dashboard页面会显示ROS连接状态
   - 只有在"在线"状态下才能启动节点

2. **点击启动按钮**
   - 点击"一键启动所有节点"按钮
   - 系统会依次启动定位、建图、导航节点

3. **查看启动状态**
   - 主界面显示整体进度
   - 点击"查看详细状态"查看每个节点的详细信息

4. **处理失败情况**
   - 如果某个节点启动失败，查看详细消息
   - **点击失败节点旁的"重试"按钮单独重启该节点**
   - 检查ROS后端服务是否正确实现
   - 检查ROS系统状态和依赖

5. **重试失败节点**
   - 在详细状态Modal中找到失败的节点
   - 点击该节点右侧的红色"重试"按钮
   - 等待重试完成，查看新的状态结果
   - 可以多次重试直到成功

### Mock模拟环境测试

项目的 `mock_rosbridge.py` 已集成节点启动服务模拟，无需真实ROS环境即可测试：

**启动Mock服务器：**
```bash
python main.py  # 后端；另开终端: cd ui && npm run dev
# 或单独启动
python3 mock_rosbridge.py
```

**Mock服务特性：**
- **SLAM节点**：4秒启动时间，90%成功率
  - 成功消息："SLAM节点启动成功"
  - 失败消息："SLAM节点启动失败：激光雷达未连接"
  - 成功后发布 `/slam/status` 话题 (std_msgs/Bool, data=true)

- **导航节点**：5秒启动时间，95%成功率
  - 成功消息："导航节点启动成功"
  - 失败消息："导航节点启动失败：costmap参数缺失"
  - 成功后发布 `/navigation/status` 话题 (std_msgs/Bool, data=true)

**测试场景：**
- 随机失败模拟：可以测试重试功能
- 不同启动时长：观察进度状态更新
- 控制台日志：查看详细启动过程
- 状态话题发布：验证节点启动标志

## 技术细节

### 组件文件

- **组件**: `src/components/common/NodeLauncher.tsx`
- **集成位置**: `src/components/Dashboard/index.tsx`

### 状态管理

使用React useState管理：
- `isLaunching`: 是否正在启动
- `showDetail`: 是否显示详细Modal
- `nodes`: 节点状态数组，每个节点包含：
  - `name`: 节点标识
  - `displayName`: 显示名称
  - `status`: 'pending' | 'launching' | 'success' | 'failed'
  - `message`: 状态消息

### 错误处理与重试机制

- ROS未连接时禁用按钮并显示警告
- 服务调用失败时捕获异常并显示错误消息
- 单个节点失败不影响其他节点启动
- **重试功能**:
  - 失败节点右侧显示红色"重试"按钮
  - 通过 `launchSingleNode(nodeName)` 函数单独重启失败节点
  - 重试时仅调用该节点对应的ROS服务
  - 重试过程中禁用所有重试按钮（通过`isLaunching`状态控制）
  - 重试成功后更新节点状态，不影响整体进度计算

## 注意事项

1. **服务实现**: 必须在ROS后端实现两个Trigger服务（`/system/start_slam_node` 和 `/system/start_navigation_node`）
2. **启动顺序**: 按照SLAM→导航的顺序启动，每个节点间隔500ms
3. **状态话题**: 节点启动成功后应发布对应的status话题（`/slam/status` 和 `/navigation/status`）
4. **权限要求**: 确保ROS服务有权限启动launch文件
5. **错误日志**: 失败时检查ROS日志获取详细错误信息
6. **节点状态**: 服务负责启动并发布状态话题，前端可通过订阅status话题监控节点运行状态

## 未来扩展

可能的功能扩展：

1. **节点状态监控**: 实时监控节点运行状态
2. **停止节点**: 添加停止所有节点的功能
3. **自定义启动**: 允许用户选择启动哪些节点
4. **配置管理**: 保存和加载不同的节点启动配置
5. **日志查看**: 显示节点启动日志
