export default function AliyunLoadingView() {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-label="正在加载阿里云数据">
      <div className="loading-breadcrumb loading-shimmer" />
      <div className="loading-heading">
        <div>
          <div className="loading-title loading-shimmer" />
          <div className="loading-subtitle loading-shimmer" />
        </div>
        <div className="loading-button loading-shimmer" />
      </div>
      <div className="loading-message">
        <span className="loading-spinner" />
        <span>正在连接阿里云并汇总全部地域数据...</span>
      </div>
      <div className="loading-stats">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="loading-stat-card" key={index}>
            <div className="loading-label loading-shimmer" />
            <div className="loading-value loading-shimmer" />
          </div>
        ))}
      </div>
      <div className="loading-table-card">
        <div className="loading-table-header">
          <div className="loading-card-title loading-shimmer" />
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <div className="loading-table-row" key={index}>
            <div className="loading-cell loading-shimmer" />
            <div className="loading-cell loading-shimmer" />
            <div className="loading-cell loading-shimmer" />
            <div className="loading-cell loading-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
