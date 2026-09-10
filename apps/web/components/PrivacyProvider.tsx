"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { maskFormattedMoney, readHideAmounts, writeHideAmounts } from "../lib/privacy";

type PrivacyContextValue = {
  hidden: boolean;
  toggle: () => void;
  maskMoney: (formatted: string) => string;
};

const fallbackValue: PrivacyContextValue = {
  hidden: false,
  toggle: () => undefined,
  maskMoney: (formatted) => formatted,
};

const PrivacyContext = createContext<PrivacyContextValue>(fallbackValue);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(readHideAmounts());
  }, []);

  const toggle = useCallback(() => {
    setHidden((previous) => {
      const next = !previous;
      writeHideAmounts(next);
      return next;
    });
  }, []);

  const maskMoney = useCallback(
    (formatted: string) => maskFormattedMoney(formatted, hidden),
    [hidden]
  );

  const value = useMemo(
    () => ({ hidden, toggle, maskMoney }),
    [hidden, toggle, maskMoney]
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyContextValue {
  return useContext(PrivacyContext);
}
