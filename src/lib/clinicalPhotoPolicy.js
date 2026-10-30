export function getLocalDateKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function canCaptureAppointmentPhoto(appointment, photoType, totalSessions = 1, sessionNumber = 1, today = getLocalDateKey()) {
  if (!appointment) return false

  const total = Math.max(1, Number(totalSessions) || 1)
  const session = Number(sessionNumber)
  if (photoType === 'antes') {
    return appointment.fecha === today
      && ['confirmada', 'atendida'].includes(appointment.estado)
      && (total === 1 || session === 1)
  }
  if (photoType === 'despues') {
    const allowedSession = total === 1 || session >= Math.max(1, total - 2)
    const allowedState = appointment.estado === 'atendida'
      || (appointment.estado === 'confirmada' && appointment.fecha === today)
    return allowedSession && allowedState
  }
  return false
}