import { Card, Empty } from "antd";

export default function ReviewsPage() {
  return (
    <Card className="panel" style={{ borderRadius: 24 }}>
      <h2 style={{ marginTop: 0, fontSize: 28, lineHeight: 1.1 }}>审核记录</h2>
      <p className="muted" style={{ lineHeight: 1.7 }}>
        这里后续承接人工审核记录、AI 审核结果和按外部记录 ID 的追踪视图。
      </p>
      <Empty description="一期骨架暂未接入审核数据" />
    </Card>
  );
}
