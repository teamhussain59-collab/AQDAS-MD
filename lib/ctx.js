// Har session (number) ka apna context: settings / data folder alag
import { AsyncLocalStorage } from 'async_hooks'
const als = new AsyncLocalStorage()
export const runAs = (sid, fn) => als.run(sid || 'main', fn)
export const currentSid = () => als.getStore() || 'main'
