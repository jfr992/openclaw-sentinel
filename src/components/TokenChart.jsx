import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function TokenChart({ data }) {
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
      tokens: Math.round(values.tokens / 1000), // K tokens
      fullDate: date
    }))
    .sort((a, b) => a.fullDate.localeCompare(b.fullDate))
    .slice(-7) // Last 7 days

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            tickFormatter={(v) => `${v}K`}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: '#1a1a24',
              border: '1px solid #2a2a3a',
              borderRadius: '8px',
              fontSize: '12px'
            }}
            formatter={(value) => [`${value.toLocaleString()}K tokens`, 'Usage']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="tokens"
            stroke="#f97316"
            strokeWidth={2}
            fill="url(#tokenGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
