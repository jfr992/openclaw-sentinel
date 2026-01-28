import { useState, useEffect } from 'react'
import { X, Trash2, Shield, Database, Clock } from 'lucide-react'

export default function SettingsModal({ isOpen, onClose }) {
  const [settings, setSettings] = useState({
    retentionDays: 30,
    autoPurge: false,
    alertThreshold: 'all', // all, high, critical
  })
  const [stats, setStats] = useState(null)
  const [purging, setPurging] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // Load current settings and stats
      loadSettings()
      loadStats()
    }
  }, [isOpen])

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/storage-stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
  }

  async function saveSettings() {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save settings:', e)
    }
  }

  async function purgeNow() {
    if (!confirm('This will delete old session logs. Continue?')) return
    setPurging(true)
    try {
      await fetch('/api/purge', { method: 'POST' })
      await loadStats()
    } catch (e) {
      console.error('Purge failed:', e)
    }
    setPurging(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-[var(--dark-800)] rounded-xl border border-white/10 p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Settings</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Storage Stats */}
          <div className="bg-[var(--dark-900)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-cyan-400" />
              <h4 className="text-sm font-medium text-white">Storage</h4>
            </div>
            {stats ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Session Files</p>
                  <p className="text-white font-medium">{stats.sessionCount ?? '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Size</p>
                  <p className="text-white font-medium">{stats.totalSize ?? '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Oldest Log</p>
                  <p className="text-white font-medium">{stats.oldestLog ?? '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Alerts Stored</p>
                  <p className="text-white font-medium">{stats.alertCount ?? '-'}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Loading...</p>
            )}
          </div>

          {/* Data Retention */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-purple-400" />
              <h4 className="text-sm font-medium text-white">Data Retention</h4>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Keep logs for</label>
                <select
                  value={settings.retentionDays}
                  onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
                  className="w-full bg-[var(--dark-900)] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                  <option value={0}>Forever</option>
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoPurge}
                  onChange={(e) => setSettings({ ...settings, autoPurge: e.target.checked })}
                  className="w-4 h-4 rounded border-white/20 bg-[var(--dark-900)]"
                />
                <span className="text-sm text-gray-300">Auto-purge old logs daily</span>
              </label>
            </div>
          </div>

          {/* Alert Threshold */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-yellow-400" />
              <h4 className="text-sm font-medium text-white">Alert Threshold</h4>
            </div>
            
            <select
              value={settings.alertThreshold}
              onChange={(e) => setSettings({ ...settings, alertThreshold: e.target.value })}
              className="w-full bg-[var(--dark-900)] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="all">Show all alerts</option>
              <option value="medium">Medium and above</option>
              <option value="high">High and critical only</option>
              <option value="critical">Critical only</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-white/5">
            <button
              onClick={purgeNow}
              disabled={purging}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-sm disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {purging ? 'Purging...' : 'Purge Now'}
            </button>
            
            <button
              onClick={saveSettings}
              className="flex-1 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm"
            >
              {saved ? '✓ Saved' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
