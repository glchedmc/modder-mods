// Keyboard modifier label: ⌘ on macOS (and in the browser preview), Ctrl elsewhere.
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const electron = typeof window !== 'undefined' && Boolean(window.glass);
export const IS_MAC = !electron || ua.includes('Mac');
export const MOD = IS_MAC ? '⌘' : 'Ctrl+';
export const SHIFT_MOD = IS_MAC ? '⇧⌘' : 'Ctrl+Shift+';
