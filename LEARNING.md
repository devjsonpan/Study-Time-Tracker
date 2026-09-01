# Interview Prep — Study Tracker V2

React 19 + Vite + TypeScript + Tailwind + TanStack Query + Flask API.

---

## TanStack Query

### `useQuery` vs `useMutation`

`useQuery` — for **reading** data. Runs automatically when the component mounts.
```ts
const { data, isLoading, error } = useQuery({
  queryKey: ['tasks'],
  queryFn: getTasks,        // GET /api/homework
})
```

`useMutation` — for **writing** data (create, update, delete). Does NOT run automatically — you call `.mutate(payload)` on a user action.
```ts
const deleteMutation = useMutation({
  mutationFn: deleteTask,   // DELETE /api/homework/<id>
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
})

// called inside onClick:
deleteMutation.mutate(task.id)
```

**Interview answer:** "useQuery subscribes to a cache key and fetches when the component mounts. useMutation is for side-effects — it gives you a .mutate() function you trigger manually, plus lifecycle callbacks like onSuccess."

### Why data survives navigation (the query cache)

When you visit Homework, `useQuery(['tasks'])` fetches data and stores it in TanStack Query's **global cache** — an object that lives outside any component. When you navigate away, the Homework component unmounts but the cache stays alive. When you come back, it's a cache hit — data shown instantly, no loading spinner.

```
Visit Homework  → fetch GET /api/homework → stored in cache['tasks']
Navigate away   → component unmounts, cache['tasks'] still exists
Navigate back   → cache hit → instant render, no re-fetch
```

`useState` alone wouldn't survive this — component state dies when the component unmounts. The cache is what persists.

### `staleTime` — controlling when data re-fetches

By default data goes stale immediately after fetching, so TanStack Query re-fetches in the background on remount. You can override this:

```ts
useQuery({
  queryKey: ['timezones'],
  queryFn: getTimezones,
  staleTime: Infinity,   // timezones never change — never re-fetch
})
```

**Interview answer:** "TanStack Query keeps a global cache keyed by queryKey. Navigating away doesn't clear it — data survives component unmounts. On remount, fresh cache = instant render. staleTime controls how long before a background re-fetch is triggered."

---

### Why `invalidateQueries` instead of updating local state?

After a mutation succeeds, `invalidateQueries({ queryKey: ['tasks'] })` marks that cached data as stale. TanStack Query immediately re-fetches `GET /api/homework` in the background and re-renders the list.

**Why not just update local state directly?**
```ts
// ❌ risky — local state can drift from the database
setTasks(prev => prev.filter(t => t.id !== deletedId))

// ✅ safer — always reflects server truth
queryClient.invalidateQueries({ queryKey: ['tasks'] })
```
No page reload. Just one new fetch, then React re-renders only the affected components.

**Interview answer:** "After mutations I invalidate the query cache so the UI always reflects server state. Manually updating local state is faster but risks inconsistency if the server rejected or transformed the change."

---

### `queryKey` — what is it for?

The key is a unique identity for a cached result. TanStack Query uses it to:
1. Look up existing cached data (so it doesn't re-fetch if it's fresh)
2. Know which cached data to invalidate when you call `invalidateQueries`

```ts
queryKey: ['tasks']           // all tasks
queryKey: ['tasks', taskId]   // one specific task
queryKey: ['notes']           // separate cache — unrelated to tasks
```

**Interview answer:** "The queryKey is like a cache address. Two components using the same key share the same cached data — no double fetch. When I invalidate ['tasks'], every component subscribed to that key re-fetches."

---

## React / SPA Concepts

### What is a SPA?

A **Single Page Application** loads **one HTML file once**. Every navigation is handled by JavaScript — no new HTML file is fetched from the server.

**Legacy Jinja2 version:** click "Homework" → browser requests `/homework` → server sends a whole new HTML page → full repaint.

**React SPA version:** click "Homework" → React Router swaps `<Home />` for `<Homework />` → only that component changes. The sidebar, query cache, everything else stays alive.

