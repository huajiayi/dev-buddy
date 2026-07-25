import { Card, Skeleton } from "antd";

export default function Loading() {
  return <Card className="detail-card"><Skeleton active paragraph={{ rows: 10 }} /></Card>;
}

