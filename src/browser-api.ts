/* Cross-browser extension API shim for Chrome MV3 and Firefox. */

interface ChromeRuntimeLike {
  getURL(path: string): string;
  sendMessage(message: unknown): Promise<unknown>;
  openOptionsPage(): Promise<void>;
  onMessage: {
    addListener(
      callback: (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void,
      ) => boolean | void,
    ): void;
  };
}

interface ChromeStorageAreaLike {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ChromeApiLike {
  runtime: ChromeRuntimeLike;
  storage: {
    local: ChromeStorageAreaLike;
    onChanged: {
      addListener(
        callback: (
          changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
          areaName: string,
        ) => void,
      ): void;
    };
  };
  tabs: {
    query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Array<{ id?: number; url?: string }>>;
    remove(tabId: number): Promise<void>;
    onCreated: {
      addListener(callback: (tab: { id?: number; url?: string; pendingUrl?: string }) => void): void;
    };
    onUpdated: {
      addListener(
        callback: (
          tabId: number,
          changeInfo: { url?: string },
          tab: { id?: number; url?: string; pendingUrl?: string },
        ) => void,
      ): void;
    };
  };
}

function getExtApi(): ChromeApiLike {
  const g = globalThis as unknown as { chrome?: ChromeApiLike; browser?: ChromeApiLike };
  if (g.chrome?.runtime) return g.chrome;
  if (g.browser?.runtime) return g.browser;
  throw new Error("Extension runtime API unavailable");
}

export function hasExtStorage(): boolean {
  const g = globalThis as unknown as { chrome?: ChromeApiLike; browser?: ChromeApiLike };
  return Boolean(g.chrome?.storage?.local || g.browser?.storage?.local);
}

export const ext = {
  getURL(path: string): string {
    return getExtApi().runtime.getURL(path);
  },
  async storageGet(key: string): Promise<Record<string, unknown>> {
    return getExtApi().storage.local.get(key);
  },
  async storageSet(items: Record<string, unknown>): Promise<void> {
    return getExtApi().storage.local.set(items);
  },
  onStorageChanged(
    cb: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void,
  ): void {
    getExtApi().storage.onChanged.addListener(cb);
  },
  async sendMessage(message: unknown): Promise<unknown> {
    return getExtApi().runtime.sendMessage(message);
  },
  onMessage(handler: (message: unknown) => Promise<unknown> | undefined): void {
    getExtApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const maybePromise = handler(message);
      if (!maybePromise) return false;
      void maybePromise.then(sendResponse).catch(() => sendResponse(undefined));
      return true;
    });
  },
  async queryActiveTabUrl(): Promise<string | undefined> {
    const tabs = await getExtApi().tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.url;
  },
  async queryAllTabs(): Promise<Array<{ id?: number; url?: string }>> {
    return getExtApi().tabs.query({});
  },
  async closeTab(tabId: number): Promise<void> {
    return getExtApi().tabs.remove(tabId);
  },
  onTabCreated(cb: (tab: { id?: number; url?: string; pendingUrl?: string }) => void): void {
    getExtApi().tabs.onCreated.addListener(cb);
  },
  onTabUpdated(
    cb: (
      tabId: number,
      changeInfo: { url?: string },
      tab: { id?: number; url?: string; pendingUrl?: string },
    ) => void,
  ): void {
    getExtApi().tabs.onUpdated.addListener(cb);
  },
  async openOptionsPage(): Promise<void> {
    return getExtApi().runtime.openOptionsPage();
  },
};
