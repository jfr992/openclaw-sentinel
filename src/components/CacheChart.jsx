import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts'

export default function CacheChart({ cacheRead, totalInput }) {
  const cached = cacheRead || 0
  const uncached = Math.max(0, (totalInput || 0) - cached)

  if (totalInput === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-[var(--text-muted)]">
        No data yet
      </div>
    )
  }

  const data = [
    { name: 'Cached', value: cached, color: '#22c55e' },
    { name: 'Fresh', value: uncached, color: '#3b82f6' }
  ]

  const ratio = totalInput > 0 ? ((cached / totalInput) * 100).toFixed(1) : 0

  return (
    <div className="h-48 relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Legend 
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-[var(--text-muted)]">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginTop: '-20px' }}>
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--accent-green)]">{ratio}%</div>
          <div className="text-xs text-[var(--text-muted)]">hit rate</div>
        </div>
      </div>
    </div>
  )
}
