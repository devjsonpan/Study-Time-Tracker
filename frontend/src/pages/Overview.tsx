// Overview page — combines the Calendar and Stats (summary) views in one place.
// Two tabs: Calendar (monthly grid) | Stats (charts, heatmap, leaderboard).

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, ArcElement, PointElement, LineElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Bar, Pie, Line } from 'react-chartjs-2'
import { getCalendarEvents } from '../api/calendar'
import type { CalendarEventItem } from '../api/calendar'
import { getSummary } from '../api/summary'
import type { SummaryData } from '../api/summary'
import { getTheme } from '../lib/themes'
import type { PageTheme } from '../lib/themes'

// Register Chart.js components once
ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, ArcElement, PointElement, LineElement,
  Title, Tooltip, Legend,
)

type OverviewTab = 'calendar' | 'stats'
type CalendarView = 'month' | 'week' | 'day'

// --- Calendar helpers ---

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// Returns the 7 days (Mon–Sun) of the week containing anchor
function getWeekDays(anchor: Date): Date[] {
  const offset = (anchor.getDay() + 6) % 7 // Mon=0, Sun=6
  const monday = addDays(anchor, -offset)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

function formatWeekLabel(anchor: Date): string {
  const days = getWeekDays(anchor)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(days[0])} – ${fmt(days[6])}, ${days[6].getFullYear()}`
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// Short label for weekly column headers: "Mon 11"
function formatWeekDayHeader(date: Date): { dow: string; num: number } {
  return {
    dow: date.toLocaleDateString('en-US', { weekday: 'short' }),
    num: date.getDate(),
  }
}


const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_HEADERS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function dateKey(iso: string) { return iso.slice(0, 10) }

function toKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isToday(date: Date) { return toKey(date) === toKey(new Date()) }

function buildMonthGrid(year: number, month: number) {
  const firstDow    = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev  = new Date(year, month, 0).getDate()
  const cells: { date: Date; current: boolean }[] = []

  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), current: false })
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: new Date(year, month, d), current: true })
  const rem = (7 - (cells.length % 7)) % 7
  for (let d = 1; d <= rem; d++)
    cells.push({ date: new Date(year, month + 1, d), current: false })

  return cells
}

type SpanType = 'single' | 'start' | 'middle' | 'end'
type EventInCell = { event: CalendarEventItem; span: SpanType }

// Returns a map of { "YYYY-MM-DD": EventInCell[] } where multi-day events span every day they cover.
function buildDayMap(events: CalendarEventItem[]): Record<string, EventInCell[]> {
  const map: Record<string, EventInCell[]> = {}

  function add(key: string, entry: EventInCell) {
    if (!map[key]) map[key] = []
    map[key].push(entry)
  }

  for (const e of events) {
    const startKey = dateKey(e.start)
    const endKey   = e.end ? dateKey(e.end) : startKey

    if (startKey === endKey || !e.end) {
      add(startKey, { event: e, span: 'single' })
    } else {
      const cur  = new Date(startKey + 'T00:00:00')
      const last = new Date(endKey + 'T00:00:00')
      while (cur <= last) {
        const key    = toKey(cur)
        const isStart = key === startKey
        const isEnd   = key === endKey
        add(key, { event: e, span: isStart ? 'start' : isEnd ? 'end' : 'middle' })
        cur.setDate(cur.getDate() + 1)
      }
    }
  }

  return map
}

// Single-day events: pill with title. Multi-day: a full-width bar using -mx-1.5 to bridge cells.
function EventBadge({ entry, onClick }: { entry: EventInCell; onClick: () => void }) {
  const { event, span } = entry
  const bg = { backgroundColor: event.backgroundColor, color: event.textColor }

  if (span === 'single') {
    return (
      <button onClick={e => { e.stopPropagation(); onClick() }} title={event.title}
        style={bg}
        className="w-full text-left truncate text-[10px] font-semibold px-1 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity">
        {event.title}
      </button>
    )
  }

  const rounding = span === 'start' ? 'rounded-l-sm' : span === 'end' ? 'rounded-r-sm' : 'rounded-none'
  return (
    <div onClick={e => { e.stopPropagation(); onClick() }}
      style={bg}
      className={`-mx-1.5 py-0.5 cursor-pointer hover:opacity-80 transition-opacity ${rounding}`}>
      {span === 'start'
        ? <span className="text-[10px] font-semibold px-2 block truncate">{event.title}</span>
        : <span className="text-[10px] font-semibold px-2 block truncate opacity-0">{event.title}</span>
      }
    </div>
  )
}

function DetailPopup({ item, onClose, theme }: {
  item: CalendarEventItem
  onClose: () => void
  theme: PageTheme
}) {
  const isMultiDay = item.end && dateKey(item.start) !== dateKey(item.end)
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full"
        style={{ border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="font-bold text-slate-800 leading-snug">{item.title}</p>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ backgroundColor: item.backgroundColor, color: item.textColor }}>
            {item.extendedProps.type}
          </span>
        </div>
        {isMultiDay && (
          <p className="text-xs text-slate-400 font-medium mb-1">
            {dateKey(item.start)} → {item.end ? dateKey(item.end) : ''}
          </p>
        )}
        {item.extendedProps.deadline && (
          <p className="text-xs text-slate-400 font-medium mb-1">Due: {item.extendedProps.deadline}</p>
        )}
        {item.extendedProps.location && (
          <p className="text-xs text-slate-400 font-medium mb-1">Location: {item.extendedProps.location}</p>
        )}
        {item.extendedProps.description && (
          <p className="text-sm text-slate-500 mt-2 break-all">{item.extendedProps.description}</p>
        )}
        <button onClick={onClose}
          className="btn-secondary mt-4 w-full py-2 font-bold rounded-xl text-sm cursor-pointer"
          style={{ background: theme.activeBg, color: theme.accent }}>
          Close
        </button>
      </div>
    </div>
  )
}

// --- Calendar panel ---

function CalendarPanel({ theme }: { theme: PageTheme }) {
  const today = new Date()
  const [viewMode, setViewMode] = useState<CalendarView>('month')
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [viewDay, setViewDay] = useState(today) // anchor for week + day views
  const [selected, setSelected] = useState<CalendarEventItem | null>(null)

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendar'],
    queryFn: getCalendarEvents,
  })

  const dayMap = buildDayMap(events)

  // Unified prev/next navigation — behaviour differs per view
  function goPrev() {
    if (viewMode === 'month') {
      if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1)
    } else if (viewMode === 'week') {
      setViewDay(d => addDays(d, -7))
    } else {
      setViewDay(d => addDays(d, -1))
    }
  }

  function goNext() {
    if (viewMode === 'month') {
      if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1)
    } else if (viewMode === 'week') {
      setViewDay(d => addDays(d, 7))
    } else {
      setViewDay(d => addDays(d, 1))
    }
  }

  function goToday() {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setViewDay(now)
  }

  // Label shown between prev/next arrows
  const navLabel = viewMode === 'month'
    ? `${MONTHS[month]} ${year}`
    : viewMode === 'week'
    ? formatWeekLabel(viewDay)
    : formatDayLabel(viewDay)

  // Shared legend
  const legend = (
    <div className="flex flex-wrap gap-3 mb-4 text-xs font-semibold text-slate-400">
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] inline-block" />Upcoming task</span>
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#e53e3e] inline-block" />Overdue task</span>
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#48bb78] inline-block" />Completed</span>
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#667eea] inline-block" />Event</span>
    </div>
  )

  const navBtn = (label: string, onClick: () => void) => (
    <button onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-xl font-bold transition cursor-pointer"
      style={{ border: `1px solid ${theme.border}`, color: theme.accent }}>
      {label}
    </button>
  )

  // Day number circle — highlighted for today
  const DayNum = ({ date }: { date: Date }) => (
    <p className="text-xs font-bold mb-1 w-5 h-5 flex items-center justify-center rounded-full"
      style={isToday(date)
        ? { background: theme.accent, color: '#FFFFFF' }
        : { color: theme.accent, opacity: 0.6 }
      }>
      {date.getDate()}
    </p>
  )

  return (
    <div>
      {/* View mode toggle */}
      <div className="flex gap-1 p-1 rounded-2xl mb-4" style={{ background: theme.activeBg }}>
        {(['month', 'week', 'day'] as CalendarView[]).map(v => (
          <button key={v} onClick={() => setViewMode(v)}
            className="flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer capitalize"
            style={viewMode === v
              ? { background: '#FFFFFF', color: theme.accent, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: theme.accent, opacity: 0.5 }
            }>
            {v}
          </button>
        ))}
      </div>

      {/* Navigation row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {navBtn('<', goPrev)}
          {navBtn('>', goNext)}
        </div>
        <span className="text-sm font-bold text-slate-800 text-center flex-1 px-2">{navLabel}</span>
        <button onClick={goToday}
          className="text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-all"
          style={{ background: theme.activeBg, color: theme.accent }}>
          Today
        </button>
      </div>

      {legend}

      {isLoading ? (
        <p className="text-center font-semibold py-16 animate-pulse" style={{ color: theme.accent }}>Loading…</p>
      ) : (
        <>
          {/* ── Month view ── */}
          {viewMode === 'month' && (() => {
            const cells = buildMonthGrid(year, month)
            return (
              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${theme.border}` }}>
                <div className="grid grid-cols-7" style={{ borderBottom: `1px solid ${theme.border}`, background: '#FFFFFF' }}>
                  {DAY_HEADERS.map(d => (
                    <div key={d} className="py-2 text-center text-xs font-bold uppercase tracking-wider"
                      style={{ color: theme.accent, opacity: 0.6 }}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 bg-white">
                  {cells.map((cell, i) => {
                    const key   = toKey(cell.date)
                    const items = dayMap[key] ?? []
                    return (
                      <div key={i}
                        className={`min-h-[90px] p-1.5 border-b border-r overflow-hidden ${!cell.current ? 'opacity-30' : ''}`}
                        style={{ borderColor: theme.activeBg }}>
                        <DayNum date={cell.date} />
                        <div className="space-y-0.5">
                          {items.slice(0, 3).map((entry, j) => (
                            <EventBadge key={`${entry.event.id}-${j}`} entry={entry} onClick={() => setSelected(entry.event)} />
                          ))}
                          {items.length > 3 && (
                            <p className="text-[9px] font-semibold px-1" style={{ color: theme.accent, opacity: 0.5 }}>
                              +{items.length - 3} more
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* ── Week view ── */}
          {viewMode === 'week' && (() => {
            const weekDays = getWeekDays(viewDay)
            return (
              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${theme.border}` }}>
                {/* Day headers with date number */}
                <div className="grid grid-cols-7 bg-white" style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {weekDays.map((d, i) => {
                    const { dow, num } = formatWeekDayHeader(d)
                    return (
                      <div key={i} className="py-3 text-center" style={{ borderRight: i < 6 ? `1px solid ${theme.activeBg}` : undefined }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.accent, opacity: 0.6 }}>{dow}</p>
                        <p className="text-lg font-extrabold mt-0.5 w-8 h-8 flex items-center justify-center rounded-full mx-auto"
                          style={isToday(d)
                            ? { background: theme.accent, color: '#FFFFFF' }
                            : { color: theme.accent }
                          }>
                          {num}
                        </p>
                      </div>
                    )
                  })}
                </div>
                {/* Week cells — bigger than month */}
                <div className="grid grid-cols-7 bg-white">
                  {weekDays.map((d, i) => {
                    const key   = toKey(d)
                    const items = dayMap[key] ?? []
                    return (
                      <div key={i}
                        className="min-h-[140px] p-2"
                        style={{ borderRight: i < 6 ? `1px solid ${theme.activeBg}` : undefined }}>
                        <div className="space-y-1">
                          {items.map((entry, j) => (
                            <EventBadge key={`${entry.event.id}-${j}`} entry={entry} onClick={() => setSelected(entry.event)} />
                          ))}
                          {items.length === 0 && (
                            <p className="text-[10px] text-slate-300 font-medium px-1 pt-1">—</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* ── Day view ── */}
          {viewMode === 'day' && (() => {
            const key   = toKey(viewDay)
            const items = dayMap[key] ?? []
            return (
              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${theme.border}` }}>
                {items.length === 0 ? (
                  <div className="bg-white px-6 py-16 text-center">
                    <p className="font-bold text-slate-400">Nothing scheduled for this day.</p>
                  </div>
                ) : (
                  <ul className="bg-white divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
                    {items.map((entry, j) => {
                      const e = entry.event
                      const startTime = new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      const endTime   = e.end ? new Date(e.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
                      return (
                        <li key={`${e.id}-${j}`}
                          className="px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => setSelected(e)}>
                          {/* Color dot matching event type */}
                          <div className="w-3 h-3 rounded-full shrink-0 mt-1.5"
                            style={{ background: e.backgroundColor }} />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 leading-snug">{e.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5 font-medium">
                              {startTime}{endTime ? ` → ${endTime}` : ''}
                            </p>
                            {e.extendedProps.location && (
                              <p className="text-xs text-slate-400 mt-0.5">{e.extendedProps.location}</p>
                            )}
                            {e.extendedProps.description && (
                              <p className="text-sm text-slate-500 mt-1 break-words">{e.extendedProps.description}</p>
                            )}
                          </div>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: e.backgroundColor, color: e.textColor }}>
                            {e.extendedProps.type}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })()}
        </>
      )}

      {selected && <DetailPopup item={selected} onClose={() => setSelected(null)} theme={theme} />}
    </div>
  )
}

// --- Stats panel (summary) ---

function heatStyle(hours: number, accent: string): React.CSSProperties {
  if (hours === 0) return { background: '#F1F5F9' }
  const opacity = hours < 1 ? 0.25 : hours < 2 ? 0.45 : hours < 4 ? 0.65 : 0.9
  return { background: accent, opacity }
}

function buildWeeks(data: SummaryData['heatmap_data']) {
  if (data.length === 0) return []
  const firstDay = new Date(data[0].date + 'T00:00:00').getDay()
  const padStart = (firstDay + 6) % 7
  const padded: ({ date: string; hours: number } | null)[] = [
    ...Array(padStart).fill(null), ...data,
  ]
  const weeks: (typeof padded[number])[][] = []
  for (let i = 0; i < padded.length; i += 7) {
    const week = padded.slice(i, i + 7)
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

function Heatmap({ data, accent }: { data: SummaryData['heatmap_data']; accent: string }) {
  const weeks = buildWeeks(data)
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  // Find which column (week index) each month starts in, for labels above the grid
  const monthLabelCols: { wi: number; label: string }[] = []
  weeks.forEach((week, wi) => {
    for (const day of week) {
      if (day) {
        const d = new Date(day.date + 'T00:00:00')
        if (d.getDate() === 1) {
          monthLabelCols.push({ wi, label: d.toLocaleDateString('en-US', { month: 'short' }) })
          break
        }
      }
    }
  })

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* Month labels row */}
        <div className="flex gap-1 mb-1" style={{ paddingLeft: '20px' }}>
          {weeks.map((_, wi) => {
            const label = monthLabelCols.find(m => m.wi === wi)
            return (
              <div key={wi} className="w-3 flex-shrink-0 relative" style={{ height: '10px' }}>
                {label && (
                  <span className="absolute text-[9px] text-slate-400 font-medium whitespace-nowrap" style={{ left: 0 }}>
                    {label.label}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Grid */}
        <div className="flex gap-1">
          <div className="flex flex-col gap-1 mr-1">
            {DAY_LABELS.map((d, i) => (
              <span key={i} className="text-[9px] text-slate-400 h-3 w-4 flex items-center font-medium">{d}</span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day, di) => (
                <div key={di} title={day ? `${day.date}: ${day.hours}h` : ''}
                  className="w-3 h-3 rounded-sm"
                  style={day ? heatStyle(day.hours, accent) : { opacity: 0 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatSection({ title, children, theme }: {
  title: string; children: React.ReactNode; theme: PageTheme
}) {
  return (
    <div className="shadow-sm p-5 mb-5"
      style={{ background: '#FFFFFF', border: `1px solid ${theme.border}`, borderRadius: '16px' }}>
      <h2 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: theme.accent }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function StatsPanel({ theme }: { theme: PageTheme }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['summary'],
    queryFn: getSummary,
  })
  const [heatmapYear, setHeatmapYear] = useState<number | 'last365'>(new Date().getFullYear())

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF', border: `1px solid ${theme.border}`, borderRadius: '16px',
  }

  if (isLoading) return (
    <p className="text-center font-semibold py-8 animate-pulse" style={{ color: theme.accent }}>Loading…</p>
  )
  if (error) return (
    <p className="text-center text-rose-400 font-semibold py-8">Something went wrong. Try refreshing.</p>
  )

  const d = data!

  return (
    <div>
      {d.group_info && (
        <p className="text-sm text-slate-400 mb-4 font-medium">
          Group: <span className="font-bold text-slate-600">{d.group_info.name}</span>
          {' '}&mdash; code: <code className="font-mono">{d.group_info.join_code}</code>
        </p>
      )}

      {/* Today's stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="shadow-sm p-4 text-center" style={cardStyle}>
          <p className="text-3xl font-extrabold" style={{ color: theme.accent }}>{d.today_study_hours.toFixed(1)}h</p>
          <p className="text-xs font-semibold text-slate-400 mt-1">Studied today</p>
        </div>
        <div className="shadow-sm p-4 text-center" style={cardStyle}>
          <p className="text-3xl font-extrabold" style={{ color: theme.border }}>{d.today_break_hours.toFixed(1)}h</p>
          <p className="text-xs font-semibold text-slate-400 mt-1">Breaks today</p>
        </div>
      </div>

      <StatSection title="Study activity" theme={theme}>
        {/* Streak stats */}
        <div className="flex gap-6 mb-4">
          <div>
            <p className="text-2xl font-extrabold" style={{ color: theme.accent }}>{d.current_streak}</p>
            <p className="text-xs text-slate-400 font-semibold">Current streak (days)</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold" style={{ color: theme.accent }}>{d.longest_streak}</p>
            <p className="text-xs text-slate-400 font-semibold">Longest streak (days)</p>
          </div>
        </div>

        {/* Year filter — only shown when there's data */}
        {d.heatmap_data.length > 0 && (() => {
          const availableYears: number[] = []
          for (const item of d.heatmap_data) {
            const y = parseInt(item.date.slice(0, 4))
            if (!availableYears.includes(y)) availableYears.push(y)
          }
          availableYears.sort((a, b) => b - a)

          const filteredHeatmap = heatmapYear === 'last365'
            ? (() => {
                const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 364)
                const cutoffStr = cutoff.toISOString().slice(0, 10)
                return d.heatmap_data.filter(item => item.date >= cutoffStr)
              })()
            : d.heatmap_data.filter(item => item.date.startsWith(String(heatmapYear)))

          return (
            <>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {availableYears.map(y => (
                  <button key={y} onClick={() => setHeatmapYear(y)}
                    className="px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
                    style={heatmapYear === y
                      ? { background: theme.accent, color: '#FFFFFF' }
                      : { background: theme.activeBg, color: theme.accent }}>
                    {y}
                  </button>
                ))}
                <button onClick={() => setHeatmapYear('last365')}
                  className="px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
                  style={heatmapYear === 'last365'
                    ? { background: theme.accent, color: '#FFFFFF' }
                    : { background: theme.activeBg, color: theme.accent }}>
                  Last 365 days
                </button>
              </div>
              {filteredHeatmap.length === 0
                ? <p className="text-sm text-slate-400">No data for this period.</p>
                : <Heatmap data={filteredHeatmap} accent={theme.accent} />
              }
            </>
          )
        })()}
        {d.heatmap_data.length === 0 && <p className="text-sm text-slate-400">No data yet.</p>}
      </StatSection>

      {d.friend_names.length > 0 && (
        <StatSection title="This week's leaderboard" theme={theme}>
          {/* Horizontal bars so member names are legible regardless of group size.
              Height scales with member count; scrollable when group is large. */}
          <div style={{ overflowY: 'auto', maxHeight: 320 }}>
            <div style={{ height: Math.max(120, d.friend_names.length * 52) }}>
              <Bar
                data={{
                  labels: d.friend_names,
                  datasets: [
                    { label: 'Study hours', data: d.friend_study_hours, backgroundColor: theme.accent + 'CC' },
                    { label: 'Break hours', data: d.friend_break_hours, backgroundColor: theme.border + '88' },
                  ],
                }}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'top' } },
                  scales: { x: { beginAtZero: true } },
                }}
              />
            </div>
          </div>
        </StatSection>
      )}

      {d.daily_labels.length > 0 && (
        <StatSection title="Daily study & break history" theme={theme}>
          {/* Horizontal scroll so all history is accessible regardless of date range */}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: Math.max(500, d.daily_labels.length * 18), height: 240 }}>
              <Line
                data={{
                  labels: d.daily_labels,
                  datasets: [
                    { label: 'Study hours', data: d.daily_study_values, borderColor: theme.accent, backgroundColor: theme.activeBg + '40', tension: 0.3 },
                    { label: 'Break hours', data: d.daily_break_values, borderColor: theme.border, backgroundColor: theme.activeBg + '20', tension: 0.3 },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'top' } },
                  scales: { y: { beginAtZero: true } },
                }}
              />
            </div>
          </div>
        </StatSection>
      )}

      {d.course_labels.length > 0 && (
        <StatSection title="All-time by course" theme={theme}>
          <div className="flex justify-center">
            <div className="w-64 h-64">
              <Pie
                data={{
                  labels: d.course_labels,
                  datasets: [{
                    data: d.course_hours,
                    backgroundColor: d.course_labels.map((_, i) =>
                      `${theme.accent}${Math.round(255 * (0.9 - i * 0.1)).toString(16).padStart(2, '0')}`
                    ),
                  }],
                }}
                options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }}
              />
            </div>
          </div>
        </StatSection>
      )}

      {d.daily_labels.length === 0 && d.course_labels.length === 0 && (
        <p className="text-center text-slate-400 font-bold py-8">
          No data yet — complete a study session to see your stats.
        </p>
      )}
    </div>
  )
}

// --- Tab button ---

function TabBtn({ active, onClick, theme, children }: {
  active: boolean; onClick: () => void; theme: PageTheme; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className="flex-1 py-2 text-sm font-bold rounded-xl transition-all cursor-pointer"
      style={active
        ? { background: '#FFFFFF', color: theme.accent, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
        : { color: theme.accent, opacity: 0.5 }
      }>
      {children}
    </button>
  )
}

// --- Main Overview component ---

export default function Overview() {
  const [tab, setTab] = useState<OverviewTab>('calendar')
  const { pathname } = useLocation()
  const theme = getTheme(pathname)

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">

      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Overview</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-2xl mb-6" style={{ background: theme.activeBg }}>
        <TabBtn active={tab === 'calendar'} onClick={() => setTab('calendar')} theme={theme}>Calendar</TabBtn>
        <TabBtn active={tab === 'stats'}    onClick={() => setTab('stats')}    theme={theme}>Stats</TabBtn>
      </div>

      {tab === 'calendar' && <CalendarPanel theme={theme} />}
      {tab === 'stats'    && <StatsPanel theme={theme} />}
    </div>
  )
}
