// Study page — four tabs: Session timer, Break timer, Pomodoro, and Records (past sessions).
// Session and Break tabs are timer-only — history lives in Records.

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation, useBlocker } from 'react-router-dom'
import { getTheme } from '../lib/themes'
import type { PageTheme } from '../lib/themes'
import { createSession } from '../api/sessions'
import { createBreak } from '../api/breaks'
import { getNotes, toggleNoteImportance, editNote, deleteNote } from '../api/notes'
import type { Note } from '../api/notes'
import ConfirmModal from '../components/ConfirmModal'
import PomoPanel from '../components/PomoPanel'

type StudyTab = 'session' | 'break' | 'notes' | 'pomo'
type Phase = 'idle' | 'running' | 'stopped'

// --- Shared helpers ---

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(n => n.toString().padStart(2, '0')).join(':')
}

function formatDuration(start: string, end: string) {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}


function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Structural input classes — border color applied via inline style per-theme
const inputCls = 'px-3 py-2 rounded-xl border text-sm font-medium text-slate-800 placeholder:text-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 transition'

// --- Tab button ---
function TabBtn({ active, onClick, theme, children }: {
  active: boolean
  onClick: () => void
  theme: PageTheme
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2 text-sm font-bold rounded-xl transition-all cursor-pointer"
      style={active
        ? { background: '#FFFFFF', color: theme.accent, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
        : { color: theme.accent, opacity: 0.5 }
      }
    >
      {children}
    </button>
  )
}

// --- Session panel ---

const MIN_SESSION_SECS = 60 // sessions under 1 minute are rejected

function SessionPanel({ theme, onDirtyChange }: { theme: PageTheme; onDirtyChange: (dirty: boolean) => void }) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('idle')
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [endTime, setEndTime] = useState<Date | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [course, setCourse] = useState('')
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const isDirty = phase !== 'idle'

  // Notify parent so it can intercept tab switches
  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])

  // Block sidebar/route navigation while session is active
  const blocker = useBlocker(isDirty)

  // Block browser tab close / refresh
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useEffect(() => {
    if (phase !== 'running') return
    // Derive elapsed from wall clock so the timer stays accurate when the tab is in the background.
    const origin = startTime!.getTime()
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - origin) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [phase, startTime])

  const saveMutation = useMutation({
    mutationFn: createSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      setPhase('idle')
      setStartTime(null)
      setEndTime(null)
      setElapsed(0)
      setCourse('')
      setTopic('')
      setNotes('')
    },
  })

  function handleStart() {
    if (!course.trim()) return
    setStartTime(new Date())
    setElapsed(0)
    setPhase('running')
  }

  function handleStop() {
    setEndTime(new Date())
    setPhase('stopped')
  }

  function handleSave() {
    if (!startTime || !endTime) return
    if (elapsed < MIN_SESSION_SECS) {
      setSaveError(`Sessions must be at least ${MIN_SESSION_SECS / 60} minute${MIN_SESSION_SECS >= 120 ? 's' : ''} to be saved.`)
      return
    }
    setSaveError(null)
    saveMutation.mutate({
      course,
      topic: topic.trim() || null,
      start_datetime: startTime.toISOString().slice(0, 19),
      end_datetime: endTime.toISOString().slice(0, 19),
      notes: notes.trim() || null,
    })
  }

  function handleDiscard() {
    setPhase('idle')
    setStartTime(null)
    setEndTime(null)
    setElapsed(0)
    setNotes('')
  }

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF', border: `1px solid ${theme.border}`, borderRadius: '16px',
  }

  return (
    <div>
      {/* Timer card */}
      <div className="shadow-sm p-6 mb-4" style={cardStyle}>
        {phase === 'idle' && (
          <div className="flex gap-2 mb-4">
            <input value={course} onChange={e => setCourse(e.target.value)} placeholder="Course *"
              className={`${inputCls} flex-1`} style={{ borderColor: theme.border }} />
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic (optional)"
              className={`${inputCls} flex-1`} style={{ borderColor: theme.border }} />
          </div>
        )}

        {phase !== 'idle' && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: theme.activeBg, color: theme.accent }}>
              {course}
            </span>
            {topic && <span className="text-xs text-slate-400 font-medium">{topic}</span>}
          </div>
        )}

        <p className="text-6xl font-extrabold tabular-nums tracking-tight text-center mb-6"
          style={{ color: theme.accent }}>
          {formatElapsed(elapsed)}
        </p>

        <div className="flex justify-center gap-3">
          {phase === 'idle' && (
            <button onClick={handleStart} disabled={!course.trim()}
              className="btn-primary px-10 py-3 text-white font-bold rounded-2xl text-sm cursor-pointer shadow-sm"
              style={{ background: theme.accent }}>
              Start
            </button>
          )}
          {phase === 'running' && (
            <button onClick={handleStop}
              className="px-10 py-3 bg-rose-400 hover:bg-rose-500 text-white font-bold rounded-2xl text-sm transition-colors cursor-pointer shadow-sm">
              Stop
            </button>
          )}
          {phase === 'stopped' && (
            <>
              <button onClick={handleDiscard}
                className="btn-secondary px-6 py-3 font-bold rounded-2xl text-sm cursor-pointer"
                style={{ background: theme.activeBg, color: theme.accent }}>
                Discard
              </button>
              <button onClick={handleSave} disabled={saveMutation.isPending}
                className="btn-primary px-8 py-3 text-white font-bold rounded-2xl text-sm cursor-pointer shadow-sm"
                style={{ background: theme.accent }}>
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>

        {phase === 'stopped' && (
          <div className="mt-4">
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add notes (optional)…" rows={3}
              className={`${inputCls} w-full resize-none`} style={{ borderColor: theme.border }} />
            {startTime && endTime && (
              <p className="text-xs text-slate-400 mt-1 font-medium">
                Duration: {formatDuration(startTime.toISOString(), endTime.toISOString())}
              </p>
            )}
            {saveError && (
              <p className="text-sm font-semibold text-rose-500 mt-2">{saveError}</p>
            )}
          </div>
        )}
      </div>

      {/* Route navigation guard — fires when user clicks sidebar while session is active */}
      <ConfirmModal
        isOpen={blocker.state === 'blocked'}
        title="Leave page?"
        message="You have an active session. If you leave now, your progress will be lost."
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
        theme={theme}
      />
    </div>
  )
}

