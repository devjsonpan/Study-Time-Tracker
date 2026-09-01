// Per-page pastel color themes — assigned in rainbow order matching the palette image.
// 7 routes: Home → Homework → Events → Study → Overview → Import → Profile
//
// Rainbow palette: #F2A2A2 | #F8C68D | #FFF6A1 | #CBFAAC | #A6F0F5 | #96B9FF | #A7A1FF | #F6C7FF

export type PageTheme = {
  bg: string        // very light page background wash
  border: string    // card borders, input borders, sidebar borders — the palette color itself
  accent: string    // dark text for labels, brand, active nav — passes 4.5:1 contrast on white
  activeBg: string  // active sidebar nav item and badge backgrounds
}

const THEMES: Record<string, PageTheme> = {
  '/home':     { bg: '#FFF0F0', border: '#F2A2A2', accent: '#9B1C1C', activeBg: '#FDD8D8' },
  '/homework': { bg: '#FFF7F0', border: '#F8C68D', accent: '#9A3412', activeBg: '#FDE9C8' },
  '/events':   { bg: '#FFFEF0', border: '#FFF6A1', accent: '#854D0E', activeBg: '#FFFBD0' },
  '/study':    { bg: '#F0FFF4', border: '#CBFAAC', accent: '#15803D', activeBg: '#DFFFCE' },
  '/overview': { bg: '#EEF4FF', border: '#96B9FF', accent: '#1E40AF', activeBg: '#DBE8FF' },
  '/import':   { bg: '#F0FEFE', border: '#A6F0F5', accent: '#0E7490', activeBg: '#D9FAFC' },
  '/profile':  { bg: '#FDF5FF', border: '#F6C7FF', accent: '#7E22CE', activeBg: '#F9EEFF' },
  '/chat':     { bg: '#F3F0FF', border: '#A7A1FF', accent: '#4C1D95', activeBg: '#E4E0FF' },
}

const FALLBACK: PageTheme = THEMES['/home']

export function getTheme(pathname: string): PageTheme {
  return THEMES[pathname] ?? FALLBACK
}
