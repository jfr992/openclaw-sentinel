import { Shield, LayoutDashboard, Bell, Globe, Folder, Settings } from 'lucide-react'

const navItems = [
  { id: 'all', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'alerts', icon: Bell, label: 'Alerts' },
  { id: 'network', icon: Globe, label: 'Network' },
  { id: 'files', icon: Folder, label: 'Files' },
]

export default function Sidebar({ activeView, onViewChange, onOpenSettings }) {
  return (
    <aside className="fixed left-0 top-0 h-full w-16 bg-[var(--dark-800)] border-r border-white/5 flex flex-col items-center py-4 z-50">
      {/* Logo */}
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mb-8">
        <Shield className="w-6 h-6 text-white" />
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-2">
        {navItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
              activeView === id
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
            title={label}
          >
            <Icon className="w-5 h-5" />
          </button>
        ))}
      </nav>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="w-10 h-10 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 flex items-center justify-center transition-colors"
        title="Settings"
      >
        <Settings className="w-5 h-5" />
      </button>
    </aside>
  )
}
