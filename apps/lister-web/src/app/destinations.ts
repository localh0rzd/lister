import type { NavDestination } from '@lister/web/ui';

/** The four top-level destinations (design §2.7). */
export const DESTINATIONS: readonly NavDestination[] = [
  { path: '/lists', label: 'Lists', icon: 'checklist' },
  { path: '/runs', label: 'Runs', icon: 'playlist_add_check' },
  { path: '/space', label: 'Space', icon: 'group' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];