**Interview answer:** "A SPA loads one HTML shell upfront. React Router intercepts navigation and swaps components without a browser reload. This keeps the app fast between pages but means a heavier initial JS bundle."

### SPA tradeoffs

| Benefit | Cost |
|---|---|
| Fast navigation after first load | Slower initial load (downloads all JS first) |
| Shared state survives page changes | SEO harder (empty shell until JS runs) |
| Smooth, app-like feel | Requires client-side routing logic |

SEO matters less for authenticated apps (search engines can't log in anyway).

---

## React Patterns

### Timer with `useEffect` + `setInterval`

Used in Break Time and Study Session pages:

```ts
const [isRunning, setIsRunning] = useState(false)
const [elapsed, setElapsed] = useState(0)       // seconds ticked so far

useEffect(() => {
  if (!isRunning) return                         // do nothing when stopped
  const interval = setInterval(() => {
    setElapsed(s => s + 1)                       // functional update — avoids stale closure
  }, 1000)
  return () => clearInterval(interval)           // cleanup: stop interval on unmount or re-run
}, [isRunning])                                  // re-runs when isRunning changes
```

**Why functional update `s => s + 1` instead of `elapsed + 1`?**
`elapsed + 1` would capture the value of `elapsed` at the time the effect ran (stale closure). `s => s + 1` always gets the latest value from React's state queue.

**Interview answer:** "I track a running boolean in state. The effect sets up an interval when true and returns a cleanup function that clears it — that cleanup runs when the component unmounts OR when isRunning flips back to false."

---

### Inline edit with `useState<number | null>`

Used in Notes page to track which card is in edit mode:

```ts
const [editingId, setEditingId] = useState<number | null>(null)

// In the card:
{editingId === note.id ? <EditForm /> : <NoteContent />}

// Toggle:
onClick={() => setEditingId(editingId === note.id ? null : note.id)}
```

Only one card can be in edit mode at a time — setting a new `editingId` automatically collapses the previous one.

**Interview answer:** "I use a single piece of state holding the ID of whichever row is editing. Null means nothing is editing. Comparing `editingId === item.id` in the render decides whether to show the form or the read view."

### Why `<number | null>` and why `null` not `0` or `-1`?

`<number | null>` is a TypeScript union type — the state can be either a number or null. The `|` means "or". Without it TypeScript would infer the type as just `null` from the initial value and complain when you try to set it to a number.

`null` as initial value = "nothing is currently selected." It's unambiguous — task IDs are real positive integers, so `0` or `-1` could theoretically conflict. `null` explicitly means absence of a value, not a bad ID.

**Interview answer:** "Union types like `number | null` let you express that a value is intentionally absent. null is cleaner than a sentinel value like -1 because it can't accidentally match a real ID."

---

### `import type { X }` — why is this required?

TypeScript types are erased at compile time. In browser ESM, if you `import { Event }` and `Event` is only a type (no runtime value), Vite strips it — then the browser tries to find a named export called `Event` and crashes:

```
SyntaxError: does not provide an export named 'Event'
```

Fix: tell the compiler it's type-only so it gets erased before bundling:
```ts
import { getEvents } from '../api/events'     // runtime function — stays
import type { Event } from '../api/events'    // type only — erased at build time
```

**Interview answer:** "TypeScript's `import type` is erased entirely by the compiler and never appears in the output JS. Without it, the bundler keeps the import and the browser fails to resolve a name that doesn't exist at runtime."

---

### Auth gate in Layout.tsx

Every protected page goes through `Layout`. It runs one query:

```ts
const { data: user, isLoading, error } = useQuery({
  queryKey: ['me'],
  queryFn: getMe,       // GET /api/auth/me — returns 401 if not logged in
  retry: false,
})

useEffect(() => {
  if (error) navigate('/login', { replace: true })
}, [error, navigate])
```

`retry: false` is important — without it, TanStack Query would retry 3 times before failing, causing a 3-second delay on the redirect.

**Interview answer:** "Layout wraps all protected routes via React Router's nested route pattern. It fetches /api/auth/me on mount — a 401 triggers a useEffect that redirects to login. The protected page content only renders once we have a confirmed user."

---

### Custom calendar without a library

The Calendar page replaces FullCalendar (broken with React 19) with a pure React implementation:

1. **`buildMonthGrid(year, month)`** — returns a flat array of 35–42 day cells, padded with prev/next month days to complete Mon–Sun rows.
2. **`groupByDate(events)`** — builds a `{ "YYYY-MM-DD": [...events] }` map once per render, so each cell does an O(1) lookup.
3. **Today highlight** — `isToday(date)` compares local date strings (not `toISOString()` which converts to UTC and can shift the day for UTC+ users).

---

## Flask API Patterns

### What is Flask `session`?

`session` is a **server-side dictionary that persists between requests** for one user. When you log in, Flask saves data into it:

```python
session['username'] = user.username  # stored on disk, tied to a browser cookie
```

On every subsequent request, the browser sends a cookie → Flask looks up the matching session file → you get back the dictionary. Your app uses `SESSION_TYPE = 'filesystem'`, so session data is saved as files on the server. The cookie only holds an ID pointing to that file (not the data itself).

### Auth guard on every protected route

```python
if session.get('username') == None:
    return redirect(url_for('login'))
```

**Why `.get('username')` not `session['username']`?**

```python
session['username']      # crashes with KeyError if key doesn't exist
session.get('username')  # returns None safely if key doesn't exist
```

If the user isn't logged in, `'username'` was never set. Direct access would crash the route. `.get()` returns None, which triggers the redirect cleanly.

For JSON API routes, return 401 instead of redirecting:
```python
username = session.get('username')
if not username:
    return jsonify({'error': 'Not logged in'}), 401
```

**Interview answer:** "Flask session is a server-side dictionary identified by a browser cookie. `.get()` is used instead of direct key access because it returns None for missing keys instead of raising a KeyError."

### Ownership check before any mutation

```python
task = HomeworkTask.query.get_or_404(task_id)
if task.username != session['username']:
    return jsonify({'error': 'Forbidden'}), 403
```

Never skip this — without it the app is vulnerable to **IDOR (Insecure Direct Object Reference)**, one of the OWASP Top 10.

**The attack:** Jason is logged in. He sends `DELETE /api/homework/43` — Sarah's task ID. Without the ownership check, the server just trusts the ID and deletes it. Jason is authenticated so the 401 check passes, but he's not authorized to touch Sarah's data.

**Key distinction:**
- **Authentication** (401) = proving who you are — "are you logged in?"
- **Authorization** (403) = proving what you're allowed to do — "is this yours?"

They're separate checks. Authentication alone is not enough.

**Interview answer:** "Without an ownership check this is an IDOR vulnerability — an attacker changes the ID in the URL to target another user's resource. Authentication proves identity; authorization proves permission. You need both."

---

## HTTP Methods

What action you're performing on a resource:

| Method | Meaning | Example in this app |
|---|---|---|
| `GET` | Read data — no changes to server | `GET /api/homework` — fetch all tasks |
| `POST` | Create something new | `POST /api/homework` — add a task |
| `PUT` | Replace/update an existing thing | `PUT /api/homework/5` — edit task #5 |
| `PATCH` | Partial update (only changed fields) | not used here — PUT covers it |
| `DELETE` | Remove something | `DELETE /api/homework/5` — delete task #5 |

Rule: GET never changes data. POST = create. PUT/PATCH = update. DELETE = remove.

**Interview answer:** "REST APIs use HTTP verbs to express intent. GET reads without side effects. POST creates. PUT replaces a resource. DELETE removes it. The URL identifies the resource; the verb identifies the action."

---

## HTTP Status Codes

The server's response to your request:

| Code | Meaning | When you see it |
|---|---|---|
| `200` | OK — success | GET, PUT, DELETE worked |
| `201` | Created — new resource made | POST succeeded |
| `400` | Bad Request — you sent wrong/missing data | missing required field |
| `401` | Unauthorized — not logged in | `/api/auth/me` with no session |
| `403` | Forbidden — logged in but not allowed | editing someone else's task |
| `404` | Not Found | task ID doesn't exist in the DB |
| `500` | Server Error — Flask crashed | unhandled exception in a route |

How Flask returns them:
```python
return jsonify({'error': 'Not logged in'}), 401   # tuple: (body, status_code)
return jsonify({'error': 'Forbidden'}),    403
return jsonify(task.to_dict()),            200     # 200 is the default if omitted
```

**Interview answer:** "2xx means success. 4xx means the client did something wrong — 401 is unauthenticated, 403 is unauthorized (you're logged in but don't have permission), 404 is not found. 5xx means the server failed."

### 400 vs 500 — whose fault?

- **400 Bad Request** = client's fault — you sent wrong/missing data
- **500 Server Error** = server's fault — Flask crashed, unhandled exception, DB failed

```python
if not data.get('course'):
    return jsonify({'error': 'course is required'}), 400  # client sent bad data
# if Flask throws an unhandled exception → automatically becomes 500
```

Rule: if the request was bad → 4xx. If the server broke while handling a valid request → 5xx.

---

### Why you need auth checks on BOTH Flask and React

Flask checks `session.get('username')` on every API route. React checks `/api/auth/me` in Layout.tsx. Both are needed for different reasons:

| Layer | Job | Without it |
|---|---|---|
| Flask session check | Actually protect the data | API is wide open — anyone calls it directly from DevTools |
| React auth gate | Good user experience | Logged-out users see broken pages with empty data |

Flask is the **real security**. React is **UX**. You can never trust the frontend alone — it runs in the browser and can be bypassed. Anyone can open DevTools and call your API directly, skipping React entirely.

**Interview answer:** "Backend auth is the actual security layer — it protects data regardless of what the client does. Frontend auth is UX — it redirects unauthenticated users so they don't see broken pages. Never trust the client; the server is always the source of truth for security."

---

## Datetimes and Timezones

### Naive vs timezone-aware datetimes

A **naive** datetime has no timezone info attached — it's just numbers. Python's `datetime.isoformat()` on a naive datetime produces no timezone marker:

```python
datetime(2024, 8, 17, 18, 0, 0).isoformat()  # → "2024-08-17T18:00:00"
```

This app stores study/break datetimes as naive UTC — they're always UTC, but the string doesn't say so.

### The Z suffix and browser parsing

`Z` at the end of a datetime string means UTC (it's part of ISO 8601). Browsers parse datetimes differently depending on whether `Z` is present:

```js
new Date("2024-08-17T18:00:00")   // no Z → treated as LOCAL time (wrong if value is UTC)
new Date("2024-08-17T18:00:00Z")  // Z → treated as UTC, then converted to local for display
```

**The bug this caused:** frontend sends `toISOString().slice(0, 19)` — always UTC but strips the `Z`. Backend stores it. Backend returns it with no `Z`. Browser treats it as local → displays wrong time for anyone not in UTC.

**The fix:** backend appends `'Z'` to session/break datetime strings in API responses. `toLocaleDateString()` then automatically converts UTC → user's local time.

### Why homework/events were NOT changed

Homework and event datetimes are typed by the user into a `datetime-local` input, which gives **local time** — not UTC. So they're stored as local, returned as local, displayed as local. No conversion needed. Adding `Z` would break them (browser would treat local time as UTC and shift it).

**Interview answer:** "Study sessions are auto-recorded using `toISOString()` which is always UTC. Homework datetimes come from a datetime-local input which is local time. Different sources, different timezone semantics — only the UTC ones need the Z marker."

---

## Database Migrations

### What is a migration?

When you change a SQLAlchemy model (add/remove/rename a column), the database doesn't update automatically. A migration is a Python script that describes the change and applies it to the DB.

Flask-Migrate (powered by Alembic) handles this:

```bash
flask db migrate -m "add column X"   # compares models to DB → generates migration file
flask db upgrade                      # applies the migration to the actual DB
```

### What a migration file looks like

```python
def upgrade():
    op.add_column('study_session', sa.Column('source', sa.String(10)))

def downgrade():
    op.drop_column('study_session', 'source')
```

Both `upgrade()` and `downgrade()` are generated so you can roll back. Alembic tracks which migrations have run in an `alembic_version` table in the DB.

### What happens if you forget to migrate

Flask starts fine — it doesn't validate models against the DB on startup. The crash only happens when a request actually touches the missing column → SQLAlchemy throws a 500. The app looks healthy until that specific feature is used.

**Interview answer:** "Migrations are versioned scripts that keep the DB schema in sync with your models. Flask-Migrate auto-generates them by diffing your models against the current schema. Forgetting to run upgrade doesn't break startup — it breaks at runtime when a query hits the missing column."

---

## React Patterns (continued)

### `useRef` — when to use it instead of `useState`

`useState` triggers a re-render when it changes. `useRef` does not — it's a mutable box that persists across renders without causing re-renders.

Two main use cases:

**1. Storing a value you need across renders but don't want to trigger re-renders:**
```ts
const startTimeRef = useRef<Date | null>(null)
startTimeRef.current = new Date()   // no re-render
```

**2. Avoiding stale closures in intervals/timeouts:**

```ts
// Problem: setInterval captures `phase` at the time the effect ran (stale closure)
setInterval(() => {
  if (phase === 'studying') { ... }   // phase is frozen at its value from effect setup
}, 1000)

// Fix: callback ref — updated every render, read inside the interval
const onTimerEndRef = useRef<() => void>(() => {})
useEffect(() => {
  onTimerEndRef.current = () => {
    if (phase === 'studying') { ... }   // always reads current phase
  }
})  // runs every render — no deps array

setInterval(() => {
  onTimerEndRef.current()   // calls whatever the latest version of the function is
}, 1000)
```

**Interview answer:** "useRef gives you a mutable box that persists across renders without triggering re-renders. I use it for values I need to read inside setInterval callbacks — because the interval captures a stale closure, but reading from a ref always gives you the latest value."

---

### Fire-and-forget async calls

Sometimes you need to trigger an API call but don't want to block the UI waiting for it — and it's okay if it fails silently.

```ts
// Auto-log a break when the pomo timer ends — non-critical if it fails
createBreak({ start_datetime: ..., end_datetime: ... })
  .catch(() => {})   // swallow the error — break logging is best-effort
```

Used in the Pomodoro timer when a break ends. The UI advances to the next round immediately — the break logging happens in the background.

**Interview answer:** "Fire-and-forget is appropriate for non-critical side effects where failure doesn't affect the user's next action. You still attach `.catch(() => {})` to avoid unhandled promise rejections."

---

### Navigation guard with `useBlocker`

`useBlocker` intercepts in-app navigation (clicking a link, pressing back) when you have unsaved state.

```ts
const blocker = useBlocker(isDirty)   // isDirty = true when pomo is running

useEffect(() => {
  if (blocker.state === 'blocked') setShowConfirmModal(true)
}, [blocker.state])

// In the modal:
blocker.proceed?.()   // let navigation happen
blocker.reset?.()     // cancel navigation, stay on page
```

For browser tab close / refresh, you need a separate `beforeunload` listener — `useBlocker` only covers React Router navigation:

```ts
useEffect(() => {
  if (!isDirty) return
  const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}, [isDirty])
```

**Important:** `useBlocker` only works with `createBrowserRouter` (the data router). It does not work with the older `<BrowserRouter>` component.

**Interview answer:** "useBlocker intercepts React Router navigation when there's unsaved state. It gives you a blocker object with .proceed() and .reset() to either allow or cancel the navigation. For browser-level events like tab close, you still need beforeunload — they're separate concerns."

---

*Add to this file as we cover more topics.*
