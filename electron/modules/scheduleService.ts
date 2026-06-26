import { ActivityLog } from './activityLog'
import { TaskService, ZenoTask } from './taskService'

export interface ScheduleSection {
  title: string
  tasks: ZenoTask[]
}

export interface ScheduleSnapshot {
  date: string
  overdue: ZenoTask[]
  today: ZenoTask[]
  upcoming: ZenoTask[]
  unscheduled: ZenoTask[]
}

export interface ScheduleMakerInput {
  date: string
  startTime?: string
  slotMinutes?: number
  taskIds?: string[]
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addMinutes(time: string, minutes: number): string {
  const [hourRaw, minuteRaw] = time.split(':')
  const base = new Date()
  base.setHours(Number(hourRaw) || 9, Number(minuteRaw) || 0, 0, 0)
  base.setMinutes(base.getMinutes() + minutes)
  return `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`
}

export class ScheduleService {
  constructor(
    private readonly taskService: TaskService,
    private readonly log: ActivityLog
  ) {}

  snapshot(date = toDateKey(new Date())): ScheduleSnapshot {
    const tasks = this.taskService.list().filter(task => task.status !== 'done')
    const today = tasks.filter(task => task.dueDate === date || task.scheduledTime?.startsWith(`${date}T`))
    const overdue = tasks.filter(task => task.dueDate && task.dueDate < date)
    const upcoming = tasks
      .filter(task => task.dueDate && task.dueDate > date)
      .slice(0, 30)
    const unscheduled = tasks.filter(task => !task.dueDate && !task.scheduledTime)
    return { date, overdue, today, upcoming, unscheduled }
  }

  makeSchedule(input: ScheduleMakerInput): ZenoTask[] {
    const date = input.date || toDateKey(new Date())
    const slotMinutes = Math.max(15, Math.min(180, input.slotMinutes || 60))
    const startTime = input.startTime || '09:00'
    const selected = this.taskService.list().filter(task => {
      if (task.status === 'done') return false
      if (input.taskIds?.length) return input.taskIds.includes(task.id)
      return !task.scheduledTime && (!task.dueDate || task.dueDate <= date)
    })

    let currentTime = startTime
    const updated: ZenoTask[] = []
    for (const task of selected.slice(0, 10)) {
      const scheduled = this.taskService.update(task.id, {
        dueDate: task.dueDate || date,
        scheduledTime: `${date}T${currentTime}:00`,
        source: task.source,
      })
      updated.push(scheduled)
      currentTime = addMinutes(currentTime, slotMinutes)
    }

    this.log.log('TASK_SCHEDULED', `Schedule maker placed ${updated.length} task(s) on ${date}`, true)
    return updated
  }
}
