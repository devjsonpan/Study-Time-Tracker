// PomoPanel — Pomodoro timer integrated into the Study page.
// Flow per round: countdown → confirm save → break timer → (repeat) → done.
// Sessions are logged via the standard /api/sessions endpoint.
// Breaks are auto-logged when the break timer ends (no confirmation needed).

import React, { useState, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createSession } from '../api/sessions'
import { createBreak } from '../api/breaks'
import type { PageTheme } from '../lib/themes'
import ConfirmModal from './ConfirmModal'

type Phase = 'idle' | 'studying' | 'confirming' | 'break' | 'done'

type Settings = {
  studyMins: number
  shortBreakMins: number
  longBreakMins: number
  totalRounds: number
}

const DEFAULTS: Settings = { studyMins: 25, shortBreakMins: 5, longBreakMins: 15, totalRounds: 4 }

// Two-tone descending beep via Web Audio API — no external files needed
function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.25)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc.start()
    osc.stop(ctx.currentTime + 0.8)
  } catch { /* AudioContext blocked or unavailable */ }
}

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// UTC datetime string matching the backend's naive datetime format
function toIso(d: Date) { return d.toISOString().slice(0, 19) }

const inputCls = 'px-3 py-2 rounded-xl border text-sm font-medium text-slate-800 placeholder:text-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 transition'

