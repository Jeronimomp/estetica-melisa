import { supabase } from '@/lib/supabase'

const COLOMBIAN_HOLIDAYS = new Set([
  '2025-01-01', '2025-01-06', '2025-03-24', '2025-04-17', '2025-04-18',
  '2025-05-01', '2025-06-02', '2025-06-23', '2025-06-30', '2025-07-20',
  '2025-08-07', '2025-08-18', '2025-10-13', '2025-11-03', '2025-11-17',
  '2025-12-08', '2025-12-25',
  '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03',
  '2026-05-01', '2026-05-18', '2026-06-08', '2026-06-29', '2026-07-20',
  '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16',
  '2026-12-08', '2026-12-25',
  '2027-01-01', '2027-01-11', '2027-03-22', '2027-03-25', '2027-03-26',
  '2027-05-01', '2027-05-10', '2027-05-31', '2027-06-07', '2027-07-05',
  '2027-07-20', '2027-08-07', '2027-08-16', '2027-10-18', '2027-11-01',
  '2027-11-15', '2027-12-08', '2027-12-25',
])

function pad(value) {
  return String(value).padStart(2, '0')
}

function parseDate(date) {
  const [year, month, day] = String(date).slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) throw new Error('Selecciona una fecha válida.')
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function addDays(date, days) {
  const result = parseDate(date)
  result.setUTCDate(result.getUTCDate() + days)
  return formatDate(result)
}

function isBusinessDay(date) {
  const dayOfWeek = parseDate(date).getUTCDay()
  return dayOfWeek !== 0 && dayOfWeek !== 6 && !COLOMBIAN_HOLIDAYS.has(date)
}

function nextBusinessDay(date) {
  let result = date
  while (!isBusinessDay(result)) result = addDays(result, 1)
  return result
}

function parseTime(time) {
  const match = /^(\d{2}):(\d{2})/.exec(String(time ?? ''))
  if (!match) throw new Error('Selecciona una hora válida.')
  return Number(match[1]) * 60 + Number(match[2])
}

function formatTime(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

export function ajustarHorarioAtencion(fecha, hora) {
  let date = nextBusinessDay(fecha)
  let minutes = parseTime(hora)

  if (minutes < 8 * 60) minutes = 8 * 60
  else if (minutes >= 12 * 60 && minutes < 14 * 60) minutes = 14 * 60
  else if (minutes >= 18 * 60) {
    date = nextBusinessDay(addDays(date, 1))
    minutes = 8 * 60
  }

  return { fecha: date, hora: formatTime(minutes) }
}

export function sumarMinutos(fecha, hora, minutos) {
  const total = parseTime(hora) + Number(minutos)
  const dayOffset = Math.floor(total / (24 * 60))
  return {
    fecha: addDays(fecha, dayOffset),
    hora: formatTime(total - dayOffset * 24 * 60),
  }
}

export function calcularSesiones(fecha, hora, intervaloDias, totalSesiones, duracionMinutos) {
  const interval = Number(intervaloDias)
  const total = Number(totalSesiones)
  const duration = Number(duracionMinutos)
  if (!Number.isInteger(interval) || interval < 1 || interval > 60) throw new Error('El intervalo debe ser de 1 a 60 días.')
  if (!Number.isInteger(total) || total < 1) throw new Error('El servicio no tiene un número válido de sesiones.')
  if (!Number.isFinite(duration) || duration < 1) throw new Error('El servicio no tiene una duración válida.')

  let sessionDate = fecha
  return Array.from({ length: total }, (_, index) => {
    if (index > 0) sessionDate = addDays(sessionDate, interval)
    const adjusted = ajustarHorarioAtencion(sessionDate, hora)
    sessionDate = adjusted.fecha
    return {
      numero: index + 1,
      fecha: adjusted.fecha,
      horaInicio: adjusted.hora,
      horaFin: formatTime(parseTime(adjusted.hora) + duration),
      estado: 'checking',
      mensaje: 'Verificando disponibilidad…',
    }
  })
}

export async function verificarDisponibilidad(profesionalId, fecha, horaInicio, horaFin, citaIdExcluir) {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')

  let query = supabase
    .from('citas')
    .select('id, estado, hora_inicio, hora_fin')
    .eq('profesional_id', profesionalId)
    .eq('fecha', fecha)
    .in('estado', ['pendiente', 'confirmada'])
    .lt('hora_inicio', `${horaFin.slice(0, 5)}:00`)
    .gt('hora_fin', `${horaInicio.slice(0, 5)}:00`)

  if (citaIdExcluir) query = query.neq('id', citaIdExcluir)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}