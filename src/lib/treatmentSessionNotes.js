const treatmentMarkerPattern = /\[\[tratamiento:([^|\]]+)(?:\|sesion:(\d+)\|total:(\d+)\|servicio:([^\]]+))?\]\]/i
const sessionPattern = /^Sesión\s+(\d+)\s+de\s+(\d+)\s+—\s+(.+?)\s*$/

export function getVisibleAppointmentNotes(notes) {
  return String(notes ?? '').replace(treatmentMarkerPattern, '').trim()
}

export function parseTreatmentSessionNote(notes) {
  const rawNotes = String(notes ?? '').trim()
  const marker = treatmentMarkerPattern.exec(rawNotes)
  const visibleNotes = getVisibleAppointmentNotes(rawNotes)
  const match = sessionPattern.exec(visibleNotes)
  if (!match && !marker) return null
  let markedServiceName = null
  if (marker?.[4]) {
    try {
      markedServiceName = decodeURIComponent(marker[4])
    } catch {
      markedServiceName = null
    }
  }
  return {
    number: Number(marker?.[2] ?? match?.[1]) || null,
    total: Number(marker?.[3] ?? match?.[2]) || null,
    serviceName: markedServiceName || match?.[3] || null,
    treatmentId: marker?.[1] ?? null,
  }
}

export function withTreatmentId(notes, treatmentId, sessionMetadata = null) {
  const visibleNotes = getVisibleAppointmentNotes(notes)
  if (!treatmentId) return visibleNotes || null
  const metadata = sessionMetadata ?? parseTreatmentSessionNote(visibleNotes)
  if (metadata?.number && metadata?.total && metadata?.serviceName) {
    const serviceName = encodeURIComponent(metadata.serviceName)
    return `${visibleNotes}\n[[tratamiento:${treatmentId}|sesion:${metadata.number}|total:${metadata.total}|servicio:${serviceName}]]`
  }
  return `${visibleNotes}\n[[tratamiento:${treatmentId}]]`
}

export function getRemainingTreatmentSessions(treatment) {
  return Math.max(0, Number(treatment?.total_sesiones) - Number(treatment?.sesiones_completadas || 0))
}

export function hasBlockingActiveTreatment(treatment) {
  return treatment?.estado === 'en_curso' && getRemainingTreatmentSessions(treatment) > 3
}

export function matchesTreatmentService(treatment, selectedService) {
  if (!treatment || !selectedService) return false
  if (treatment.servicio_id === selectedService.id) return true

  const treatmentService = Array.isArray(treatment.servicio) ? treatment.servicio[0] : treatment.servicio
  const normalize = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/\s+/g, ' ')
    .trim()

  return Boolean(normalize(selectedService.nombre)
    && normalize(treatmentService?.nombre) === normalize(selectedService.nombre))
}