"use client";

import { useEffect, useRef } from "react";
import { App } from "antd";

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
  const { notification } = App.useApp();
  const lastError = useRef<string | undefined>(undefined);
  const lastSuccess = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.error && state.error !== lastError.current) {
      notification.error({
        message: options?.errorTitle ?? "操作失败",
        description: state.error,
        placement: "topRight",
      });
      lastError.current = state.error;
    }

    if (!state.error) {
      lastError.current = undefined;
    }
  }, [notification, options?.errorTitle, state.error]);

  useEffect(() => {
    if (state.success && state.success !== lastSuccess.current) {
      notification.success({
        message: options?.successTitle ?? "操作成功",
        description: state.success,
        placement: "topRight",
      });
      lastSuccess.current = state.success;
    }

    if (!state.success) {
      lastSuccess.current = undefined;
    }
  }, [notification, options?.successTitle, state.success]);
}
