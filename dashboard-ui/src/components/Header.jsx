import { Lock } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function Header({ onOpenPrivacy }) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <header className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">MoltBot</h1>
        <p className="text-sm text-gray-500 mt-1">Security Monitoring Dashboard</p>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Privacy indicator */}
        <button 
          onClick={onOpenPrivacy}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--dark-700)] border border-white/5 hover:border-cyan-500/30 transition-colors"
          title="Click for data flow info"
        >
          <Lock className="w-4 h-4 text-cyan-400" />
          <span className="text-sm text-gray-400">Local</span>
        </button>

        {/* Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--dark-700)] border border-white/5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-sm text-gray-300">Monitoring Active</span>
        </div>

        {/* Time */}
        <div className="text-sm text-gray-500">
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>
    </header>
  )
}
