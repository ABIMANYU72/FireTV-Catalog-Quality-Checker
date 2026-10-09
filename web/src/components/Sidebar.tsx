'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  Sliders,
  FileBarChart2,
  BookOpen,
  Activity,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/review', label: 'Review Queue', icon: ClipboardList },
  { href: '/threshold', label: 'Threshold Lab', icon: Sliders },
  { href: '/report', label: 'Daily Report', icon: FileBarChart2 },
  { href: '/sop', label: 'SOP', icon: BookOpen },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-60 flex flex-col z-40"
      style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))' }}>
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Catalog QC
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              FireTV Quality Checker
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                isActive ? 'nav-item-active' : 'nav-item'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </aside>
  );
}
