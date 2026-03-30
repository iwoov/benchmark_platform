import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="page-shell login-page-shell">
      <div className="login-grid">
        <LoginForm />
      </div>
    </main>
  );
}
