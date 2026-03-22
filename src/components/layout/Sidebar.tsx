/**
 * Sidebar Component
 * Simplified navigation sidebar matching Qclaw Lite design.
 */
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  MessageCircle,
  Wifi,
  Monitor,
  Puzzle,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import logoSvg from '@/assets/logo.svg';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
}

function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors',
          'hover:bg-white/10 text-white/70',
          isActive && 'bg-white/10 text-white'
        )
      }
    >
      {({ isActive }) => (
        <>
          <div className={cn("flex shrink-0 items-center justify-center", isActive ? "text-white" : "text-white/60")}>
            {icon}
          </div>
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { t } = useTranslation('common');

  const navItems = [
    { to: '/dashboard', icon: <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.dashboard') },
    { to: '/', icon: <MessageCircle className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.chat') },
    { to: '/channels', icon: <Wifi className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.channels') },
    { to: '/models', icon: <Monitor className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.models') },
    { to: '/skills', icon: <Puzzle className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.skills') },
  ];

  return (
    <aside className="flex shrink-0 flex-col w-52 bg-[#1a1a1a]">
      {/* Logo Header */}
      <div className="flex items-center gap-2 px-4 py-4 h-14">
        <img src={logoSvg} alt="ClawX" className="h-5 w-auto shrink-0" />
        <span className="text-sm font-semibold text-white/90 truncate whitespace-nowrap">
          Qclaw Lite
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col px-2 gap-0.5 flex-1">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Footer - Settings */}
      <div className="p-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors',
              'hover:bg-white/10 text-white/70',
              isActive && 'bg-white/10 text-white'
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className={cn("flex shrink-0 items-center justify-center", isActive ? "text-white" : "text-white/60")}>
                <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{t('sidebar.settings')}</span>
            </>
          )}
        </NavLink>
      </div>
    </aside>
  );
}
