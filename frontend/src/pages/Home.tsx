// Home / dashboard — quick-look at today's stats, upcoming homework, and upcoming events.
// Page theme: salmon (#FFF0F0 bg, #F2A2A2 borders, #9B1C1C accent).

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { getMe } from '../api/auth'
import { getTasks } from '../api/homework'
import type { Task } from '../api/homework'
import { getEvents } from '../api/events'
import type { Event } from '../api/events'
import { getTheme } from '../lib/themes'

// Cycle each course name through the rainbow palette so
// every course always gets the same distinct color.
// Derived from the 8-color page theme palette (activeBg + accent pairs).
const PASTEL_BADGES = [
  { bg: '#FDD8D8', text: '#9B1C1C' },  // salmon
  { bg: '#FDE9C8', text: '#9A3412' },  // peach
  { bg: '#FFFBD0', text: '#854D0E' },  // yellow
  { bg: '#DFFFCE', text: '#15803D' },  // mint
  { bg: '#D9FAFC', text: '#0E7490' },  // aqua
  { bg: '#DBE8FF', text: '#1E40AF' },  // blue
  { bg: '#E5E2FF', text: '#4C1D95' },  // purple
  { bg: '#F9EEFF', text: '#7E22CE' },  // lilac
]

function getBadgeColor(course: string) {
  let h = 0
  for (let i = 0; i < course.length; i++) h = (h * 31 + course.charCodeAt(i)) & 0xfffff
  return PASTEL_BADGES[Math.abs(h) % PASTEL_BADGES.length]
}

function getUpcoming(tasks: Task[]) {
  const now = Date.now()
  const week = 7 * 24 * 60 * 60 * 1000
  return tasks
    .filter(t => !t.is_completed && new Date(t.due_date).getTime() > now && new Date(t.due_date).getTime() < now + week)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 4)
}

function getUpcomingEvents(events: Event[]) {
  const now = Date.now()
  return events
    .filter(e => !e.is_completed && new Date(e.end_datetime).getTime() > now)
    .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime())
    .slice(0, 4)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Home() {
  const { pathname } = useLocation()
  const theme = getTheme(pathname)

  const { data: user }     = useQuery({ queryKey: ['me'],     queryFn: getMe })
  const { data: tasks = [] } = useQuery({ queryKey: ['tasks'],  queryFn: getTasks })
  const { data: events = [] } = useQuery({ queryKey: ['events'], queryFn: getEvents })

  const upcomingTasks  = getUpcoming(tasks)
  const upcomingEvents = getUpcomingEvents(events)
  const overdueCount   = tasks.filter(t => !t.is_completed && new Date(t.due_date).getTime() < Date.now()).length

  // Shared card style for this page
  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: `1px solid ${theme.border}`,
    borderRadius: '16px',
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">
          {getGreeting()}, {user?.fullname.split(' ')[0]}
        </h1>
        <p className="text-sm mt-1 font-medium text-slate-400">
          Here's what's on your plate.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-4 text-center shadow-sm" style={cardStyle}>
          <p className="text-3xl font-extrabold" style={{ color: theme.accent }}>
            {tasks.filter(t => !t.is_completed).length}
          </p>
          <p className="text-xs font-semibold mt-1 text-slate-400">Open tasks</p>
        </div>
        <div className="p-4 text-center shadow-sm" style={cardStyle}>
          {/* Overdue stays a consistent warning pink across all pages */}
          <p className="text-3xl font-extrabold text-pink-400">{overdueCount}</p>
          <p className="text-xs font-semibold mt-1 text-slate-400">Overdue</p>
        </div>
      </div>

      {/* Upcoming homework */}
      <div className="mb-4">
        <div className="p-5 shadow-sm" style={cardStyle}>
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: theme.accent }}>
            Upcoming homework ({upcomingTasks.length})
          </h2>
          {upcomingTasks.length === 0 ? (
            <p className="text-sm font-medium text-slate-400 py-2">
              Nothing due in the next 7 days
            </p>
          ) : (
            <ul className="space-y-2">
              {upcomingTasks.map(task => {
                const badge = getBadgeColor(task.course)
                return (
                  <li key={task.id} className="flex items-start gap-3">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5"
                      style={{ background: badge.bg, color: badge.text }}
                    >
                      {task.course}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{task.task_name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Due {formatDate(task.due_date)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Upcoming events */}
      <div className="p-5 shadow-sm" style={cardStyle}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: theme.accent }}>
          Upcoming events ({upcomingEvents.length})
        </h2>
        {upcomingEvents.length === 0 ? (
          <p className="text-sm font-medium text-slate-400 py-2">No upcoming events</p>
        ) : (
          <ul className="space-y-2">
            {upcomingEvents.map(event => (
              <li key={event.id} className="flex items-start gap-3">
                {/* Blue dot to distinguish events from homework */}
                <span
                  className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                  style={{ background: '#B4E4FF', outline: '1.5px solid #7DD3FC', outlineOffset: '1px' }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{event.event_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatDate(event.start_datetime)} → {formatDate(event.end_datetime)}
                  </p>
                  {event.location && (
                    <p className="text-xs text-slate-400 mt-0.5">{event.location}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
