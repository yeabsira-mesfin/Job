// UTC calendar days, matching persisted YYYY-MM-DD dates. Reminders apply only
// while an opportunity is saved: submitted applications no longer need applying.
export function deadlineState(row, today = new Date().toISOString().slice(0, 10)) {
  if (row.status !== 'saved' || !row.deadline) return null;
  const days = Math.round((Date.parse(row.deadline) - Date.parse(today)) / 86400000);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'soon';
  return 'later';
}

export function deadlineReminders(rows, today) {
  return rows.filter(row => ['overdue', 'today', 'soon'].includes(deadlineState(row, today)))
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.company.localeCompare(b.company));
}
