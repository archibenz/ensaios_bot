/// <reference types="vite/client" />

declare module '@tonconnect/ui' {
  export class TonConnectUI {
    constructor(options: { manifestUrl: string });
    uiOptions?: Record<string, unknown>;
    renderWalletList(element: HTMLElement): void;
    onStatusChange(callback: (wallet: unknown) => void): void;
  }
}

