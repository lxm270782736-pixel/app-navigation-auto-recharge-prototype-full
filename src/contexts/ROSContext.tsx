import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { rosService } from '@/services/ros';
import { ConnectionStatus } from '@/types';

interface ROSContextType {
  connectionStatus: ConnectionStatus;
  connect: (url?: string) => Promise<void>;
  disconnect: () => void;
}

const ROSContext = createContext<ROSContextType | undefined>(undefined);

export const useROS = () => {
  const context = useContext(ROSContext);
  if (!context) {
    throw new Error('useROS must be used within ROSProvider');
  }
  return context;
};

interface ROSProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
  rosUrl?: string;
}

export const ROSProvider: React.FC<ROSProviderProps> = ({
  children,
  autoConnect = true,
  rosUrl,
}) => {
  // 动态获取ROS Bridge地址：使用当前网页的主机名 + 9090端口
  const defaultRosUrl = rosUrl || `ws://${window.location.hostname}:9090`;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    ConnectionStatus.DISCONNECTED
  );

  const connect = async (url: string = defaultRosUrl) => {
    try {
      setConnectionStatus(ConnectionStatus.CONNECTING);
      await rosService.connect(url);
      setConnectionStatus(ConnectionStatus.CONNECTED);
    } catch (error) {
      console.error('Failed to connect to ROS:', error);
      setConnectionStatus(ConnectionStatus.ERROR);
      throw error;
    }
  };

  const disconnect = () => {
    rosService.disconnect();
    setConnectionStatus(ConnectionStatus.DISCONNECTED);
  };

  useEffect(() => {
    // 监听连接状态变化
    const handleConnection = ({ connected }: { connected: boolean }) => {
      setConnectionStatus(
        connected ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
      );
    };

    const handleError = () => {
      setConnectionStatus(ConnectionStatus.ERROR);
    };

    rosService.on('connection', handleConnection);
    rosService.on('error', handleError);

    // 自动连接
    if (autoConnect) {
      connect().catch(() => {
        // 错误已在connect函数中处理
      });
    }

    return () => {
      rosService.off('connection', handleConnection);
      rosService.off('error', handleError);
    };
  }, [autoConnect, defaultRosUrl]);

  return (
    <ROSContext.Provider value={{ connectionStatus, connect, disconnect }}>
      {children}
    </ROSContext.Provider>
  );
};
