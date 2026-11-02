// Small horizontal bar-per-category readout. Each row is directly labeled
// (name + count) so identity never depends on color alone.
export default function StatusBreakdownBars({ items }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="status-bars">
      {items.map((item) => (
        <div className="status-bar-row" key={item.label}>
          <span className="status-bar-label">{item.label}</span>
          <div className="status-bar-track">
            <div
              className="status-bar-fill"
              style={{ width: `${(item.count / max) * 100}%`, background: item.color }}
            />
          </div>
          <span className="status-bar-count">{item.count}</span>
        </div>
      ))}
    </div>
  );
}
