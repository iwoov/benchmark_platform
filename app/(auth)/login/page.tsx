import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main
      className="page-shell"
      style={{
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
      }}
    >
      <div className="login-grid">
        <section className="panel login-showcase">
          <div className="login-showcase-copy">
            <p
              style={{
                color: "var(--muted)",
                fontWeight: 700,
                marginBottom: 16,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontSize: 12,
              }}
            >
              Benchmark Platform
            </p>
            <h1 className="login-showcase-title">
              Review
              <br />
              Console
            </h1>
            <p
              style={{
                marginTop: 24,
                maxWidth: 500,
                fontSize: 16,
                lineHeight: 1.75,
              }}
            >
              面向项目管理、数据源同步与 AI 审核的协作后台。界面收敛为低饱和配色和更清晰的结构，优先服务后台日常操作。
            </p>
          </div>

          <div className="login-meta-grid">
            {[
              { value: "Projects", label: "项目管理" },
              { value: "Auth.js", label: "登录鉴权" },
              { value: "Prisma", label: "数据模型" },
            ].map((item) => (
              <div key={item.label} className="login-meta-item">
                <div className="login-meta-item-value">{item.value}</div>
                <div
                  className="login-meta-item-copy"
                  style={{ marginTop: 8, lineHeight: 1.6 }}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <LoginForm />
      </div>
    </main>
  );
}
