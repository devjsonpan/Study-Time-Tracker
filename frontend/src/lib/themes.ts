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
  '/home':     { bg: '#FFECEC', border: '#FECACA', accent: '#B91C1C', activeBg: '#FFD5D5' },
  '/homework': { bg: '#FFF2E5', border: '#FED7AA', accent: '#C2410C', activeBg: '#FFE4C0' },
  '/events':   { bg: '#FFFCE5', border: '#FEF08A', accent: '#854D0E', activeBg: '#FFF7B0' },
  '/study':    { bg: '#E8FFEE', border: '#BBF7D0', accent: '#15803D', activeBg: '#C0F5D0' },
  '/overview': { bg: '#E5F3FF', border: '#BFDBFE', accent: '#1D4ED8', activeBg: '#BDD9FF' },
  '/import':   { bg: '#E5FDFF', border: '#A5F3FC', accent: '#0E7490', activeBg: '#B0F5FA' },
  '/profile':  { bg: '#F5E8FF', border: '#E9D5FF', accent: '#7E22CE', activeBg: '#E8C8FF' },
  '/chat':     { bg: '#EEEAFF', border: '#C7D2FE', accent: '#4338CA', activeBg: '#D5CFFF' },
}

const FALLBACK: PageTheme = THEMES['/home']

export function getTheme(pathname: string): PageTheme {
  return THEMES[pathname] ?? FALLBACK
}
