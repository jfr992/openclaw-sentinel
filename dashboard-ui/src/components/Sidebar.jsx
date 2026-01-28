import { LayoutDashboard, Bell, Globe, Folder, Settings, Shield, Lock } from 'lucide-react'

const navItems = [
  { id: 'all', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'alerts', icon: Bell, label: 'Alerts' },
  { id: 'network', icon: Globe, label: 'Network' },
  { id: 'files', icon: Folder, label: 'Files' },
]

// Pixel art crab shield logo
function CrabShieldLogo({ alert }) {
  return (
    <svg viewBox="0 0 32 32" className="w-8 h-8" shapeRendering="crispEdges">
      {/* Shield outline */}
      <rect x="4" y="2" width="24" height="2" fill={alert ? "#dc2626" : "#dc2626"}/>
      <rect x="2" y="4" width="28" height="2" fill={alert ? "#ef4444" : "#ef4444"}/>
      <rect x="2" y="6" width="28" height="4" fill={alert ? "#f87171" : "#f87171"}/>
      <rect x="2" y="10" width="28" height="2" fill={alert ? "#ef4444" : "#ef4444"}/>
      <rect x="4" y="12" width="24" height="2" fill={alert ? "#dc2626" : "#dc2626"}/>
      <rect x="4" y="14" width="24" height="2" fill={alert ? "#b91c1c" : "#b91c1c"}/>
      <rect x="6" y="16" width="20" height="2" fill={alert ? "#b91c1c" : "#b91c1c"}/>
      <rect x="6" y="18" width="20" height="2" fill={alert ? "#991b1b" : "#991b1b"}/>
      <rect x="8" y="20" width="16" height="2" fill={alert ? "#991b1b" : "#991b1b"}/>
      <rect x="10" y="22" width="12" height="2" fill={alert ? "#7f1d1d" : "#7f1d1d"}/>
      <rect x="12" y="24" width="8" height="2" fill={alert ? "#7f1d1d" : "#7f1d1d"}/>
      <rect x="14" y="26" width="4" height="2" fill={alert ? "#450a0a" : "#450a0a"}/>

      {/* Crab body */}
      <rect x="12" y="8" width="8" height="4" fill="#0d0d12"/>
      <rect x="10" y="10" width="12" height="4" fill="#0d0d12"/>

      {/* Crab eyes - glowing */}
      <rect x="12" y="9" width="2" height="2" fill="#00ffff"/>
      <rect x="18" y="9" width="2" height="2" fill="#00ffff"/>
      <rect x="13" y="9" width="1" height="1" fill="#ffffff"/>
      <rect x="19" y="9" width="1" height="1" fill="#ffffff"/>

      {/* Crab claws */}
      <rect x="6" y="10" width="4" height="2" fill="#1f1f2b"/>
      <rect x="22" y="10" width="4" height="2" fill="#1f1f2b"/>
      <rect x="6" y="8" width="2" height="2" fill="#2a2a3a"/>
      <rect x="24" y="8" width="2" height="2" fill="#2a2a3a"/>

      {/* Crab legs */}
      <rect x="8" y="14" width="2" height="2" fill="#1f1f2b"/>
      <rect x="22" y="14" width="2" height="2" fill="#1f1f2b"/>
      <rect x="10" y="16" width="2" height="2" fill="#1f1f2b"/>
      <rect x="20" y="16" width="2" height="2" fill="#1f1f2b"/>
    </svg>
  )
}

export default function Sidebar({ activeView, onViewChange, onOpenSettings, onOpenPrivacy }) {
  return (
    <aside className="fixed left-0 top-0 h-full w-16 bg-shell-900 border-r border-shell-700 flex flex-col items-center py-4 z-50">
      {/* Logo */}
      <div
        className="w-12 h-12 rounded-xl bg-gradient-to-br from-threat-600 to-threat-800 flex items-center justify-center mb-8 glow-red cursor-pointer hover:scale-105 transition-transform"
        title="MoltBot Guardian"
      >
        <CrabShieldLogo />
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1 w-full px-2">
        {/* eslint-disable-next-line no-unused-vars */}
        {navItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`sidebar-item w-full h-11 rounded-lg flex items-center justify-center ${
              activeView === id ? 'active' : ''
            }`}
            title={label}
          >
            <Icon className={`w-5 h-5 ${
              activeView === id ? 'text-threat-400' : 'text-shell-500'
            }`} />
          </button>
        ))}
      </nav>

      {/* Divider */}
      <div className="w-8 h-px bg-shell-700 my-4" />

      {/* Local Only Indicator */}
      <button
        onClick={onOpenPrivacy}
        className="w-11 h-11 rounded-lg text-neon-cyan hover:bg-shell-800 flex items-center justify-center transition-all mb-2"
        title="Local Only - Click for data flow info"
      >
        <Lock className="w-5 h-5" />
      </button>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="w-11 h-11 rounded-lg text-shell-500 hover:text-gray-300 hover:bg-shell-800 flex items-center justify-center transition-all"
        title="Settings"
      >
        <Settings className="w-5 h-5" />
      </button>
    </aside>
  )
}
