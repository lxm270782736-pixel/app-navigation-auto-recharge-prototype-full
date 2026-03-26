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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    ConnectionStatus.DISCONNECTED
  );

  const connect = async () => {
    try {
      setConnectionStatus(ConnectionStatus.CONNECTING);
      await rosService.connect();
      // Actual connected/disconnected comes from SSE event listener below
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
        connected ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
      );
    };

    const handleError = () => {
      setConnectionStatus(ConnectionStatus.ERROR);
    };

    rosService.on('connection', handleConnection);
    rosService.on('error', handleError);

    if (autoConnect) {
      connect().catch(() => {});
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
