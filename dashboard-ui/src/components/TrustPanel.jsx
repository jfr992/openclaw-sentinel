import { useState, useEffect } from 'react'
import { Shield, ShieldCheck } from 'lucide-react'

// Helper to get base URL
const getApiUrl = (path) => `${window.location.origin}${path}`

export default function TrustPanel({ expanded }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [expanded])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch(getApiUrl('/api/trust/current-session'))
      if (res.ok) {
        const data = await res.json()
        setSessions(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error('Failed to load trust data:', e)
    } finally {
      setLoading(false)
    }
  }

  async function toggleTrust(sessionId, currentlyTrusted) {
    try {
      await fetch(getApiUrl('/api/trust/session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId, 
          action: currentlyTrusted ? 'untrust' : 'trust' 
        })
      })
      loadData()
    } catch (e) {
      console.error('Failed to toggle trust:', e)
    }
  }

  if (!expanded) {
    return (
      <div className="bg-[var(--dark-800)] rounded-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="font-medium text-white">Trusted Sessions</h2>
        </div>
        <div className="p-4 h-64 overflow-y-auto">
          <div className="text-center text-gray-500 text-sm py-8">
            <Shield className="w-8 h-8 mx-auto mb-2 text-purple-400" />
            <p>Click to manage trusted sessions</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-medium text-white text-lg">Trusted Sessions</h2>
        <button
          onClick={loadData}
          className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Trusted Sessions */}
        <section>
          <p className="text-xs text-gray-500 mb-4">
            Mark your agent sessions as trusted. Alerts from trusted sessions will show context about user requests.
          </p>
          
          {loading ? (
            <div className="text-gray-500 text-sm">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="text-violet-500 text-sm">
              No active sessions found. 
              <button onClick={loadData} className="ml-2 underline">Retry</button>
              <p className="text-xs text-gray-500 mt-1">
                Looking in ~/.clawdbot/agents/ for sessions active in last hour
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map(session => (
                <div 
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-[var(--dark-900)] rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-mono truncate">{session.id.slice(0, 20)}...</p>
                    <p className="text-xs text-gray-500">
                      Last active: {new Date(session.modified).toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleTrust(session.id, session.trusted)}
                    className={`ml-3 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                      session.trusted
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                    }`}
                  >
                    {session.trusted ? (
                      <><ShieldCheck className="w-3 h-3" /> Trusted</>
                    ) : (
                      <><Shield className="w-3 h-3" /> Trust</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* How it works */}
        <section className="bg-[var(--dark-900)] rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-2">How Trust Works</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li><span className="text-green-400">TRUSTED:</span> Session you've marked as trusted</li>
            <li><span className="text-blue-400">VERIFIED:</span> User explicitly requested the action</li>
            <li><span className="text-violet-400">UNVERIFIED:</span> Action without clear user request</li>
          </ul>
          <p className="text-xs text-gray-500 mt-3">
            Trusting a session helps the dashboard understand which actions were intentional vs. potentially suspicious.
          </p>
        </section>
      </div>
    </>
  )
}
