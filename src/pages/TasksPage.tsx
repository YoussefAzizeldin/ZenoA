import { useEffect, useMemo, useState } from 'react'
import type { CreateTaskInput, ScheduleSnapshot, TaskPriority, TaskStatus, ZenoTask } from '../types'

type StatusMsg = { type: 'success' | 'error' | 'info'; text: string } | null

interface TaskForm {
  title: string
  description: string
  priority: TaskPriority
  dueDate: string
  scheduledTime: string
  reminderAt: string
}

function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

function formatTaskDate(task: ZenoTask): string {
  return task.scheduledTime?.slice(0, 10) || task.dueDate || 'Unscheduled'
}

function formatTaskTime(task: ZenoTask): string {
  return task.scheduledTime ? task.scheduledTime.slice(11, 16) : ''
}

function priorityClass(priority: TaskPriority): string {
  return `priority-${priority}`
}

const emptyForm: TaskForm = {
  title: '',
  description: '',
  priority: 'medium',
  dueDate: '',
  scheduledTime: '',
  reminderAt: '',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<ZenoTask[]>([])
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null)
  const [selectedDate, setSelectedDate] = useState(localDateKey())
  const [form, setForm] = useState<TaskForm>(emptyForm)
  const [scheduleForm, setScheduleForm] = useState({ date: localDateKey(), startTime: '09:00', slotMinutes: 60 })
  const [status, setStatus] = useState<StatusMsg>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [notificationStatus, setNotificationStatus] = useState<{ supported: boolean; scheduledCount: number } | null>(null)

  useEffect(() => {
    void refresh()
  }, [selectedDate])

  const refresh = async () => {
    const [taskList, scheduleSnapshot, notifications] = await Promise.all([
      window.zeno.tasks.list(),
      window.zeno.schedule.snapshot(selectedDate),
      window.zeno.notifications.status(),
    ])
    setTasks(taskList)
    setSnapshot(scheduleSnapshot)
    setNotificationStatus(notifications)
  }

  const visibleTasks = useMemo(() => tasks.filter(task => task.status !== 'done'), [tasks])
  const doneTasks = useMemo(() => tasks.filter(task => task.status === 'done'), [tasks])
  const calendarDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index)), [selectedDate])

  const createTask = async () => {
    if (!form.title.trim()) {
      setStatus({ type: 'error', text: 'Task title is required.' })
      return
    }

    setLoading('create')
    try {
      const payload: CreateTaskInput = {
        title: form.title,
        description: form.description,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        scheduledTime: form.scheduledTime ? `${form.scheduledTime}:00` : undefined,
        reminderAt: form.reminderAt ? `${form.reminderAt}:00` : undefined,
        source: 'manual',
      }
      const result = await window.zeno.tasks.create(payload)
      setForm(emptyForm)
      setStatus({ type: 'success', text: `Task created: ${result.task.title}` })
      await refresh()
    } catch (error) {
      setStatus({ type: 'error', text: String(error) })
    } finally {
      setLoading(null)
    }
  }

  const updateStatus = async (task: ZenoTask, statusValue: TaskStatus) => {
    await window.zeno.tasks.update(task.id, { status: statusValue })
    await refresh()
  }

  const deleteTask = async (task: ZenoTask) => {
    const ok = await window.zeno.confirm.dialog('Delete Task', `Delete "${task.title}"?`)
    if (!ok) return
    await window.zeno.tasks.delete(task.id)
    await refresh()
  }

  const buildSchedule = async () => {
    setLoading('schedule')
    try {
      const result = await window.zeno.schedule.make(scheduleForm)
      setStatus({ type: 'success', text: `Scheduled ${result.tasks.length} task(s).` })
      setSelectedDate(scheduleForm.date)
      await refresh()
    } catch (error) {
      setStatus({ type: 'error', text: String(error) })
    } finally {
      setLoading(null)
    }
  }

  const TaskRow = ({ task }: { task: ZenoTask }) => (
    <div className="task-row">
      <div className={`task-priority-dot ${priorityClass(task.priority)}`} />
      <div className="task-row-main">
        <div className="task-row-title">{task.title}</div>
        {task.description && <div className="task-row-desc selectable">{task.description}</div>}
        <div className="task-row-meta">
          <span>{formatTaskDate(task)} {formatTaskTime(task)}</span>
          <span>{task.source}</span>
          {task.linkedEmail && <span>{task.linkedEmail.from}</span>}
          {task.reminders.length > 0 && <span>{task.reminders.length} reminder(s)</span>}
        </div>
      </div>
      <select className="form-select task-status-select" value={task.status} onChange={e => updateStatus(task, e.target.value as TaskStatus)}>
        <option value="todo">Todo</option>
        <option value="in-progress">In progress</option>
        <option value="blocked">Blocked</option>
        <option value="done">Done</option>
      </select>
      <button className="btn-icon" title="Delete task" onClick={() => deleteTask(task)}>x</button>
    </div>
  )

  const CalendarDay = ({ date }: { date: string }) => {
    const dayTasks = visibleTasks.filter(task => formatTaskDate(task) === date)
    return (
      <div className="calendar-day">
        <div className="calendar-day-header">
          <span>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
          <strong>{date.slice(5)}</strong>
        </div>
        <div className="calendar-task-list">
          {dayTasks.length === 0 ? (
            <span className="calendar-empty">Open</span>
          ) : dayTasks.map(task => (
            <div key={task.id} className={`calendar-task ${priorityClass(task.priority)}`}>
              <span>{formatTaskTime(task) || '--:--'}</span>
              <strong>{task.title}</strong>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">Local tasks, calendar, reminders, and schedule maker</p>
        </div>
        <div className="page-header-badge">
          {visibleTasks.length} active / {doneTasks.length} done
        </div>
      </div>

      {status && <div className={`conn-status ${status.type}`}>{status.text}</div>}

      <div className="tasks-top-grid">
        <div className="card">
          <div className="card-header">Create Task</div>
          <div className="card-body">
            <div className="form-group">
              <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Task title" />
            </div>
            <div className="form-group">
              <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" />
            </div>
            <div className="form-row">
              <select className="form-select" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as TaskPriority })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <input className="form-input" type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
              <input className="form-input" type="datetime-local" value={form.scheduledTime} onChange={e => setForm({ ...form, scheduledTime: e.target.value })} />
              <input className="form-input" type="datetime-local" value={form.reminderAt} onChange={e => setForm({ ...form, reminderAt: e.target.value })} />
            </div>
            <div className="page-actions">
              <button className="btn btn-primary btn-sm" disabled={loading === 'create'} onClick={createTask}>
                {loading === 'create' ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Schedule Maker</div>
          <div className="card-body">
            <div className="task-stat-row">
              <div>
                <span className="task-stat-value">{snapshot?.overdue.length || 0}</span>
                <span className="task-stat-label">Overdue</span>
              </div>
              <div>
                <span className="task-stat-value">{snapshot?.today.length || 0}</span>
                <span className="task-stat-label">Selected day</span>
              </div>
              <div>
                <span className="task-stat-value">{notificationStatus?.scheduledCount || 0}</span>
                <span className="task-stat-label">Reminders</span>
              </div>
            </div>
            <div className="form-row">
              <input className="form-input" type="date" value={scheduleForm.date} onChange={e => setScheduleForm({ ...scheduleForm, date: e.target.value })} />
              <input className="form-input" type="time" value={scheduleForm.startTime} onChange={e => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} />
              <input className="form-input" type="number" min={15} max={180} step={15} value={scheduleForm.slotMinutes} onChange={e => setScheduleForm({ ...scheduleForm, slotMinutes: Number(e.target.value) || 60 })} />
              <button className="btn btn-secondary btn-sm" disabled={loading === 'schedule'} onClick={buildSchedule}>
                {loading === 'schedule' ? 'Scheduling...' : 'Build'}
              </button>
            </div>
            {notificationStatus && !notificationStatus.supported && (
              <div className="conn-status error">Desktop notifications are not supported by this runtime.</div>
            )}
          </div>
        </div>
      </div>

      <div className="tasks-calendar-panel">
        <div className="calendar-toolbar">
          <div>
            <div className="section-header" style={{ marginBottom: 4 }}>Calendar</div>
            <input className="form-input calendar-date-input" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
        </div>
        <div className="calendar-grid">
          {calendarDays.map(date => <CalendarDay key={date} date={date} />)}
        </div>
      </div>

      <div className="task-list-panel">
        <div className="section-header">Active Tasks</div>
        {visibleTasks.length === 0 ? (
          <div className="empty-state-sm">No active tasks.</div>
        ) : (
          <div className="task-list">
            {visibleTasks.map(task => <TaskRow key={task.id} task={task} />)}
          </div>
        )}
      </div>
    </div>
  )
}
