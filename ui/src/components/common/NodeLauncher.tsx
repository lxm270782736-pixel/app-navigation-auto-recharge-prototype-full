import React, { useState, useEffect } from 'react';
import { Button, Space, Progress, Tag, Modal, List } from 'antd';
import {
  RocketOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';
import { ROS2_MESSAGE_TYPES } from '@/config/ros2MessageTypes';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';

interface NodeStatus {
  name: string;
  displayName: string;
  status: 'pending' | 'launching' | 'success' | 'failed';
  message?: string;
  running?: boolean; // 节点是否正在运行（通过status话题获取）
}

export const NodeLauncher: React.FC = () => {
  const { connectionStatus } = useROS();
  const [isLaunching, setIsLaunching] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [nodes, setNodes] = useState<NodeStatus[]>([
    { name: 'slam', displayName: 'SLAM节点', status: 'pending', running: false },
    { name: 'navigation', displayName: '导航节点', status: 'pending', running: false },
  ]);

  // 订阅节点状态话题
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    // 订阅SLAM状态
    const unsubscribeSlam = rosService.subscribeTopic<{ data: boolean }>(
      '/slam/status',
      ROS2_MESSAGE_TYPES.BOOL,
      (msg) => {
        setNodes((prevNodes) =>
          prevNodes.map((node) =>
            node.name === 'slam' ? { ...node, running: msg.data } : node
          )
        );
      }
    );

    // 订阅导航状态
    const unsubscribeNav = rosService.subscribeTopic<{ data: boolean }>(
      '/navigation/status',
      ROS2_MESSAGE_TYPES.BOOL,
      (msg) => {
        setNodes((prevNodes) =>
          prevNodes.map((node) =>
            node.name === 'navigation' ? { ...node, running: msg.data } : node
          )
        );
      }
    );

    return () => {
      unsubscribeSlam();
      unsubscribeNav();
    };
  }, [connectionStatus]);

  const updateNodeStatus = (name: string, status: NodeStatus['status'], message?: string) => {
    setNodes((prevNodes) =>
      prevNodes.map((node) =>
        node.name === name ? { ...node, status, message } : node
      )
    );
  };

  // 启动单个节点
  const launchSingleNode = async (nodeName: string) => {
    updateNodeStatus(nodeName, 'launching');

    try {
      let serviceMap: { [key: string]: string } = {
        slam: '/system/start_slam_node',
        navigation: '/system/start_navigation_node',
      };

      const result = await rosService.callService<{}, { success: boolean; message: string }>(
        serviceMap[nodeName],
        ROS2_MESSAGE_TYPES.TRIGGER,
        {}
      );

      if (result.success) {
        updateNodeStatus(nodeName, 'success', result.message || `${nodeName}节点启动成功`);
      } else {
        updateNodeStatus(nodeName, 'failed', result.message || `${nodeName}节点启动失败`);
      }
    } catch (error) {
      updateNodeStatus(nodeName, 'failed', '服务调用失败：' + (error as Error).message);
    }
  };

  const launchAllNodes = async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      Modal.error({
        title: '启动失败',
        content: 'ROS未连接，请先确保ROS Bridge已连接',
      });
      return;
    }

    setIsLaunching(true);
    setShowDetail(true);

    // 重置所有节点状态
    setNodes((prevNodes) =>
      prevNodes.map((node) => ({ ...node, status: 'pending' as const }))
    );

    try {
      // 1. 启动SLAM节点
      updateNodeStatus('slam', 'launching');
      try {
        const slamResult = await rosService.callService<{}, { success: boolean; message: string }>(
          '/system/start_slam_node',
          ROS2_MESSAGE_TYPES.TRIGGER,
          {}
        );

        if (slamResult.success) {
          updateNodeStatus('slam', 'success', slamResult.message || 'SLAM节点启动成功');
        } else {
          updateNodeStatus('slam', 'failed', slamResult.message || 'SLAM节点启动失败');
        }
      } catch (error) {
        updateNodeStatus('slam', 'failed', '服务调用失败：' + (error as Error).message);
      }

      // 等待500ms让节点初始化
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 2. 启动导航节点
      updateNodeStatus('navigation', 'launching');
      try {
        const navResult = await rosService.callService<{}, { success: boolean; message: string }>(
          '/system/start_navigation_node',
          ROS2_MESSAGE_TYPES.TRIGGER,
          {}
        );

        if (navResult.success) {
          updateNodeStatus('navigation', 'success', navResult.message || '导航节点启动成功');
        } else {
          updateNodeStatus('navigation', 'failed', navResult.message || '导航节点启动失败');
        }
      } catch (error) {
        updateNodeStatus('navigation', 'failed', '服务调用失败：' + (error as Error).message);
      }

    } finally {
      setIsLaunching(false);
    }
  };

  const getStatusIcon = (status: NodeStatus['status']) => {
    switch (status) {
      case 'launching':
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return null;
    }
  };

  const getStatusTag = (status: NodeStatus['status']) => {
    switch (status) {
      case 'launching':
        return <Tag color="processing">启动中</Tag>;
      case 'success':
        return <Tag color="success">已启动</Tag>;
      case 'failed':
        return <Tag color="error">失败</Tag>;
      default:
        return <Tag color="default">待启动</Tag>;
    }
  };

  const getOverallProgress = () => {
    const successCount = nodes.filter((n) => n.status === 'success').length;
    const totalCount = nodes.length;
    return Math.round((successCount / totalCount) * 100);
  };

  const getOverallStatus = () => {
    if (nodes.every((n) => n.status === 'success')) {
      return 'success';
    }
    if (nodes.some((n) => n.status === 'failed')) {
      return 'exception';
    }
    if (isLaunching) {
      return 'active';
    }
    return 'normal';
  };

  return (
    <>
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: 'white' }}>
              <ThunderboltOutlined style={{ fontSize: '20px', marginRight: '8px' }} />
              <span style={{ fontSize: '16px', fontWeight: 500 }}>系统节点控制</span>
            </div>
            {getOverallProgress() > 0 && (
              <Tag color="white" style={{ color: '#667eea', fontWeight: 500 }}>
                {getOverallProgress()}%
              </Tag>
            )}
          </div>

          {getOverallProgress() > 0 && (
            <Progress
              percent={getOverallProgress()}
              status={getOverallStatus()}
              strokeColor={{
                '0%': '#52c41a',
                '100%': '#95de64',
              }}
              showInfo={false}
            />
          )}

          <Button
            type="primary"
            size="large"
            icon={<RocketOutlined />}
            onClick={launchAllNodes}
            loading={isLaunching}
            disabled={connectionStatus !== ConnectionStatus.CONNECTED}
            block
            style={{
              background: 'white',
              color: '#667eea',
              borderColor: 'white',
              fontWeight: 500,
              height: '44px',
            }}
          >
            {isLaunching ? '启动中...' : '一键启动所有节点'}
          </Button>

          {connectionStatus !== ConnectionStatus.CONNECTED && (
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
              ⚠️ 请先连接ROS Bridge
            </div>
          )}

          {/* 节点运行状态显示 */}
          {connectionStatus === ConnectionStatus.CONNECTED && (
            <div
              style={{
                fontSize: '12px',
                color: 'rgba(255,255,255,0.9)',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: nodes.find(n => n.name === 'slam')?.running ? '#52c41a' : '#8c8c8c',
                    marginRight: '8px',
                    display: 'inline-block',
                  }}
                />
                <span>SLAM节点: {nodes.find(n => n.name === 'slam')?.running ? '运行中' : '已停止'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: nodes.find(n => n.name === 'navigation')?.running ? '#52c41a' : '#8c8c8c',
                    marginRight: '8px',
                    display: 'inline-block',
                  }}
                />
                <span>导航节点: {nodes.find(n => n.name === 'navigation')?.running ? '运行中' : '已停止'}</span>
              </div>
            </div>
          )}

          {getOverallProgress() > 0 && (
            <Button
              size="small"
              type="text"
              onClick={() => setShowDetail(true)}
              style={{ color: 'white', padding: 0 }}
            >
              查看详细状态 →
            </Button>
          )}
        </Space>
      </div>

      {/* 详细状态Modal */}
      <Modal
        title={
          <div style={{ fontSize: '18px' }}>
            <ThunderboltOutlined style={{ marginRight: '8px', color: '#667eea' }} />
            节点启动状态
          </div>
        }
        open={showDetail}
        onCancel={() => setShowDetail(false)}
        footer={
          <Button type="primary" onClick={() => setShowDetail(false)}>
            关闭
          </Button>
        }
        width={520}
      >
        <div style={{ marginTop: '16px' }}>
          <Progress
            percent={getOverallProgress()}
            status={getOverallStatus()}
            style={{ marginBottom: '24px' }}
          />

          <List
            dataSource={nodes}
            renderItem={(node) => (
              <List.Item
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <div style={{ width: '100%' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getStatusIcon(node.status)}
                      <span style={{ fontWeight: 500, fontSize: '14px' }}>
                        {node.displayName}
                      </span>
                    </div>
                    <Space>
                      {getStatusTag(node.status)}
                      {node.status === 'failed' && (
                        <Button
                          type="primary"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => launchSingleNode(node.name)}
                          disabled={isLaunching}
                          danger
                        >
                          重试
                        </Button>
                      )}
                    </Space>
                  </div>
                  {node.message && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: node.status === 'failed' ? '#ff4d4f' : '#666',
                        marginLeft: '24px',
                        marginTop: '4px',
                      }}
                    >
                      {node.message}
                    </div>
                  )}
                </div>
              </List.Item>
            )}
          />

          {isLaunching && (
            <div
              style={{
                textAlign: 'center',
                color: '#1890ff',
                fontSize: '13px',
                marginTop: '16px',
              }}
            >
              <LoadingOutlined style={{ marginRight: '8px' }} />
              正在依次启动节点，请稍候...
            </div>
          )}

          {!isLaunching && nodes.every((n) => n.status === 'success') && (
            <div
              style={{
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: '4px',
                padding: '12px',
                marginTop: '16px',
                color: '#52c41a',
                fontSize: '13px',
                textAlign: 'center',
              }}
            >
              <CheckCircleOutlined style={{ marginRight: '8px' }} />
              所有节点启动成功！系统已就绪
            </div>
          )}

          {!isLaunching && nodes.some((n) => n.status === 'failed') && (
            <div
              style={{
                background: '#fff2f0',
                border: '1px solid #ffccc7',
                borderRadius: '4px',
                padding: '12px',
                marginTop: '16px',
                color: '#ff4d4f',
                fontSize: '13px',
              }}
            >
              <CloseCircleOutlined style={{ marginRight: '8px' }} />
              部分节点启动失败，请检查ROS系统状态
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
