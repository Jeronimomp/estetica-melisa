import { supabase } from '@/lib/supabase'

export const civilStatusOptions = [
  { value: 'soltero', label: 'Soltero/a' },
  { value: 'casado', label: 'Casado/a' },
  { value: 'union_libre', label: 'Unión libre' },
  { value: 'divorciado', label: 'Divorciado/a' },
  { value: 'viudo', label: 'Viudo/a' },
  { value: 'separado', label: 'Separado/a' },
]

const civilStatusLabels = Object.fromEntries(civilStatusOptions.map(({ value, label }) => [value, label]))

export function normalizeHeightToMeters(value) {
  if (value === null || value === undefined || String(value).trim() === '') return ''
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return String(value)
  const meters = parsed >= 10 && parsed <= 300 ? parsed / 100 : parsed
  return meters.toFixed(2)
}

function dateParts(value) {
  if (!value) return null
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export function calculateAgeAtDate(birthDate, referenceDate = new Date()) {
  const birth = dateParts(birthDate)
  const reference = dateParts(referenceDate instanceof Date
    ? `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}-${String(referenceDate.getDate()).padStart(2, '0')}`
    : referenceDate) ?? dateParts(new Date().toISOString().slice(0, 10))
  if (!birth || !reference) return null

  let age = reference.year - birth.year
  if (reference.month < birth.month || (reference.month === birth.month && reference.day < birth.day)) age -= 1
  return age >= 0 ? age : null
}

export function formatCivilStatus(value) {
  return civilStatusLabels[value] ?? '—'
}

export async function saveClinicalPatientData(cita, fechaNacimiento, estadoCivil, estatura) {
  if (!supabase) return 'La conexión con Supabase no está configurada.'

  const client = Array.isArray(cita.cliente) ? cita.cliente[0] : cita.cliente
  const updates = {}
  const originalBirthDate = client?.fecha_nacimiento?.slice(0, 10) ?? ''
  const originalCivilStatus = client?.estado_civil ?? ''
  const originalHeight = normalizeHeightToMeters(client?.estatura)
  const normalizedHeight = estatura === undefined ? '' : normalizeHeightToMeters(estatura)

  if (!originalBirthDate || originalBirthDate !== fechaNacimiento) updates.fecha_nacimiento = fechaNacimiento
  if (!originalCivilStatus || originalCivilStatus !== estadoCivil) updates.estado_civil = estadoCivil
  if (normalizedHeight && normalizedHeight !== originalHeight) updates.estatura = Number(normalizedHeight)
  if (Object.keys(updates).length === 0) return null

  const { error } = await supabase.from('clientes').update(updates).eq('id', cita.cliente_id)
  if (!error) return null
  if (error.code === '42501' || error.code === 'PGRST301') return 'Tu cuenta no tiene permiso para actualizar los datos generales del cliente.'
  if (error.code === '42703' || error.code === 'PGRST204') return 'Supabase no reconoce la columna estado_civil en public.clientes.'
  return 'No se pudieron guardar los datos generales en el expediente del cliente.'
}

export async function saveClinicalGeneralDataToHistory(history, fechaNacimiento, estadoCivil, appointmentDate) {
  if (!supabase) return { error: 'La conexión con Supabase no está configurada.' }
  let content = history.contenido
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content)
    } catch {
      content = { observaciones_generales: content }
    }
  }
  if (!content || typeof content !== 'object' || Array.isArray(content)) content = {}

  const datosGenerales = {
    fecha_nacimiento: fechaNacimiento,
    edad_al_momento: calculateAgeAtDate(fechaNacimiento, appointmentDate),
    estado_civil: estadoCivil,
  }
  const current = content.datos_generales ?? {}
  if (current.fecha_nacimiento === datosGenerales.fecha_nacimiento
    && current.edad_al_momento === datosGenerales.edad_al_momento
    && current.estado_civil === datosGenerales.estado_civil) {
    return { history }
  }

  const { data, error } = await supabase.from('historia_clinica')
    .update({ contenido: { ...content, datos_generales: datosGenerales } })
    .eq('id', history.id)
    .select('*')
    .single()

  if (error) {
    return { error: error.code === '42501' || error.code === 'PGRST301'
      ? 'Tu cuenta no tiene permiso para actualizar la historia clínica existente.'
      : 'No se pudieron actualizar los datos generales de la historia clínica existente.' }
  }
  return { history: data }
}
