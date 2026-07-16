"use client";

import { Alert, Button, Result } from "antd";

export default function AliyunError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <Result
    status="error"
    title="阿里云数据加载失败"
    subTitle="请检查数据库连接或账号配置后重试"
    extra={<Button type="primary" onClick={reset}>重新加载</Button>}
  >
    <Alert type="error" showIcon message={error.message || "未知错误"} />
  </Result>;
}