// --- Break panel ---

function BreakPanel({ theme, onDirtyChange }: { theme: PageTheme; onDirtyChange: (dirty: boolean) => void }) {
  const queryClient = useQueryClient()
  const [isRunning, setIsRunning] = useState(false)
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const isDirty = isRunning

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])

  const blocker = useBlocker(isDirty)

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useEffect(() => {
    if (!isRunning) return
    // Derive elapsed from wall clock so the timer stays accurate when the tab is in the background.
    const origin = startTime!.getTime()
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - origin) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, startTime])

  const createMutation = useMutation({
    mutationFn: createBreak,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breaks'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })

  function handleStart() {
    setStartTime(new Date())
    setElapsed(0)
    setIsRunning(true)
  }

  function handleStop() {
    if (!startTime) return
    setIsRunning(false)
    const endTime = new Date()
    createMutation.mutate({
      start_datetime: startTime.toISOString().slice(0, 19),
      end_datetime: endTime.toISOString().slice(0, 19),
    })
    setStartTime(null)
    setElapsed(0)
  }

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF', border: `1px solid ${theme.border}`, borderRadius: '16px',
  }

  return (
    <div>
      {/* Timer card */}
      <div className="shadow-sm p-8 mb-4 text-center" style={cardStyle}>
        <p className="text-6xl font-extrabold tabular-nums tracking-tight mb-6" style={{ color: theme.accent }}>
          {formatElapsed(elapsed)}
        </p>

        {isRunning ? (
          <button onClick={handleStop}
            className="px-10 py-3 bg-rose-400 hover:bg-rose-500 text-white font-bold rounded-2xl text-sm transition-colors cursor-pointer shadow-sm">
            Stop Break
          </button>
        ) : (
          <button onClick={handleStart} disabled={createMutation.isPending}
            className="btn-primary px-10 py-3 text-white font-bold rounded-2xl text-sm cursor-pointer shadow-sm"
            style={{ background: theme.accent }}>
            Start Break
          </button>
        )}

        {isRunning && (
          <p className="text-xs text-slate-400 mt-3 font-medium">
            Started at {startTime?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
      </div>

      <ConfirmModal
        isOpen={blocker.state === 'blocked'}
        title="Leave page?"
        message="You have an active break timer. If you leave now, it will be lost."
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
        theme={theme}
      />
    </div>
  )
}

// --- Notes panel ---

function NoteEditForm({ note, onSave, onCancel, isPending, theme }: {
  note: Note
  onSave: (data: { course: string; topic: string; notes: string }) => void
  onCancel: () => void
  isPending: boolean
  theme: PageTheme
}) {
  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    onSave({
      course: fd.get('course') as string,
      topic: fd.get('topic') as string,
      notes: fd.get('notes') as string,
    })
  }

  const fullInputCls = `w-full ${inputCls}`

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <div className="flex gap-2">
        <input name="course" defaultValue={note.course} placeholder="Course" required
          className={`${inputCls} flex-1`} style={{ borderColor: theme.border }} />
        <input name="topic" defaultValue={note.topic ?? ''} placeholder="Topic (optional)"
          className={`${inputCls} flex-1`} style={{ borderColor: theme.border }} />
      </div>
      <textarea name="notes" defaultValue={note.notes ?? ''} placeholder="Notes…" rows={4}
        className={`${fullInputCls} resize-none`} style={{ borderColor: theme.border }} />
      <div className="flex gap-2">
        <button type="submit" disabled={isPending}
          className="btn-primary px-4 py-1.5 text-white font-bold rounded-xl text-xs cursor-pointer"
          style={{ background: theme.accent }}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}
          className="btn-secondary px-4 py-1.5 font-bold rounded-xl text-xs cursor-pointer"
          style={{ background: theme.activeBg, color: theme.accent }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

type NoteSort = 'newest' | 'oldest' | 'az' | 'starred'

const NOTE_SORTS: { key: NoteSort; label: string }[] = [
  { key: 'newest',  label: 'Newest' },
  { key: 'oldest',  label: 'Oldest' },
  { key: 'starred', label: 'Starred' },
  { key: 'az',      label: 'A–Z' },
]

function sortNotes(notes: Note[], sort: NoteSort): Note[] {
  return [...notes].sort((a, b) => {
    if (sort === 'newest')  return new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime()
    if (sort === 'oldest')  return new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
    if (sort === 'starred') return (+b.is_important - +a.is_important) || new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime()
    if (sort === 'az')      return a.course.localeCompare(b.course)
    return 0
  })
}

function NotesPanel({ theme }: { theme: PageTheme }) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [sort, setSort] = useState<NoteSort>('newest')
  const [search, setSearch] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['notes'],
    queryFn: getNotes,
  })

  const importanceMutation = useMutation({
    mutationFn: toggleNoteImportance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { course: string; topic: string | null; notes: string | null } }) =>
      editNote(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  })

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF', border: `1px solid ${theme.border}`, borderRadius: '16px',
  }

  if (isLoading) return (
    <p className="text-center font-semibold py-8 animate-pulse" style={{ color: theme.accent }}>Loading…</p>
  )

  if (error) return (
    <p className="text-center text-rose-400 font-semibold py-8">Something went wrong. Try refreshing.</p>
  )

  const q = search.trim().toLowerCase()
  const filtered = q
    ? data!.filter(n =>
        n.course.toLowerCase().includes(q) ||
        (n.topic ?? '').toLowerCase().includes(q) ||
        (n.notes ?? '').toLowerCase().includes(q)
      )
    : data!
  const notes = sortNotes(filtered, sort)

  const hasData = data!.length > 0

  return (
    <>
      <ConfirmModal
        isOpen={deletingId !== null}
        title="Delete note?"
        message="This can't be undone."
        onConfirm={() => { deleteMutation.mutate(deletingId!); setDeletingId(null) }}
        onCancel={() => setDeletingId(null)}
        theme={theme}
      />

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search course, topic, notes…"
        className={`${inputCls} w-full mb-3`} style={{ borderColor: theme.border }}
      />

      {/* Sort controls */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {NOTE_SORTS.map(({ key, label }) => (
          <button key={key} onClick={() => setSort(key)}
            className="px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
            style={sort === key
              ? { background: theme.accent, color: '#FFFFFF' }
              : { background: theme.activeBg, color: theme.accent }
            }>
            {label}
          </button>
        ))}
      </div>
      {!hasData && (
        <p className="text-center text-slate-400 font-bold py-8">
          No notes yet — add them when you save a session.
        </p>
      )}
      {hasData && notes.length === 0 && (
        <p className="text-center text-slate-400 font-bold py-8">
          No notes match "{search}".
        </p>
      )}
      <ul className="space-y-3">
      {notes.map(note => (
        <li key={note.id} className="shadow-sm px-5 py-4" style={cardStyle}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: theme.activeBg, color: theme.accent }}>
                {note.course}
              </span>
              {note.topic && (
                <span className="text-xs font-semibold text-slate-400">{note.topic}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => importanceMutation.mutate(note.id)}
                className="text-xl leading-none cursor-pointer transition-all hover:scale-110"
                style={{ color: note.is_important ? theme.border : '#D1D5DB' }}>
                ★
              </button>
              <button onClick={() => setEditingId(editingId === note.id ? null : note.id)}
                className="text-xs font-bold cursor-pointer transition-colors"
                style={{ color: theme.accent, opacity: 0.7 }}>
                {editingId === note.id ? 'Close' : 'Edit'}
              </button>
              <button onClick={() => setDeletingId(note.id)}
                className="text-rose-300 hover:text-rose-400 cursor-pointer transition-colors font-bold">
                ✕
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-1 font-medium">
            {formatDuration(note.start_datetime, note.end_datetime)} — {formatDateLong(note.start_datetime)}
          </p>

          {note.notes && editingId !== note.id && (
            <p className="text-sm text-slate-500 mt-2 break-words whitespace-pre-wrap">{note.notes}</p>
          )}

          {editingId === note.id && (
            <NoteEditForm
              note={note}
              isPending={editMutation.isPending}
              onCancel={() => setEditingId(null)}
              theme={theme}
              onSave={data =>
                editMutation.mutate({
                  id: note.id,
                  data: { course: data.course, topic: data.topic || null, notes: data.notes || null },
                })
              }
            />
          )}
        </li>
      ))}
      </ul>
    </>
  )
}

