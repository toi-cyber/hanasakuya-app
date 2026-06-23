declare const APP_VERSION: string;

interface LicenseStatus {
  registered: boolean;
  key: string | null;
}

interface VerifyResult {
  valid: boolean;
  reason?: string;
  expires_at?: string | null;
}

interface Window {
  license: {
    getStatus(): Promise<LicenseStatus>;
    register(key: string, clientSecret: string): Promise<VerifyResult>;
    clear(): Promise<void>;
  };
  logger: {
    getWebhookUrl(): Promise<string>;
    setWebhookUrl(url: string): Promise<void>;
    forwardLog(message: string): Promise<void>;
  };
}

declare module '*.png' {
  const src: string;
  export default src;
}
