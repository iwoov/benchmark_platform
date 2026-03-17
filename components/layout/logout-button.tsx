"use client";

import { LogOut } from "lucide-react";
import { Button } from "antd";
import { logoutAction } from "@/app/actions/auth";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button htmlType="submit" icon={<LogOut size={16} />}>
        退出登录
      </Button>
    </form>
  );
}
