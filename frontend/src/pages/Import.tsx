// Import page — AI-powered schedule parser.
//
// Step 1: User pastes free-form text (e.g. a syllabus, calendar dump, class schedule).
//         Clicking "Parse" sends the text to Gemini via Flask /api/parse.
// Step 2: Confirmation screen. Each extracted item shows as a card with:
//           - Include/exclude toggle (checkbox)
//           - Type toggle (task ↔ event)
//           - Inline editable fields (all fields the backend returned)
//           - Warning badge if a required field is empty
//         "Import N items" bulk-creates all included items via existing API routes.

import React, { useState, useRef, useEffect } from 'react'
import { useLocation, useBlocker } from 'react-router-dom'
import { getTheme } from '../lib/themes'
import { parseSchedule, type ParsedItem } from '../api/parse'
import ConfirmModal from '../components/ConfirmModal'

// Matches the input style used across all other pages
const inputBase = 'px-3 py-2 rounded-xl border text-sm font-medium text-slate-800 placeholder:text-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 transition'
const inputFull = `w-full ${inputBase}`

// ── Recurrence helpers ────────────────────────────────────────────────────────

const DAY_NUM: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

// Count how many occurrences fall in the recurrence range
function countOccurrences(startIso: string, days: string[], until: string): number {
  const dayNums = new Set(days.map(d => DAY_NUM[d]))
  const cur = new Date(startIso.slice(0, 10) + 'T00:00:00')
  const end = new Date(until + 'T23:59:59')
  let count = 0
  while (cur <= end) {
    if (dayNums.has(cur.getDay())) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// Expand a recurring item into one ConfirmItem per occurrence
function expandRecurrence(item: ConfirmItem, nextId: () => number): ConfirmItem[] {
  if (!item.recurrence || !item.start_datetime) return [item]
  const { days, until } = item.recurrence
  const dayNums = new Set(days.map(d => DAY_NUM[d]))
  const startTime = item.start_datetime.slice(11, 16)        // HH:MM
  const endTime   = item.end_datetime?.slice(11, 16) ?? null
  const cur = new Date(item.start_datetime.slice(0, 10) + 'T00:00:00')
  const end = new Date(until + 'T23:59:59')
  const expanded: ConfirmItem[] = []
  while (cur <= end) {
    if (dayNums.has(cur.getDay())) {
      const dateStr = cur.toISOString().slice(0, 10)
      expanded.push({
        ...item,
        _id: nextId(),
        recurrence: null,  // expanded items are plain events
        start_datetime: `${dateStr}T${startTime}`,
        end_datetime:   endTime ? `${dateStr}T${endTime}` : null,
      })
    }
    cur.setDate(cur.getDate() + 1)
  }
  return expanded
}

function formatUntil(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMissingRequired(item: ConfirmItem): string[] {
  const missing: string[] = []
  if (item.type === 'task') {
    if (!item.task_name?.trim())  missing.push('Task name')
    if (!item.course?.trim())     missing.push('Course')
    if (!item.due_date?.trim())   missing.push('Due date')
  } else {
    if (!item.event_name?.trim())     missing.push('Event name')
    if (!item.start_datetime?.trim()) missing.push('Start time')
    if (!item.end_datetime?.trim())   missing.push('End time')
  }
  return missing
}

// ── Types ─────────────────────────────────────────────────────────────────────

// Extends ParsedItem with UI state: include toggle + stable id for keying
type ConfirmItem = ParsedItem & {
  _id: number
  included: boolean
}

// ── Field component ───────────────────────────────────────────────────────────

type FieldProps = {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  multiline?: boolean
  inputType?: string
  borderColor: string
}

function Field({ label, value, onChange, placeholder, required, multiline, inputType = 'text', borderColor }: FieldProps) {
  // datetime-local requires YYYY-MM-DDTHH:MM — strip seconds if present
  const displayValue = inputType === 'datetime-local' ? value.slice(0, 16) : value

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-500">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </span>
      {multiline ? (
        <textarea
          rows={2}
          className={`${inputFull} resize-none`}
          style={{ borderColor }}
          value={displayValue}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <input
          type={inputType}
          className={inputFull}
          style={{ borderColor }}
          value={displayValue}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

// ── Item card ─────────────────────────────────────────────────────────────────

type ItemCardProps = {
  item: ConfirmItem
  theme: ReturnType<typeof getTheme>
  onChange: (id: number, patch: Partial<ConfirmItem>) => void
  onExpand: (id: number) => void
}

function ItemCard({ item, theme, onChange, onExpand }: ItemCardProps) {
  const missing = isMissingRequired(item)
  const occurrenceCount = item.recurrence && item.start_datetime
    ? countOccurrences(item.start_datetime, item.recurrence.days, item.recurrence.until)
    : 0

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: `1px solid ${item.included ? theme.border : '#E2E8F0'}`,
    borderRadius: '16px',
    opacity: item.included ? 1 : 0.5,
    transition: 'opacity 0.15s, border-color 0.15s',
  }

  return (
    <div style={cardStyle} className="p-4">

      {/* Header: checkbox + type toggle + missing warning */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="checkbox"
          checked={item.included}
          onChange={e => onChange(item._id, { included: e.target.checked })}
          className="w-4 h-4 rounded cursor-pointer"
          style={{ accentColor: theme.accent }}
        />

        {/* Task / Event pill toggle */}
        <div
          className="flex rounded-full text-xs font-bold overflow-hidden select-none"
          style={{ border: `1.5px solid ${theme.border}` }}
        >
          <button
            onClick={() => onChange(item._id, { type: 'task' })}
            className="px-3 py-1 cursor-pointer transition-colors"
            style={item.type === 'task'
              ? { background: theme.accent, color: 'white' }
              : { background: 'transparent', color: theme.accent }
            }
          >
            Task
          </button>
          <button
            onClick={() => onChange(item._id, { type: 'event' })}
            className="px-3 py-1 cursor-pointer transition-colors"
            style={item.type === 'event'
              ? { background: theme.accent, color: 'white' }
              : { background: 'transparent', color: theme.accent }
            }
          >
            Event
          </button>
        </div>

        {missing.length > 0 && item.included && (
          <span className="text-xs font-semibold text-amber-500">
            Missing: {missing.join(', ')}
          </span>
        )}
      </div>

      {/* Recurrence banner — shown when Gemini detected a repeating event */}
      {item.recurrence && item.type === 'event' && (
        <div
          className="flex items-center justify-between rounded-xl px-3 py-2 mb-3 text-sm"
          style={{ background: theme.activeBg }}
        >
          <span style={{ color: theme.accent }} className="font-medium">
            Repeats {item.recurrence.days.join(', ')} until {formatUntil(item.recurrence.until)}
            {' '}({occurrenceCount} occurrence{occurrenceCount !== 1 ? 's' : ''})
          </span>
          <button
            onClick={() => onExpand(item._id)}
            className="text-xs font-bold px-3 py-1 rounded-lg cursor-pointer transition-colors"
            style={{ background: theme.accent, color: 'white' }}
          >
            Generate all
          </button>
        </div>
      )}

      {/* Editable fields */}
      <div className="space-y-3">
        {item.type === 'task' ? (
          <>
            <Field label="Task name" value={item.task_name ?? ''} onChange={v => onChange(item._id, { task_name: v })} required borderColor={theme.border} />
            <Field label="Course"    value={item.course ?? ''}    onChange={v => onChange(item._id, { course: v })}    required borderColor={theme.border} />
            <Field label="Due date"  value={item.due_date ?? ''}  onChange={v => onChange(item._id, { due_date: v })}  required inputType="datetime-local" borderColor={theme.border} />
            <Field label="Notes"     value={item.description ?? ''} onChange={v => onChange(item._id, { description: v })} multiline borderColor={theme.border} />
          </>
        ) : (
          <>
            <Field label="Event name" value={item.event_name ?? ''}     onChange={v => onChange(item._id, { event_name: v })}     required borderColor={theme.border} />
            <Field label="Start"      value={item.start_datetime ?? ''} onChange={v => onChange(item._id, { start_datetime: v })} required inputType="datetime-local" borderColor={theme.border} />
            <Field label="End"        value={item.end_datetime ?? ''}   onChange={v => onChange(item._id, { end_datetime: v })}   required inputType="datetime-local" borderColor={theme.border} />
            <Field label="Location"   value={item.location ?? ''}       onChange={v => onChange(item._id, { location: v })}       borderColor={theme.border} />
            <Field label="Notes"      value={item.description ?? ''}    onChange={v => onChange(item._id, { description: v })}    multiline borderColor={theme.border} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Step = 'input' | 'confirm'

export default function Import() {
  const location = useLocation()
  const theme = getTheme(location.pathname)

  // Step 1
  const [text, setText]           = useState('')
  const [parsing, setParsing]     = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  // Step 2
  const [step, setStep]   = useState<Step>('input')
  const [items, setItems] = useState<ConfirmItem[]>([])
  // Stable ID counter for items created after initial parse (e.g. expanded recurrences)
  const nextIdRef = useRef(0)
  const nextId = () => ++nextIdRef.current

  // Import result
  const [importing, setImporting]     = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; fail: number } | null>(null)

  // ── Step 1: parse ───────────────────────────────────────────────────────────

  async function handleParse() {
    if (!text.trim()) return
    setParsing(true)
    setParseError(null)
    try {
      const raw = await parseSchedule(text)
      if (raw.length === 0) {
        setParseError('No items found. Try pasting more structured text.')
        return
      }
      nextIdRef.current = raw.length - 1
      setItems(raw.map((item, i) => ({ ...item, _id: i, included: true })))
      setStep('confirm')
    } catch (err) {
      setParseError((err as Error).message)
    } finally {
      setParsing(false)
    }
  }

  // ── Step 2: edit ────────────────────────────────────────────────────────────

  function patchItem(id: number, patch: Partial<ConfirmItem>) {
    setItems(prev => prev.map(it => it._id === id ? { ...it, ...patch } : it))
  }

  function toggleAll(included: boolean) {
    setItems(prev => prev.map(it => ({ ...it, included })))
  }

  // Replace a single recurring item with all its individual expanded occurrences
  function expandItem(id: number) {
    setItems(prev => {
      const idx = prev.findIndex(it => it._id === id)
      if (idx === -1) return prev
      const expanded = expandRecurrence(prev[idx], nextId)
      return [...prev.slice(0, idx), ...expanded, ...prev.slice(idx + 1)]
    })
  }

  // ── Step 2: import ──────────────────────────────────────────────────────────

  async function handleImport() {
    const toImport = items.filter(it => it.included)
    if (toImport.length === 0) return

    setImporting(true)
    setImportResult(null)
    let ok = 0, fail = 0

    for (const item of toImport) {
      try {
        if (item.type === 'task') {
          if (!item.due_date?.trim()) { fail++; continue }
          const res = await fetch('/api/homework', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              task_name:   item.task_name   || 'Untitled task',
              course:      item.course      || '',
              description: item.description || '',
              due_date:    item.due_date,
            }),
          })
          if (!res.ok) throw new Error()
        } else {
          if (!item.start_datetime?.trim() || !item.end_datetime?.trim()) { fail++; continue }
          const res = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_name:     item.event_name || 'Untitled event',
              start_datetime: item.start_datetime,
              end_datetime:   item.end_datetime,
              location:       item.location    || '',
              description:    item.description || '',
            }),
          })
          if (!res.ok) throw new Error()
        }
        ok++
      } catch {
        fail++
      }
    }

    setImportResult({ ok, fail })
    setImporting(false)

    // Remove successfully imported items
    if (ok > 0) {
      const importedIds = new Set(toImport.map(it => it._id))
      setItems(prev => prev.filter(it => !importedIds.has(it._id)))
    }
  }

  function resetToInput() {
    setStep('input')
    setText('')
    setItems([])
    setImportResult(null)
  }

  // ── Navigation guard ────────────────────────────────────────────────────────

  const isDirty = step === 'confirm' || (step === 'input' && text.trim().length > 0)

  const blocker = useBlocker(isDirty)

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // ── Derived ─────────────────────────────────────────────────────────────────

  const includedCount = items.filter(it => it.included).length
  const hasBlockers   = items.some(it => it.included && isMissingRequired(it).length > 0)

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: `1px solid ${theme.border}`,
    borderRadius: '16px',
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      <ConfirmModal
        isOpen={blocker.state === 'blocked'}
        title="Leave page?"
        message={
          step === 'confirm'
            ? 'You have unimported items. If you leave now, they will be lost.'
            : 'You have unsaved text. If you leave now, it will be lost.'
        }
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
        theme={theme}
      />

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Import Schedule</h1>
        <p className="text-sm text-slate-400 mt-1 font-medium">
          Paste any text — syllabus, email, class schedule — and AI will extract the tasks and events for you.
        </p>
      </div>

      {/* ── Step 1: Input ──────────────────────────────────────────────────── */}
      {step === 'input' && (
        <div style={cardStyle} className="p-6 space-y-4">
          <div>
            <textarea
              rows={10}
              maxLength={20000}
              className={`${inputFull} resize-none`}
              style={{ borderColor: theme.border }}
              placeholder={
                'Paste here :)'
              }
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <p className={`text-xs mt-1 text-right font-medium ${text.length >= 20000 ? 'text-rose-400' : 'text-slate-400'}`}>
              {text.length} / 20000
            </p>
          </div>

          {parseError && (
            <p className="text-sm font-medium text-rose-500">{parseError}</p>
          )}

          <button
            onClick={handleParse}
            disabled={parsing || !text.trim()}
            className="btn-primary px-5 py-2 text-white font-bold rounded-xl text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: theme.accent }}
          >
            {parsing ? 'Parsing…' : 'Parse with AI'}
          </button>
        </div>
      )}

      {/* ── Step 2: Confirm ────────────────────────────────────────────────── */}
      {step === 'confirm' && (
        <div className="space-y-4">

          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-700">
                {items.length} item{items.length !== 1 ? 's' : ''} found
              </span>
              <button onClick={() => toggleAll(true)}  className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer">Select all</button>
              <button onClick={() => toggleAll(false)} className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer">Deselect all</button>
            </div>
            <button onClick={resetToInput} className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer">
              Start over
            </button>
          </div>

          {/* Item cards */}
          {items.map(item => (
            <ItemCard key={item._id} item={item} theme={theme} onChange={patchItem} onExpand={expandItem} />
          ))}

          {/* Import result banner */}
          {importResult && (
            <div
              className="rounded-xl px-4 py-3 text-sm font-semibold"
              style={importResult.fail === 0
                ? { background: '#F0FFF4', color: '#15803D', border: '1px solid #CBFAAC' }
                : { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }
              }
            >
              {importResult.ok > 0 && `${importResult.ok} item${importResult.ok !== 1 ? 's' : ''} imported successfully.`}
              {importResult.fail > 0 && ` ${importResult.fail} failed — check missing fields above.`}
            </div>
          )}

          {hasBlockers && (
            <p className="text-xs font-medium text-amber-500">
              Some included items have missing required fields and will be skipped on import.
            </p>
          )}

          {/* Import button */}
          <button
            onClick={handleImport}
            disabled={importing || includedCount === 0}
            className="btn-primary px-5 py-2 text-white font-bold rounded-xl text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: theme.accent }}
          >
            {importing
              ? 'Importing…'
              : includedCount === 0
                ? 'No items selected'
                : `Import ${includedCount} item${includedCount !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      )}
    </div>
  )
}
