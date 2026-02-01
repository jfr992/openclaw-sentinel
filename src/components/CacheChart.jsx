import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

function formatNumber(num) {
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

export default function CacheChart({ cacheRead, totalInput }) {
  const cached = cacheRead || 0
  const fresh = totalInput || 0
  const total = cached + fresh

  if (total === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-[var(--text-muted)]">
        No data yet
      </div>
    )
  }

  const data = [
    { name: 'Cached', value: cached, color: '#22c55e' },
    { name: 'Fresh', value: fresh, color: '#3b82f6' }
  ]

  const ratio = total > 0 ? ((cached / total) * 100).toFixed(1) : 0
  const savings = cached > 0 ? `~$${((cached * 0.000001) * 0.5).toFixed(2)} saved` : ''

  return (
    <div className="h-48 relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={65}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatNumber(value) + ' tokens'}
            contentStyle={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '12px'
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(value, entry) => (
              <span className="text-xs text-[var(--text-muted)]">
                {value}: {formatNumber(entry.payload.value)}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginTop: '-24px' }}>
        <div className="text-center">
          <div className="text-xl font-bold text-[var(--accent-green)]">{ratio}%</div>
          <div className="text-[10px] text-[var(--text-muted)]">cache hit</div>
          {savings && <div className="text-[9px] text-[var(--accent-green)] mt-0.5">{savings}</div>}
        </div>
      </div>
    </div>
  )
}
