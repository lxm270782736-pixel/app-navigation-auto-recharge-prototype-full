/**
 * ROS2 Message Type Constants
 *
 * Centralizes all ROS2 message type strings for easy maintenance.
 *
 * Key differences from ROS1:
 * - Topics: nav_msgs/OccupancyGrid -> nav_msgs/msg/OccupancyGrid
 * - Services: std_srvs/Trigger -> std_srvs/srv/Trigger
 * - Actions: astribot_msgs/MoveChassisToAction -> astribot_msgs/action/MoveChassis
 */

export const ROS2_MESSAGE_TYPES = {
  // ========== Standard Topics ==========
  OCCUPANCY_GRID: 'nav_msgs/msg/OccupancyGrid',
  ODOMETRY: 'nav_msgs/msg/Odometry',
  POSE_WITH_COVARIANCE_STAMPED: 'geometry_msgs/msg/PoseWithCovarianceStamped',
  POSE_STAMPED: 'geometry_msgs/msg/PoseStamped',
  TWIST: 'geometry_msgs/msg/Twist',
  LASER_SCAN: 'sensor_msgs/msg/LaserScan',
  STRING: 'std_msgs/msg/String',
  INT32: 'std_msgs/msg/Int32',
  BOOL: 'std_msgs/msg/Bool',

  // ========== Standard Services ==========
  TRIGGER: 'std_srvs/srv/Trigger',

  // ========== Custom Services - localization_msgs ==========
  APPLY_MAP: 'localization_msgs/srv/ApplyMap',
  LIST_MAPS: 'localization_msgs/srv/ListMaps',
  SAVE_MAP: 'localization_msgs/srv/SaveMap',
  LOAD_MAP: 'localization_msgs/srv/LoadMap',
  DELETE_MAP: 'localization_msgs/srv/DeleteMap',

  // ========== Custom Services - astribot_msgs ==========
  GET_MAP_LIST: 'astribot_msgs/srv/GetMapList',
  RAW_REQUEST: 'astribot_msgs/srv/RawRequest',

  // ========== Actions ==========
  MOVE_CHASSIS: 'astribot_msgs/action/MoveChassis',
};
