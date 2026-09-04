// Summary API — fetches all analytics data computed server-side.
// The server aggregates sessions/breaks by day (handling midnight-spanning sessions),
// builds leaderboard data for group members, and generates heatmap data.

export type SummaryData = {
  current_username: string
  current_fullname: string
  has_group: boolean
  group_info: { name: string; join_code: string } | null
  // Leaderboard — parallel arrays, one entry per group member (current user first)
  friend_names: string[]
  friend_usernames: string[]
  friend_study_hours: number[]    // weekly totals
  friend_break_hours: number[]
  friend_today_study: number[]    // today only
  friend_today_break: number[]
  // All-time course breakdown
  course_labels: string[]
  course_hours: number[]
  // Daily history (study + break per day over all time)
  daily_labels: string[]
  daily_study_values: number[]
  daily_break_values: number[]
  // Today's stats
  today_course_labels: string[]
  today_course_hours: number[]
  today_study_hours: number
  today_break_hours: number
  // GitHub-style heatmap: full calendar years of study hours (from Jan 1 of first year to today)
  heatmap_data: { date: string; hours: number }[]
  current_streak: number
  longest_streak: number
}

export async function getSummary(): Promise<SummaryData> {
  const res = await fetch('/api/summary')
  if (!res.ok) throw new Error('Failed to fetch summary data')
  return res.json()
}
