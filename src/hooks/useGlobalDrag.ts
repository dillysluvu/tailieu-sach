import { useEffect, useRef, useState } from 'react'

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

export function useGlobalDrag(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false)
  const counter = useRef(0)
  const callback = useRef(onFiles)

  useEffect(() => {
    callback.current = onFiles
  }, [onFiles])

  useEffect(() => {
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      counter.current += 1
      setDragging(true)
    }

    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault()
    }

    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      counter.current = Math.max(0, counter.current - 1)
      if (counter.current === 0) setDragging(false)
    }

    const drop = (event: DragEvent) => {
      if (counter.current) {
        counter.current = 0
        setDragging(false)
      }
      // Dropzone/row đã xử lý và gọi preventDefault — không xử lý lại.
      if (event.defaultPrevented || !hasFiles(event)) return
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length) callback.current(files)
    }

    const end = () => {
      counter.current = 0
      setDragging(false)
    }

    const leaveWindow = (event: DragEvent) => {
      if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
        end()
      }
    }

    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragleave', leaveWindow)
    window.addEventListener('drop', drop)
    window.addEventListener('dragend', end)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragleave', leaveWindow)
      window.removeEventListener('drop', drop)
      window.removeEventListener('dragend', end)
    }
  }, [])

  return dragging
}
