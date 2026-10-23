import { attempt, log } from './utils'

const MAX_QUEUE_SIZE = 100

// Tasks wait for two things: Hellotext.initialize finishing, and the shopper
// being resolved, so every payload is built with the logged-in user.
// Payloads are built when a task runs, not when it is queued.
const state = {
  sdkReady: false,
  userResolved: false,
  tasks: [],
}

const flush = () => {
  if (!state.sdkReady || !state.userResolved) return

  while (state.tasks.length) {
    const { message, task } = state.tasks.shift()

    attempt(message, task)
  }
}

export const enqueue = (message, task) => {
  if (state.tasks.length >= MAX_QUEUE_SIZE) {
    log('warn', 'Event queue full, dropping', message)
    return
  }

  state.tasks.push({ message, task })
  flush()
}

export const track = (action, buildPayload) =>
  enqueue(`Failed to track ${action}`, () => window.Hellotext.track(action, buildPayload()))

export const identify = (id, buildData) =>
  enqueue('Failed to identify', () => window.Hellotext.identify(id, buildData()))

export const markSdkReady = () => {
  state.sdkReady = true
  flush()
}

export const markUserResolved = () => {
  state.userResolved = true
  flush()
}
