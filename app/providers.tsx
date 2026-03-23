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
            colorPrimary: "#409eff",
            borderRadius: 6,
            colorBgBase: "#f5f7fa",
            colorBgContainer: "#ffffff",
            colorBorder: "#dcdfe6",
            colorTextBase: "#303133",
            boxShadow: "0 1px 2px rgba(16, 24, 40, 0.05)",
            boxShadowSecondary: "0 10px 30px rgba(16, 24, 40, 0.06)",
            fontFamily:
              '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif',
          },
          components: {
            Layout: {
              bodyBg: "#f5f7fa",
              siderBg: "#ffffff",
              headerBg: "#ffffff",
            },
            Card: {
              borderRadiusLG: 10,
            },
            Button: {
              controlHeight: 40,
              defaultShadow: "none",
              primaryShadow: "none",
            },
            Input: {
              controlHeight: 40,
            },
            Select: {
              controlHeight: 40,
            },
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
