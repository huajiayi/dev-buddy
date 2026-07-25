import { Card, Skeleton } from "antd";

export default function DashboardLoading() {
  return (
    <Card className="detail-card" aria-label="页面加载中">
      <Skeleton active title={{ width: "28%" }} paragraph={{ rows: 6 }} />
    </Card>
  );
}