export default function PomoPanel({
  theme,
  onDirtyChange,
}: {
  theme: PageTheme
  onDirtyChange: (dirty: boolean) => void
}) {
  const queryClient = useQueryClient()

  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [phase, setPhase]           = useState<Phase>('idle')
  const [currentRound, setCurrentRound] = useState(1)
  const [timeLeft, setTimeLeft]     = useState(DEFAULTS.studyMins * 60)
  const [isPaused, setIsPaused]     = useState(false)
  const [course, setCourse]         = useState('')
  const [notes, setNotes]           = useState('')
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [isSaving, setIsSaving]     = useState(false)
  const [showNavBlock, setShowNavBlock] = useState(false)

  const studyStartRef  = useRef<Date | null>(null)
  const breakStartRef  = useRef<Date | null>(null)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  // Callback ref avoids stale closures inside the setInterval tick.
  // Updated every render cycle so it always captures the latest state.
  const onTimerEndRef = useRef<() => void>(() => {})
  useEffect(() => {
    onTimerEndRef.current = () => {
      playBeep()
      if (phase === 'studying') {
        setPhase('confirming')
      } else if (phase === 'break') {
        // Auto-log the break — fire and forget, non-critical if it fails
        if (breakStartRef.current) {
          const end = new Date()
          createBreak({ start_datetime: toIso(breakStartRef.current), end_datetime: toIso(end) })
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['breaks'] })
              queryClient.invalidateQueries({ queryKey: ['summary'] })
            })
            .catch(() => {})
        }
        if (currentRound >= settings.totalRounds) {
          setPhase('done')
        } else {
          const next = currentRound + 1
          setCurrentRound(next)
          setPhase('idle')
          setTimeLeft(settings.studyMins * 60)
        }
      }
    }
  }, [phase, currentRound, settings, queryClient])

  // Countdown — clears and restarts whenever phase or isPaused changes
  useEffect(() => {
    if ((phase !== 'studying' && phase !== 'break') || isPaused) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current!)
          onTimerEndRef.current()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [phase, isPaused])

  // Lift dirty state so the Study parent can guard tab/mode switches
  const isDirty = phase !== 'idle' && phase !== 'done'
  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])

  // Block in-app navigation while a pomo is running
  const blocker = useBlocker(isDirty)
  useEffect(() => {
    if (blocker.state === 'blocked') setShowNavBlock(true)
  }, [blocker.state])

  // Block browser tab close / refresh
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // --- Actions ---

  function startStudy() {
    studyStartRef.current = new Date()
    setTimeLeft(settings.studyMins * 60)
    setPhase('studying')
    setIsPaused(false)
  }

  function startBreak() {
    breakStartRef.current = new Date()
    const isLong = currentRound % settings.totalRounds === 0
    setTimeLeft((isLong ? settings.longBreakMins : settings.shortBreakMins) * 60)
    setPhase('break')
    setIsPaused(false)
    setSaveError(null)
  }

  async function handleSave() {
    if (!course.trim()) { setSaveError('Course is required.'); return }
    if (!studyStartRef.current) return
    setSaveError(null)
    setIsSaving(true)
    try {
      await createSession({
        course: course.trim(),
        topic: null,
        start_datetime: toIso(studyStartRef.current),
        end_datetime: toIso(new Date()),
        notes: notes.trim() || null,
      })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      setCourse('')
      setNotes('')
      startBreak()
    } catch {
      setSaveError('Failed to save session. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  function handleSkip() {
    setCourse('')
    setNotes('')
    setSaveError(null)
    startBreak()
  }

  function reset() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setPhase('idle')
    setCurrentRound(1)
    setTimeLeft(settings.studyMins * 60)
    setIsPaused(false)
    studyStartRef.current = null
    breakStartRef.current = null
    setCourse('')
    setNotes('')
    setSaveError(null)
  }

  // --- Derived display values ---

  const isLongBreak = currentRound % settings.totalRounds === 0

  const phaseLabel =
    phase === 'studying'   ? `Round ${currentRound} of ${settings.totalRounds} — Studying`
    : phase === 'confirming' ? `Round ${currentRound} of ${settings.totalRounds} — Save your session`
    : phase === 'break'    ? `Round ${currentRound} of ${settings.totalRounds} — ${isLongBreak ? 'Long' : 'Short'} break`
    : phase === 'done'     ? 'All rounds complete!'
    : currentRound > 1     ? `Ready for round ${currentRound} of ${settings.totalRounds}`
    : ''

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF', border: `1px solid ${theme.border}`, borderRadius: '16px',
  }

  // Round progress dots: filled = completed rounds
  const RoundDots = () => (
    <div className="flex gap-2 justify-center mb-5">
      {Array.from({ length: settings.totalRounds }, (_, i) => (
        <div key={i}
          className="w-2.5 h-2.5 rounded-full border-2 transition-all"
          style={
            phase === 'done' || i < currentRound - 1
              ? { background: theme.accent, borderColor: theme.accent }
              : i === currentRound - 1 && phase !== 'idle'
              ? { background: 'transparent', borderColor: theme.accent }
              : { background: 'transparent', borderColor: theme.border }
          }
        />
      ))}
    </div>
  )

  return (
    <div>
      <ConfirmModal
        isOpen={showNavBlock}
        title="Leave page?"
        message="A Pomodoro session is in progress. Your timer will be lost."
        confirmLabel="Leave anyway"
        onConfirm={() => { blocker.proceed?.(); setShowNavBlock(false) }}
        onCancel={() => { blocker.reset?.(); setShowNavBlock(false) }}
        theme={theme}
      />

      <div className="shadow-sm p-6 mb-4" style={cardStyle}>
        {phaseLabel && (
          <p className="text-xs font-bold uppercase tracking-wider text-center mb-4" style={{ color: theme.accent }}>
            {phaseLabel}
          </p>
        )}

        <RoundDots />

        {/* Settings — only available before the first round starts */}
        {phase === 'idle' && currentRound === 1 && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {([
              ['Study (min)',       'studyMins'      ],
              ['Short break (min)', 'shortBreakMins' ],
              ['Long break (min)',  'longBreakMins'  ],
              ['Rounds',           'totalRounds'    ],
            ] as [string, keyof Settings][]).map(([label, key]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.accent }}>
                  {label}
                </label>
                <input
                  type="number" min={1}
                  max={key === 'totalRounds' ? 10 : key === 'studyMins' ? 120 : key === 'shortBreakMins' ? 30 : 60}
                  value={settings[key]}
                  onChange={e => {
                    const maxVal = key === 'totalRounds' ? 10 : key === 'studyMins' ? 120 : key === 'shortBreakMins' ? 30 : 60
                    const v = Math.min(maxVal, Math.max(1, parseInt(e.target.value) || 1))
                    setSettings(s => ({ ...s, [key]: v }))
                    if (key === 'studyMins') setTimeLeft(v * 60)
                  }}
                  className={`${inputCls} w-full`} style={{ borderColor: theme.border }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Big countdown timer — hidden during confirmation */}
        {phase !== 'confirming' && (
          <p
            className="text-6xl font-extrabold tabular-nums tracking-tight text-center mb-6"
            style={{ color: phase === 'break' ? theme.border : theme.accent }}
          >
            {fmtTime(timeLeft)}
          </p>
        )}

        {/* Confirmation form — shown when study timer hits zero */}
        {phase === 'confirming' && (
          <div className="space-y-3 mb-6">
            <p className="text-sm text-slate-500 font-medium text-center">
              Save this session before starting your break.
            </p>
            <input
              value={course} onChange={e => setCourse(e.target.value)}
              placeholder="Course *"
              className={`${inputCls} w-full`} style={{ borderColor: theme.border }}
            />
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={3}
              className={`${inputCls} w-full resize-none`} style={{ borderColor: theme.border }}
            />
            {saveError && (
              <p className="text-xs font-semibold text-rose-500 bg-rose-50 px-3 py-2 rounded-xl">
                {saveError}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={isSaving}
                className="btn-primary flex-1 py-2.5 text-white font-bold rounded-xl text-sm cursor-pointer"
                style={{ background: theme.accent }}>
                {isSaving ? 'Saving...' : 'Save & start break'}
              </button>
              <button onClick={handleSkip} disabled={isSaving}
                className="btn-secondary px-4 py-2.5 font-bold rounded-xl text-sm cursor-pointer"
                style={{ background: theme.activeBg, color: theme.accent }}>
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex justify-center gap-3">
          {phase === 'idle' && (
            <button onClick={startStudy}
              className="btn-primary px-8 py-2.5 text-white font-bold rounded-xl text-sm cursor-pointer shadow-sm"
              style={{ background: theme.accent }}>
              {currentRound > 1 ? `Start round ${currentRound}` : 'Start'}
            </button>
          )}

          {(phase === 'studying' || phase === 'break') && (
            <>
              <button onClick={() => setIsPaused(p => !p)}
                className="btn-secondary px-6 py-2 font-bold rounded-xl text-sm cursor-pointer"
                style={{ background: theme.activeBg, color: theme.accent }}>
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button onClick={reset}
                className="btn-secondary px-4 py-2 font-bold rounded-xl text-sm cursor-pointer"
                style={{ background: '#FFF1F2', color: '#F43F5E' }}>
                Reset
              </button>
            </>
          )}

          {phase === 'done' && (
            <button onClick={reset}
              className="btn-primary px-8 py-2.5 text-white font-bold rounded-xl text-sm cursor-pointer shadow-sm"
              style={{ background: theme.accent }}>
              Start over
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
