import { supabase } from '@/lib/supabase'

const signatureBucket = 'firmas-consentimientos'

export async function uploadClinicalSignature(signatureCanvas, appointmentId) {
  if (!supabase) return { error: 'La conexión con Supabase no está configurada.' }
  if (!signatureCanvas || signatureCanvas.isEmpty()) return { error: 'La firma del paciente es obligatoria.' }
  const base64 = signatureCanvas.toDataURL('image/png')
  const blob = await (await fetch(base64)).blob()
  const path = `firmas/${appointmentId}/firma_historia_${Date.now()}.png`
  const { data, error } = await supabase.storage.from(signatureBucket).upload(path, blob, { contentType: 'image/png', upsert: false })
  if (error) {
    if (error.statusCode === '404' || error.status === 404) return { error: 'Falta configurar el bucket privado firmas-consentimientos en Supabase.' }
    if (error.statusCode === '403' || error.status === 403) return { error: 'Storage rechazó la firma. Revisa las políticas de firmas-consentimientos.' }
    return { error: 'No se pudo subir la firma del paciente. Inténtalo de nuevo.' }
  }
  return { path: data.path }
}

export async function uploadAttendanceSignature(signatureCanvas, treatmentId, sessionNumber) {
  if (!supabase) return { error: 'La conexión con Supabase no está configurada.' }
  if (!signatureCanvas || signatureCanvas.isEmpty()) return { error: 'La firma del paciente es obligatoria.' }

  try {
    const base64 = signatureCanvas.toDataURL('image/png')
    const blob = await (await fetch(base64)).blob()
    const path = `${treatmentId}/sesion-${sessionNumber}.png`
    const { data, error } = await supabase.storage
      .from('firmas-asistencias')
      .upload(path, blob, { contentType: 'image/png', upsert: true })

    if (error) {
      if (error.statusCode === '404' || error.status === 404) return { error: 'Falta configurar el bucket firmas-asistencias en Supabase.' }
      if (error.statusCode === '403' || error.status === 403) return { error: 'Storage rechazó la firma de asistencia. Revisa las políticas de firmas-asistencias.' }
      return { error: error.message || 'No se pudo subir la firma de asistencia.' }
    }
    return { path: data.path }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo convertir o subir la firma.' }
  }
}
