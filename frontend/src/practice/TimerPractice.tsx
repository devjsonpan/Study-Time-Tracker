import { useState, useEffect, useRef } from 'react'

export default function Counter () {
  const [count, setCount] = useState(10)
  const [isRunning, setIsRunning] = useState(false)
  const timer_count = useRef(0)
  const onEndRef = useRef<() => void>(() => {})

  function start() {
    setIsRunning(true)
    timer_count.current += 1
  }
  
  function pause() {
    setIsRunning(false)
  }

  function reset() {
    setIsRunning(false)
    setCount(10)
  }

  useEffect(() => {
    if (count === 0) {
      setIsRunning(false)
    }
  }, [count])

  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      setCount(c => {
        if (c <= 1) {
          clearInterval(interval)
          onEndRef.current()
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning])

  useEffect(() => {
    onEndRef.current = () => {
      console.log("Timer ended! Was running:", isRunning)
    }
  })


  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6">
      <p className="text-7xl font-bold">{count !== 0 ? count : "Done"}</p>
      <div className="flex gap-3">
        <button 
          onClick={start}
          className="px-6 py-3 rounded-xl bg-green-500 text-white font-bold cursor-pointer"
        >
          Start
        </button>
        <button 
          onClick={pause}
          className="px-6 py-3 rounded-xl bg-red-500 text-white font-bold cursor-pointer"
        >
          Pause
        </button>
        <button
          onClick={reset}
          className="px-6 py-3 rounded-xl bg-blue-500 text-white font-bold cursor-pointer"
        >
          Reset
        </button>
      </div>
      <p>The Timer has been started {timer_count.current} time(s)!</p>
    </div>
  )
}