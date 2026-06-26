import { Notification } from 'electron'
import { ActivityLog } from './activityLog'
import { TaskService, ZenoTask } from './taskService'

const MAX_TIMER_MS = 24 * 60 * 60 * 1000

export class NotificationService {
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly taskService: TaskService,
    private readonly log: ActivityLog
  ) {}

  status(): { supported: boolean; scheduledCount: number } {
    return {
      supported: Notification.isSupported(),
      scheduledCount: this.timers.size,
    }
  }

  refresh(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()

    const now = Date.now()
    for (const task of this.taskService.list()) {
      if (task.status === 'done') continue
      for (const reminder of task.reminders) {
        if (reminder.sentAt) continue
        const due = new Date(reminder.remindAt).getTime()
        const delay = due - now
        if (Number.isNaN(due) || delay < 0 || delay > MAX_TIMER_MS) continue

        const key = `${task.id}:${reminder.id}`
        const timer = setTimeout(() => {
          this.showReminder(task, reminder.id)
        }, delay)
        this.timers.set(key, timer)
      }
    }
  }

  private showReminder(task: ZenoTask, reminderId: string): void {
    if (Notification.isSupported()) {
      new Notification({
        title: `Zeno reminder: ${task.title}`,
        body: task.description || 'A scheduled task needs your attention.',
      }).show()
    }

    const updatedReminders = task.reminders.map(reminder =>
      reminder.id === reminderId
        ? { ...reminder, sentAt: new Date().toISOString() }
        : reminder
    )
    try {
      this.taskService.update(task.id, { reminders: updatedReminders })
      this.log.log('TASK_REMINDER_SENT', `Reminder fired for task: ${task.title}`, true)
    } catch (error) {
      this.log.log('TASK_ERROR', `Failed to update sent reminder: ${String(error)}`, false)
    } finally {
      this.timers.delete(`${task.id}:${reminderId}`)
    }
  }
}
