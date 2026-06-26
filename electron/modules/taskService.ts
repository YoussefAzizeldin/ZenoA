import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { ActivityLog } from './activityLog'
import { EmailSourceMetadata, TaskPriority, TaskStatus } from './emailTypes'

export interface TaskReminder {
  id: string
  remindAt: string
  label: string
  sentAt?: string
}

export interface ZenoTask {
  id: string
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  dueDate?: string
  scheduledTime?: string
  reminders: TaskReminder[]
  source: 'manual' | 'email' | 'schedule' | 'whatsapp'
  linkedEmail?: EmailSourceMetadata
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  title: string
  description?: string
  priority?: TaskPriority
  status?: TaskStatus
  dueDate?: string
  scheduledTime?: string
  reminders?: TaskReminder[]
  reminderAt?: string
  source?: ZenoTask['source']
  linkedEmail?: EmailSourceMetadata
}

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, 'linkedEmail'>> & {
  linkedEmail?: EmailSourceMetadata
}

function getDataPath(fileName: string): string {
  if (process.env.NODE_ENV === 'development') {
    return path.join(process.cwd(), fileName)
  }
  return path.join(app.getPath('userData'), fileName)
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizePriority(priority?: string): TaskPriority {
  if (priority === 'low' || priority === 'medium' || priority === 'high' || priority === 'urgent') return priority
  return 'medium'
}

function normalizeStatus(status?: string): TaskStatus {
  if (status === 'todo' || status === 'in-progress' || status === 'blocked' || status === 'done') return status
  return 'todo'
}

export class TaskService {
  private tasks: ZenoTask[] = []
  private readonly filePath = getDataPath('zeno.tasks.json')

  constructor(private readonly log: ActivityLog) {
    this.load()
  }

  list(): ZenoTask[] {
    return [...this.tasks].sort((a, b) => {
      const aKey = `${a.dueDate || '9999-99-99'} ${a.scheduledTime || '99:99'}`
      const bKey = `${b.dueDate || '9999-99-99'} ${b.scheduledTime || '99:99'}`
      return aKey.localeCompare(bKey)
    })
  }

  get(id: string): ZenoTask | undefined {
    return this.tasks.find(task => task.id === id)
  }

  create(input: CreateTaskInput): ZenoTask {
    if (!input.title?.trim()) {
      throw new Error('Task title is required.')
    }

    const now = new Date().toISOString()
    const reminders = this.normalizeReminders(input.reminders, input.reminderAt)
    const task: ZenoTask = {
      id: makeId('task'),
      title: input.title.trim(),
      description: input.description?.trim() || '',
      priority: normalizePriority(input.priority),
      status: normalizeStatus(input.status),
      dueDate: input.dueDate || undefined,
      scheduledTime: input.scheduledTime || undefined,
      reminders,
      source: input.source || 'manual',
      linkedEmail: input.linkedEmail,
      createdAt: now,
      updatedAt: now,
    }

    this.tasks.unshift(task)
    this.save()
    this.log.log('TASK_CREATED', `Task created: ${task.title}`, true, undefined, undefined, task.linkedEmail?.from)
    return task
  }

  update(id: string, input: UpdateTaskInput): ZenoTask {
    const existing = this.get(id)
    if (!existing) throw new Error('Task not found.')

    const next: ZenoTask = {
      ...existing,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      description: input.description !== undefined ? input.description.trim() : existing.description,
      priority: input.priority !== undefined ? normalizePriority(input.priority) : existing.priority,
      status: input.status !== undefined ? normalizeStatus(input.status) : existing.status,
      dueDate: input.dueDate !== undefined ? input.dueDate || undefined : existing.dueDate,
      scheduledTime: input.scheduledTime !== undefined ? input.scheduledTime || undefined : existing.scheduledTime,
      reminders: input.reminders !== undefined || input.reminderAt !== undefined
        ? this.normalizeReminders(input.reminders, input.reminderAt)
        : existing.reminders,
      source: input.source || existing.source,
      linkedEmail: input.linkedEmail !== undefined ? input.linkedEmail : existing.linkedEmail,
      updatedAt: new Date().toISOString(),
    }

    if (!next.title) throw new Error('Task title is required.')
    this.tasks = this.tasks.map(task => task.id === id ? next : task)
    this.save()
    this.log.log('TASK_UPDATED', `Task updated: ${next.title}`, true)
    return next
  }

  remove(id: string): boolean {
    const existing = this.get(id)
    if (!existing) return false
    this.tasks = this.tasks.filter(task => task.id !== id)
    this.save()
    this.log.log('TASK_DELETED', `Task deleted: ${existing.title}`, true)
    return true
  }

  replaceAll(tasks: ZenoTask[]): void {
    this.tasks = tasks
    this.save()
  }

  private normalizeReminders(reminders?: TaskReminder[], reminderAt?: string): TaskReminder[] {
    if (reminders) {
      return reminders
        .filter(reminder => !!reminder.remindAt)
        .map(reminder => ({
          id: reminder.id || makeId('reminder'),
          remindAt: reminder.remindAt,
          label: reminder.label || 'Task reminder',
          sentAt: reminder.sentAt,
        }))
    }
    if (reminderAt) {
      return [{ id: makeId('reminder'), remindAt: reminderAt, label: 'Task reminder' }]
    }
    return []
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.tasks = []
        return
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      this.tasks = Array.isArray(parsed) ? parsed : []
    } catch (error) {
      this.tasks = []
      this.log.log('TASK_ERROR', `Failed to load task store: ${String(error)}`, false)
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.tasks, null, 2), 'utf-8')
    } catch (error) {
      this.log.log('TASK_ERROR', `Failed to save task store: ${String(error)}`, false)
    }
  }
}
