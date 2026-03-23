"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="logout-trigger">
        <span className="logout-trigger-icon">
          <LogOut size={15} />
        </span>
        <span className="logout-trigger-label">退出登录</span>
      </button>
    </form>
  );
}
