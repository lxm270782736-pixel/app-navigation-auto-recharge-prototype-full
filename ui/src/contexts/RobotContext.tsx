import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '@/services/api';
import { ConnectionStatus } from '@/types';

interface RobotContextType {
  connectionStatus: ConnectionStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const RobotContext = createContext<RobotContextType | undefined>(undefined);

export const useRobot = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error('useRobot must be used within RobotProvider');
  }
  return context;
};

interface RobotProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
}

export const RobotProvider: React.FC<RobotProviderProps> = ({
  children,
  autoConnect = true,
}) => {
  // 默认 CONNECTED — 不再依赖 ROS Bridge 连接状态门控 UI
  // SSE 连接到后端 FastAPI，Meta 管理 ROS 通信
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    ConnectionStatus.CONNECTED
  );

  const connect = async () => {
    try {
      setConnectionStatus(ConnectionStatus.CONNECTING);
      await apiService.connect();
    } catch (error) {
      console.error('Failed to connect:', error);
      setConnectionStatus(ConnectionStatus.ERROR);
      throw error;
    }
  };

  const disconnect = () => {
    apiService.disconnect();
    setConnectionStatus(ConnectionStatus.DISCONNECTED);
  };

  useEffect(() => {
    const handleConnection = ({ connected }: { connected: boolean }) => {
      setConnectionStatus(
        connected ? ConnectionStatus.CONNECTED : ConnectionStatus.CONNECTED
      );
    };

    const handleError = () => {
      // 不降级到 ERROR — Meta 模式下 ROS Bridge 非必须
    };

    apiService.on('connection', handleConnection);
    apiService.on('error', handleError);

    if (autoConnect) {
      connect().catch(() => {
        // SSE 连接失败不影响 UI，保持 CONNECTED 状态
        setConnectionStatus(ConnectionStatus.CONNECTED);
      });
    }

    return () => {
      apiService.off('connection', handleConnection);
      apiService.off('error', handleError);
    };
  }, [autoConnect]);

  return (
    <RobotContext.Provider value={{ connectionStatus, connect, disconnect }}>
      {children}
    </RobotContext.Provider>
  );
};
