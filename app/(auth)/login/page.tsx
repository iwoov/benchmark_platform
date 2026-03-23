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
        <section
          className="panel"
          style={{
            padding: 36,
            minHeight: 520,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                color: "var(--brand)",
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              一期初始化骨架
            </p>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(40px, 7vw, 68px)",
                lineHeight: 0.95,
                letterSpacing: "-0.06em",
              }}
            >
              Benchmark
              <br />
              Review Console
            </h1>
            <p
              style={{
                marginTop: 24,
                maxWidth: 460,
                color: "var(--muted)",
                fontSize: 16,
                lineHeight: 1.7,
              }}
            >
              面向项目管理、钉钉表格同步与 AI
              审核的协作后台。当前版本已完成项目骨架、用户鉴权和后台基础框架。
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 16,
            }}
          >
            {[
              { value: "Projects", label: "项目管理" },
              { value: "Auth.js", label: "登录鉴权" },
              { value: "Prisma", label: "数据模型" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 20,
                  background: "var(--panel-soft)",
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {item.value}
                </div>
                <div style={{ marginTop: 8, color: "var(--muted)" }}>
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
