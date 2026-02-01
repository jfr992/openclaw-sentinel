import { X, Lock, Server, Cloud, HardDrive, ArrowRight } from 'lucide-react'

export default function PrivacyModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-shell-900 rounded-xl border border-shell-700 p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
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
              <p className="text-sm text-white font-medium">Channels</p>
              <p className="text-xs text-gray-500">Telegram, Signal, etc.</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-600" />
            <div className="flex-1">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-2">
                <HardDrive className="w-6 h-6 text-purple-400" />
              </div>
              <p className="text-sm text-white font-medium">OpenClaw Sentinel</p>
              <p className="text-xs text-gray-500">Local monitoring</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-600" />
            <div className="flex-1">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-2">
                <Cloud className="w-6 h-6 text-purple-400" />
              </div>
              <p className="text-sm text-white font-medium">AI Provider</p>
              <p className="text-xs text-gray-500">Claude, GPT, etc.</p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div className="bg-[var(--dark-900)] rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-2">📱 Channels</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Telegram, Signal, Discord, Slack, WhatsApp, etc.</li>
              <li>• Each channel has its own encryption/privacy model</li>
              <li>• Messages flow through your agent to the AI</li>
            </ul>
          </div>

          <div className="bg-[var(--dark-900)] rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-2">🦞 OpenClaw Sentinel (This Dashboard)</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Monitors agent activity locally</li>
              <li>• Session logs: <code className="text-cyan-400">~/.openclaw/agents/*/sessions/</code></li>
              <li>• Behavioral baseline: <code className="text-cyan-400">~/.openclaw/security/baseline.json</code></li>
              <li>• All data stays on your machine</li>
              <li>• Baseline learns for 24h, then detects anomalies</li>
            </ul>
          </div>

          <div className="bg-[var(--dark-900)] rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-2">🤖 AI Providers</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• <strong>Anthropic (Claude):</strong> API data not used for training</li>
              <li>• <strong>OpenAI (GPT):</strong> API data not used for training (by default)</li>
              <li>• Check your provider's privacy policy</li>
              <li>• OpenClaw Sentinel monitors all AI interactions equally</li>
            </ul>
          </div>

          <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-violet-400 mb-2">⚠️ Recommendations</h4>
            <ul className="text-sm text-violet-200/80 space-y-1">
              <li>• Don't send passwords or API keys via chat</li>
              <li>• Review alerts for suspicious patterns</li>
              <li>• Regularly check the baseline for anomalies</li>
              <li>• Use the Network view to spot unknown connections</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
