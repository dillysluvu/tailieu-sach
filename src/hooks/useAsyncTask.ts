import { useCallback, useState } from 'react'
import { friendlyError } from '../lib/errors'
import type { TaskStatus } from '../types'

export function useAsyncTask() {
  const [status, setStatus] = useState<TaskStatus>('idle')
  const [message, setMessage] = useState('')

  const run = useCallback(async (task: () => Promise<void>, success: string): Promise<boolean> => {
    setStatus('running')
    setMessage('Đang xử lý…')
    try {
      await task()
      setStatus('done')
      setMessage(success)
      return true
    } catch (error) {
      setStatus('error')
      setMessage(friendlyError(error))
      return false
    }
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setMessage('')
  }, [])

  return { status, message, run, reset, setMessage }
}
