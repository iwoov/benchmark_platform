"use client";

import "@ant-design/v5-patch-for-react-19";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider, theme } from "antd";
import type { PropsWithChildren } from "react";

export function Providers({ children }: PropsWithChildren) {
  return (
    <AntdRegistry>
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: "#1456d9",
            borderRadius: 14,
            colorBgBase: "#f3f5f8",
            colorTextBase: "#172033",
            fontFamily:
              '"IBM Plex Sans", "PingFang SC", "Helvetica Neue", sans-serif',
          },
          components: {
            Layout: {
              bodyBg: "#f3f5f8",
              siderBg: "rgba(255, 255, 255, 0.88)",
              headerBg: "rgba(255, 255, 255, 0.88)",
            },
            Card: {
              borderRadiusLG: 24,
            },
            Button: {
              controlHeight: 42,
            },
            Input: {
              controlHeight: 44,
            },
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