// --- Main Study component ---

export default function Study() {
  const [tab, setTab] = useState<StudyTab>('session')
  const [pendingTab, setPendingTab] = useState<StudyTab | null>(null)
  const [sessionDirty, setSessionDirty] = useState(false)
  const [breakDirty, setBreakDirty]     = useState(false)
  const [pomoDirty, setPomoDirty]       = useState(false)
  const { pathname } = useLocation()
  const theme = getTheme(pathname)

  const tabLabels: { key: StudyTab; label: string }[] = [
    { key: 'session', label: 'Session' },
    { key: 'break',   label: 'Break' },
    { key: 'pomo',    label: 'Pomo' },
    { key: 'notes',   label: 'Records' },
  ]

  function currentTabIsDirty() {
    return (tab === 'session' && sessionDirty)
        || (tab === 'break' && breakDirty)
        || (tab === 'pomo' && pomoDirty)
  }

  function handleTabClick(key: StudyTab) {
    if (key === tab) return
    if (currentTabIsDirty()) setPendingTab(key)
    else setTab(key)
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">

      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Study</h1>
      </div>

      {/* Intercepts tab switches when a session/break/pomo is active */}
      <ConfirmModal
        isOpen={pendingTab !== null}
        title="Switch tabs?"
        message={
          tab === 'session' ? 'You have an active session. Switching tabs will lose your progress.'
          : tab === 'pomo'  ? 'A Pomodoro is in progress. Switching tabs will lose it.'
          :                   'You have an active break timer. Switching tabs will lose it.'
        }
        confirmLabel="Switch anyway"
        onConfirm={() => { setTab(pendingTab!); setPendingTab(null) }}
        onCancel={() => setPendingTab(null)}
        theme={theme}
      />

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-2xl mb-6" style={{ background: theme.activeBg }}>
        {tabLabels.map(({ key, label }) => (
          <TabBtn key={key} active={tab === key} onClick={() => handleTabClick(key)} theme={theme}>
            {label}
          </TabBtn>
        ))}
      </div>

      {tab === 'session' && <SessionPanel theme={theme} onDirtyChange={setSessionDirty} />}
      {tab === 'break'   && <BreakPanel   theme={theme} onDirtyChange={setBreakDirty} />}
      {tab === 'pomo'    && <PomoPanel    theme={theme} onDirtyChange={setPomoDirty} />}
      {tab === 'notes'   && <NotesPanel   theme={theme} />}
    </div>
  )
}
