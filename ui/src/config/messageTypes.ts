/**
 * Robot Message Type Configuration
 *
 * Message type strings used for topic subscriptions.
 */
export const MESSAGE_TYPES = {
  // ============================================
  // Topic Message Types (package/msg/Type)
  // ============================================

  // Navigation messages
  OCCUPANCY_GRID: 'nav_msgs/msg/OccupancyGrid',
  ODOMETRY: 'nav_msgs/msg/Odometry',
  PATH: 'nav_msgs/msg/Path',

  // Geometry messages
  POSE_WITH_COVARIANCE_STAMPED: 'geometry_msgs/msg/PoseWithCovarianceStamped',
  POSE_STAMPED: 'geometry_msgs/msg/PoseStamped',
  TWIST: 'geometry_msgs/msg/Twist',
  TWIST_STAMPED: 'geometry_msgs/msg/TwistStamped',

  // Sensor messages
  LASER_SCAN: 'sensor_msgs/msg/LaserScan',
  POINT_CLOUD2: 'sensor_msgs/msg/PointCloud2',
  IMAGE: 'sensor_msgs/msg/Image',
  BATTERY_STATE: 'sensor_msgs/msg/BatteryState',

  // Standard messages
  STRING: 'std_msgs/msg/String',
  INT32: 'std_msgs/msg/Int32',
  BOOL: 'std_msgs/msg/Bool',
  FLOAT32: 'std_msgs/msg/Float32',
  HEADER: 'std_msgs/msg/Header',

  // Action messages
  GOAL_STATUS_ARRAY: 'actionlib_msgs/GoalStatusArray',

  // Dock messages
  DOCK_STATUS: 'astribot_nav_msgs/msg/DockStatus',

  // ============================================
  // Service Types (package/srv/Type)
  // ============================================

  // Standard services
  TRIGGER: 'std_srvs/srv/Trigger',
  SET_BOOL: 'std_srvs/srv/SetBool',
  EMPTY: 'std_srvs/srv/Empty',

  // Localization services (custom)
  APPLY_MAP: 'localization_msgs/srv/ApplyMap',
  LIST_MAPS: 'localization_msgs/srv/ListMaps',
  SAVE_MAP: 'localization_msgs/srv/SaveMap',
  LOAD_MAP: 'localization_msgs/srv/LoadMap',
  DELETE_MAP: 'localization_msgs/srv/DeleteMap',
  GET_CURRENT_MAP_NAME: 'localization_msgs/srv/GetCurrentMapName',

  // Astribot services (custom)
  GET_MAP_LIST: 'astribot_nav_msgs/srv/GetMapList',
  RAW_REQUEST: 'astribot_nav_msgs/srv/RawRequest',

  // ============================================
  // Action Types (package/action/Type)
  // ============================================

  // Navigation action (custom)
  MOVE_CHASSIS_TO: 'astribot_nav_msgs/action/MoveChassisTo',

  // Nav2 actions
  NAVIGATE_TO_POSE: 'nav2_msgs/action/NavigateToPose',
  FOLLOW_PATH: 'nav2_msgs/action/FollowPath',

  // Dock actions
  DOCK: 'astribot_nav_msgs/action/Dock',
  UNDOCK: 'astribot_nav_msgs/action/Undock',
};

/**
 * Helper function to get ROS2 message type
 * Can be used for dynamic type lookup
 */
export function getMessageType(key: keyof typeof MESSAGE_TYPES): string {
  return MESSAGE_TYPES[key];
}

export default MESSAGE_TYPES;
