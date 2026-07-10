import React, { createContext, useContext, useMemo, useState } from "react";

type CallUiVisibilityValue = {
  inCallUiVisible: boolean;
  setInCallUiVisible: (v: boolean) => void;
};

const Ctx = createContext<CallUiVisibilityValue | null>(null);

export function CallUiVisibilityProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [inCallUiVisible, setInCallUiVisible] = useState(false);
  const value = useMemo(
    () => ({ inCallUiVisible, setInCallUiVisible }),
    [inCallUiVisible]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCallUiVisibility(): CallUiVisibilityValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useCallUiVisibility must be used within CallUiVisibilityProvider");
  }
  return v;
}

