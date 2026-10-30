import { useEffect, useRef, useState } from 'react'

const preferenceKey = 'estetica:appointment-sounds-enabled'
const sounds = {
  scheduled: [{ frequency: 523.25, delay: 0 }, { frequency: 659.25, delay: 0.11 }, { frequency: 783.99, delay: 0.22 }],
  confirmed: [{ frequency: 587.33, delay: 0 }, { frequency: 783.99, delay: 0.12 }],
  attended: [{ frequency: 659.25, delay: 0 }, { frequency: 783.99, delay: 0.11 }, { frequency: 987.77, delay: 0.22 }],
  cancelled: [{ frequency: 440, delay: 0 }, { frequency: 349.23, delay: 0.12 }],
}

function readPreference() {
  try {
    return window.localStorage.getItem(preferenceKey) !== 'false'
  } catch {
    return true
  }
}

function createAudioContext() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
  return AudioContextConstructor ? new AudioContextConstructor() : null
}

function playTone(context, frequency, startTime) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const duration = 0.24

  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(frequency, startTime)
  gain.gain.setValueAtTime(0.0001, startTime)
  gain.gain.exponentialRampToValueAtTime(0.13, startTime + 0.025)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(startTime)
  oscillator.stop(startTime + duration)
}

function playSequence(context, sequence) {
  const startTime = context.currentTime + 0.015
  sequence.forEach(({ frequency, delay }) => playTone(context, frequency, startTime + delay))
}

function useAppointmentSounds() {
  const [enabled, setEnabled] = useState(readPreference)
  const contextRef = useRef(null)

  useEffect(() => {
    function unlockAudio() {
      if (!enabled) return
      try {
        contextRef.current ??= createAudioContext()
        if (contextRef.current?.state === 'suspended') void contextRef.current.resume().catch(() => {})
      } catch {
        contextRef.current = null
      }
    }

    window.addEventListener('pointerdown', unlockAudio, true)
    window.addEventListener('keydown', unlockAudio, true)
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, true)
      window.removeEventListener('keydown', unlockAudio, true)
    }
  }, [enabled])

  useEffect(() => () => {
    if (contextRef.current?.state !== 'closed') void contextRef.current?.close()
  }, [])

  function toggle() {
    setEnabled((current) => {
      const next = !current
      try {
        window.localStorage.setItem(preferenceKey, String(next))
      } catch {
        // Audio remains usable if browser storage is unavailable.
      }
      return next
    })
  }

  function play(kind) {
    if (!enabled || !sounds[kind]) return
    try {
      contextRef.current ??= createAudioContext()
      const context = contextRef.current
      if (!context) return
      if (context.state === 'suspended') {
        void context.resume().then(() => playSequence(context, sounds[kind])).catch(() => {})
        return
      }
      playSequence(context, sounds[kind])
    } catch {
      contextRef.current = null
    }
  }

  return { enabled, toggle, play }
}

export default useAppointmentSounds