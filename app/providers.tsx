"use client";

import { WalletProvider } from "@/lib/wallet";
import { TxProvider, TxDock } from "@/lib/tx";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <TxProvider>
        {children}
        <TxDock />
      </TxProvider>
    </WalletProvider>
  );
}
