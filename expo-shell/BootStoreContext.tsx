import React from "react";

export type BootStoreBundle = {
  store: {
    getState: () => unknown;
    dispatch: (action: unknown) => unknown;
    subscribe: (listener: () => void) => () => void;
  };
  rehydratePromise: Promise<void>;
};

export const BootStoreContext = React.createContext<BootStoreBundle | null>(null);
