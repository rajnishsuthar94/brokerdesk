export interface NavItem {
  readonly label: string;
  readonly path: string;
  /** SVG path data (24×24, stroke icons). */
  readonly icon: string;
  /** False until the feature's phase ships; rendered as "Soon" and not clickable. */
  readonly enabled: boolean;
  /** Shown in the mobile bottom bar (max 4; the rest live under "More"). */
  readonly mobilePrimary: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', enabled: true, mobilePrimary: true, icon: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10' },
  { label: 'Leads', path: '/leads', enabled: true, mobilePrimary: true, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-1a6 6 0 0112 0v1M19 8v6M22 11h-6' },
  { label: 'Properties', path: '/properties', enabled: true, mobilePrimary: true, icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4' },
  { label: 'Follow-ups', path: '/follow-ups', enabled: true, mobilePrimary: true, icon: 'M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Matching', path: '/matching', enabled: true, mobilePrimary: false, icon: 'M8 7h12M8 7l4-4M8 7l4 4M16 17H4M16 17l-4-4M16 17l-4 4' },
  { label: 'Site visits', path: '/site-visits', enabled: true, mobilePrimary: false, icon: 'M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z' },
  { label: 'Reports', path: '/reports', enabled: true, mobilePrimary: false, icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { label: 'Team', path: '/team', enabled: true, mobilePrimary: false, icon: 'M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M10 11a4 4 0 100-8 4 4 0 000 8zM21 20v-1a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8' },
  { label: 'Settings', path: '/settings', enabled: true, mobilePrimary: false, icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z' },
];
