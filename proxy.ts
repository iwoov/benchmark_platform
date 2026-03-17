export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/admin/:path*", "/workspace/:path*", "/dashboard/:path*"],
};
