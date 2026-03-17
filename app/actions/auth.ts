"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export type LoginFormState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  try {
    await signIn("credentials", {
      identifier: formData.get("identifier"),
      password: formData.get("password"),
      redirectTo: "/",
    });

    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "用户名/邮箱或密码错误，请重试。",
      };
    }

    throw error;
  }
}

export async function logoutAction() {
  await signOut({
    redirectTo: "/login",
  });
}
