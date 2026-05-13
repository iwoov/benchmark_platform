import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-5 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-60"
        style={{
          maskImage: "radial-gradient(circle at center, black 38%, transparent 88%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 38%, transparent 88%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-radial-fade opacity-70"
      />
      <div className="relative z-10 w-full max-w-md">
        <LoginForm />
      </div>
    </main>
  );
}
