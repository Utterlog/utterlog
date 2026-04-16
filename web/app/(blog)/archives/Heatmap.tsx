'use client';

interface HeatmapProps {
  data: { date: string; count: number }[];
}

export default function Heatmap({ data }: HeatmapProps) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364);
  startDate.setDate(startDate.getDate() - startDate.getDay()); // align to Sunday

  const countMap = new Map<string, number>();
  for (const d of data) countMap.set(d.date, d.count);

  const weeks: { date: Date; count: number; dateStr: string }[][] = [];
  const current = new Date(startDate);
  while (current <= today || weeks.length < 53) {
    const week: { date: Date; count: number; dateStr: string }[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = current.toISOString().slice(0, 10);
      week.push({ date: new Date(current), count: countMap.get(dateStr) || 0, dateStr });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
    if (current > today && weeks.length >= 53) break;
  }

  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const month = week[0].date.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ label: `${month + 1}月`, col: i });
      lastMonth = month;
    }
  });

  const getColor = (count: number) => {
    if (count === 0) return '#ebedf0';
    if (count === 1) return '#9be9a8';
    if (count === 2) return '#40c463';
    if (count <= 4) return '#30a14e';
    return '#216e39';
  };

  return (
    <div style={{ overflow: 'hidden' }}>
      {/* Month labels */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '3px' }}>
        {weeks.map((_, i) => {
          const label = monthLabels.find(m => m.col === i);
          return (
            <div key={i} style={{ flex: '1 0 0', fontSize: '10px', color: '#999', textAlign: 'left', minWidth: 0 }}>
              {label ? label.label : ''}
            </div>
          );
        })}
      </div>

      {/* Grid — auto-size cells to fill width */}
      <div style={{ display: 'flex', gap: '2px' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ flex: '1 0 0', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            {week.map((day, di) => {
              const isFuture = day.date > today;
              return (
                <div key={di} title={isFuture ? '' : `${day.dateStr}: ${day.count} 篇`}
                  style={{
                    width: '100%', aspectRatio: '1',
                    background: isFuture ? 'transparent' : getColor(day.count),
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '8px', fontSize: '11px', color: '#999' }}>
        <span>少</span>
        {['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'].map((c, i) => (
          <div key={i} style={{ width: '11px', height: '11px', background: c }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}
