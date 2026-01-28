import { X, Lock, Server, Cloud, HardDrive, ArrowRight } from 'lucide-react'

export default function PrivacyModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-[var(--dark-800)] rounded-xl border border-white/10 p-6 max-w-2xl w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-white">Data Privacy & Flow</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Data Flow Diagram */}
        <div className="bg-[var(--dark-900)] rounded-lg p-6 mb-6">
          <h4 className="text-sm font-medium text-gray-400 mb-4">Message Flow</h4>
          <div className="flex items-center justify-between text-center">
            <div className="flex-1">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-2">
                <Server className="w-6 h-6 text-blue-400" />
              </div>
              <p className="text-sm text-white font-medium">Telegram</p>
              <p className="text-xs text-gray-500">Encrypted transit</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-600" />
            <div className="flex-1">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-2">
                <HardDrive className="w-6 h-6 text-purple-400" />
              </div>
              <p className="text-sm text-white font-medium">Clawdbot</p>
              <p className="text-xs text-gray-500">Local storage</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-600" />
            <div className="flex-1">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-2">
                <Cloud className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-sm text-white font-medium">Claude API</p>
              <p className="text-xs text-gray-500">Not trained on</p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div className="bg-[var(--dark-900)] rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-2">📱 Telegram</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Messages encrypted in transit (MTProto)</li>
              <li>• Stored on Telegram servers (not E2E by default)</li>
              <li>• Use Secret Chats for E2E encryption</li>
            </ul>
          </div>

          <div className="bg-[var(--dark-900)] rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-2">🦀 MoltBot (Local)</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Session logs: <code className="text-cyan-400">~/.clawdbot/agents/*/sessions/</code></li>
              <li>• Alerts: <code className="text-cyan-400">~/clawd/security/logs/</code></li>
              <li>• All data stays on your machine</li>
              <li>• Configure retention in Settings</li>
            </ul>
          </div>

          <div className="bg-[var(--dark-900)] rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-2">🤖 Claude API (Anthropic)</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• API data is NOT used for training</li>
              <li>• 30-day retention for trust & safety</li>
              <li>• Can request deletion via support</li>
              <li>• See: <a href="https://anthropic.com/privacy" target="_blank" className="text-purple-400 hover:underline">anthropic.com/privacy</a></li>
            </ul>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-yellow-400 mb-2">⚠️ Recommendations</h4>
            <ul className="text-sm text-yellow-200/80 space-y-1">
              <li>• Don't send passwords or API keys via chat</li>
              <li>• Use Signal for more sensitive conversations</li>
              <li>• Regularly purge old session logs</li>
              <li>• Review alerts for data exfiltration patterns</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
