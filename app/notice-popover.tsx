"use client";

import { InfoCircleOutlined } from "@ant-design/icons";
import { Popover, Typography } from "antd";

const { Paragraph } = Typography;

export default function NoticePopover({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Popover
      trigger={["hover", "focus"]}
      mouseEnterDelay={0.15}
      placement="rightTop"
      title={title}
      content={<Paragraph className="notice-popover-content">{description}</Paragraph>}
    >
      <span
        className="notice-popover-trigger"
        role="button"
        tabIndex={0}
        aria-label={`查看说明：${title}`}
      >
        <InfoCircleOutlined />
      </span>
    </Popover>
  );
}
