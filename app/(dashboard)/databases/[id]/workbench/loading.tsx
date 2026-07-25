import { Card, Skeleton } from "antd";

export default function Loading() {
  return <Card className="database-workbench-loading"><Skeleton active paragraph={{ rows: 14 }} /></Card>;
}
