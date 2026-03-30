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
}) => {
  // 默认 CONNECTED — 不再依赖 ROS Bridge 连接状态门控 UI
  // SSE 连接到后端 FastAPI，Meta 管理 ROS 通信
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    ConnectionStatus.CONNECTED
  );

  const connect = async () => {
    try {
      setConnectionStatus(ConnectionStatus.CONNECTING);
      await rosService.connect();
    } catch (error) {
      console.error('Failed to connect:', error);
      setConnectionStatus(ConnectionStatus.ERROR);
      throw error;
    }
  };

  const disconnect = () => {
    rosService.disconnect();
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

    rosService.on('connection', handleConnection);
    rosService.on('error', handleError);

    if (autoConnect) {
      connect().catch(() => {
        // SSE 连接失败不影响 UI，保持 CONNECTED 状态
        setConnectionStatus(ConnectionStatus.CONNECTED);
      });
    }

    return () => {
      rosService.off('connection', handleConnection);
      rosService.off('error', handleError);
    };
  }, [autoConnect]);

  return (
    <ROSContext.Provider value={{ connectionStatus, connect, disconnect }}>
      {children}
    </ROSContext.Provider>
  );
};
