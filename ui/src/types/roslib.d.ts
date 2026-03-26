declare module 'roslib' {
  export class Ros {
    constructor(options: { url: string });
    on(event: string, callback: (data?: any) => void): void;
    close(): void;
  }

  export class Topic {
    constructor(options: {
      ros: Ros;
      name: string;
      messageType: string;
    });
    subscribe(callback: (message: any) => void): void;
    unsubscribe(): void;
    publish(message: any): void;
  }

  export class Service {
    constructor(options: {
      ros: Ros;
      name: string;
      serviceType: string;
    });
    callService(
      request: any,
      callback: (response: any) => void,
      errorCallback?: (error: any) => void
    ): void;
  }

  export class ActionClient {
    constructor(options: {
      ros: Ros;
      serverName: string;
      actionName: string;
    });
    cancel(): void;
  }

  export class Goal {
    constructor(options: {
      actionClient: ActionClient;
      goalMessage: any;
    });
    on(event: string, callback: (data?: any) => void): void;
    send(): void;
  }
}
