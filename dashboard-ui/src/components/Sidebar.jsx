import { LayoutDashboard, Bell, Globe, Folder, Settings } from 'lucide-react'

const navItems = [
  { id: 'all', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'alerts', icon: Bell, label: 'Alerts' },
  { id: 'network', icon: Globe, label: 'Network' },
  { id: 'files', icon: Folder, label: 'Files' },
]

// Minecraft-style crab shield logo
function CrabShieldLogo() {
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7" shapeRendering="crispEdges">
      {/* Shield base */}
      <rect x="4" y="2" width="24" height="2" fill="#7c3aed"/>
      <rect x="2" y="4" width="28" height="2" fill="#8b5cf6"/>
      <rect x="2" y="6" width="28" height="4" fill="#a78bfa"/>
      <rect x="2" y="10" width="28" height="2" fill="#8b5cf6"/>
      <rect x="4" y="12" width="24" height="2" fill="#7c3aed"/>
      <rect x="4" y="14" width="24" height="2" fill="#6d28d9"/>
      <rect x="6" y="16" width="20" height="2" fill="#6d28d9"/>
      <rect x="6" y="18" width="20" height="2" fill="#5b21b6"/>
      <rect x="8" y="20" width="16" height="2" fill="#5b21b6"/>
      <rect x="10" y="22" width="12" height="2" fill="#4c1d95"/>
      <rect x="12" y="24" width="8" height="2" fill="#4c1d95"/>
      <rect x="14" y="26" width="4" height="2" fill="#3b0764"/>
      
      {/* Crab body */}
      <rect x="12" y="8" width="8" height="4" fill="#fb923c"/>
      <rect x="10" y="10" width="12" height="4" fill="#f97316"/>
      
      {/* Crab eyes */}
      <rect x="12" y="9" width="2" height="2" fill="#1f2937"/>
      <rect x="18" y="9" width="2" height="2" fill="#1f2937"/>
      <rect x="13" y="9" width="1" height="1" fill="#ffffff"/>
      <rect x="19" y="9" width="1" height="1" fill="#ffffff"/>
      
      {/* Crab claws */}
      <rect x="6" y="10" width="4" height="2" fill="#fb923c"/>
      <rect x="22" y="10" width="4" height="2" fill="#fb923c"/>
      <rect x="6" y="8" width="2" height="2" fill="#fdba74"/>
      <rect x="24" y="8" width="2" height="2" fill="#fdba74"/>
      
      {/* Crab legs */}
      <rect x="8" y="14" width="2" height="2" fill="#ea580c"/>
      <rect x="22" y="14" width="2" height="2" fill="#ea580c"/>
      <rect x="10" y="16" width="2" height="2" fill="#ea580c"/>
      <rect x="20" y="16" width="2" height="2" fill="#ea580c"/>
    </svg>
  )
}

export default function Sidebar({ activeView, onViewChange, onOpenSettings }) {
  return (
    <aside className="fixed left-0 top-0 h-full w-16 bg-[var(--dark-800)] border-r border-white/5 flex flex-col items-center py-4 z-50">
      {/* Logo */}
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-violet-800 flex items-center justify-center mb-8 shadow-lg shadow-purple-500/20">
        <CrabShieldLogo />
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
