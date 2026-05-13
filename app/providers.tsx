"use client";

import type { PropsWithChildren } from "react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/toast";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <Toaster>{children}</Toaster>
    </ThemeProvider>
  );
}
