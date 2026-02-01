import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function CostChart({ data }) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-[var(--text-muted)]">
        No data yet
      </div>
    )
  }

  const chartData = Object.entries(data)
    .map(([date, values]) => ({
      date: date.slice(5), // MM-DD
      cost: parseFloat(values.cost?.toFixed(2) || 0),
      fullDate: date
    }))
    .sort((a, b) => a.fullDate.localeCompare(b.fullDate))

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#71717a', fontSize: 10 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#71717a', fontSize: 10 }}
            tickFormatter={(v) => `$${v}`}
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: '#1a1a24',
              border: '1px solid #2a2a3a',
              borderRadius: '8px',
              fontSize: '12px'
            }}
            formatter={(value) => [`$${value.toFixed(2)}`, 'Cost']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Bar
            dataKey="cost"
            fill="#22c55e"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
