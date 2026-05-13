"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";

type ActionState = {
  error?: string;
  success?: string;
};

export function useActionNotification(
  state: ActionState,
  options?: {
    successTitle?: string;
    errorTitle?: string;
  },
) {
  const toast = useToast();
  const lastError = useRef<string | undefined>(undefined);
  const lastSuccess = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.error && state.error !== lastError.current) {
      toast.error({
        title: options?.errorTitle ?? "操作失败",
        description: state.error,
      });
      lastError.current = state.error;
    }

    if (!state.error) {
      lastError.current = undefined;
    }
  }, [toast, options?.errorTitle, state.error]);

  useEffect(() => {
    if (state.success && state.success !== lastSuccess.current) {
      toast.success({
        title: options?.successTitle ?? "操作成功",
        description: state.success,
      });
      lastSuccess.current = state.success;
    }

    if (!state.success) {
      lastSuccess.current = undefined;
    }
  }, [toast, options?.successTitle, state.success]);
}
