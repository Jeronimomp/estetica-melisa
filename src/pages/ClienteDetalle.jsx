import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, Camera, ClipboardList, Eye, EyeOff, FileText, Pencil, Trash2, UserRound } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import ClienteForm from '@/components/ClienteForm'
import VisitAfterPhotoUploader from '@/components/VisitAfterPhotoUploader'
import VisorHistoriaClinica from '@/components/VisorHistoriaClinica'
import TratamientoCard from '@/components/TratamientoCard'
import TarjetaAsistencia from '@/components/TarjetaAsistencia'
import { formatCivilStatus } from '@/lib/clinicalPatientData'
import TratamientoHistorialCard from '@/components/TratamientoHistorialCard'
import PhotoLightbox from '@/components/PhotoLightbox'
import { canCaptureAppointmentPhoto } from '@/lib/clinicalPhotoPolicy'
import { parseTreatmentSessionNote } from '@/lib/treatmentSessionNotes'

const photoBucket = 'fotos-cita'
const historyStatusLabels = {
  atendida: 'Atendida',
  confirmada: 'Confirmada',
  pendiente: 'Pendiente',
  cancelada: 'Cancelada',
}

function getHistoryError(error) {
  if (error?.code === '42703' || error?.code === 'PGRST204') return 'Falta aplicar supabase/historial_atenciones_ocultar.sql para usar la vista de registros archivados.'
  if (error?.code === 'PGRST205' || error?.code === 'PGRST200') {
    return 'El historial aparecerá cuando existan las relaciones entre citas, servicios, profesionales, historias clínicas y fotos.'
  }
  if (error?.code === '42501' || error?.code === 'PGRST301') {
    return 'Tu cuenta no tiene permiso para consultar el historial de atenciones.'
  }
  return 'No se pudo cargar el historial de atenciones.'
}

  function isMissingArchiveColumns(error) {
    return error?.code === '42703' || error?.code === 'PGRST204'
  }

function getTreatmentError(error) {
  if (error?.code === '42703' || error?.code === 'PGRST204') return 'Falta aplicar supabase/historial_atenciones_ocultar.sql para usar la vista de tratamientos archivados.'
  if (error?.code === 'PGRST205' || error?.code === 'PGRST200') return 'No se pudieron cargar los tratamientos o sus relaciones. Verifica las tablas tratamientos, servicios, profesionales y asistencias_sesion.'
  if (error?.code === '42501' || error?.code === 'PGRST301') return 'Tu cuenta no tiene permiso para consultar los tratamientos.'
  return 'No se pudieron cargar los tratamientos del cliente.'
}

function getDeleteError(error) {
  if (error?.code === '23503') return 'No se puede eliminar porque este cliente tiene citas o historias clínicas relacionadas. El historial se conservó.'
  if (error?.code === '42501' || error?.code === 'PGRST301') return 'Tu cuenta no tiene permiso para eliminar clientes. Ejecuta supabase/clientes_delete_policy.sql en Supabase.'
  return 'No se pudo eliminar el cliente. Inténtalo de nuevo.'
}

function formatDate(dateValue, timeValue) {
  if (!dateValue) return 'Fecha pendiente'
  const date = new Date(`${dateValue}T${timeValue || '00:00:00'}`)
  if (Number.isNaN(date.getTime())) return 'Fecha pendiente'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: timeValue ? 'short' : undefined }).format(date)
}

function asList(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function normalizePhotoType(photo) {
  const rawType = photo.tipo ?? photo.type ?? photo.tipo_foto ?? ''
  const type = String(rawType).toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/^(antes|before|pre|previo|previa)/.test(type)) return 'antes'
  if (/^(despues|after|post|posterior)/.test(type)) return 'despues'
  return type
}

function latestPhotoOfType(photos, type) {
  return photos
    .filter((photo) => normalizePhotoType(photo) === type)
    .sort((first, second) => (Date.parse(second.fecha_subida) || 0) - (Date.parse(first.fecha_subida) || 0))[0] ?? null
}

function getVisitDateTimeKey(visit) {
  return `${String(visit?.fecha ?? '').slice(0, 10)}T${String(visit?.hora_inicio ?? '00:00').slice(0, 8)}`
}

function getTreatmentSessionNumber(appointment, totalSessions, serviceName, treatmentId) {
  const note = parseTreatmentSessionNote(appointment.notas)
  if (!note || note.total !== Number(totalSessions) || note.serviceName !== serviceName) return null
  if (note.treatmentId && note.treatmentId !== treatmentId) return null
  return note.number
}

function visitBelongsToTreatment(visit, treatment) {
  const service = Array.isArray(treatment.servicio) ? treatment.servicio[0] : treatment.servicio
  const total = Number(treatment.total_sesiones ?? service?.sesiones) || 1
  const serviceName = treatment.servicio_nombre || service?.nombre || ''
  const note = parseTreatmentSessionNote(visit.notas)
  if (!note || visit.servicio_id !== treatment.servicio_id || note.total !== total || note.serviceName !== serviceName) return false
  if (note.treatmentId) return note.treatmentId === treatment.id
  return String(visit.fecha ?? '').slice(0, 10) >= String(treatment.fecha_inicio ?? '').slice(0, 10)
}

function buildTreatmentHistoryGroups(treatments, appointments) {
  const groupedVisitIds = new Set()
  const groups = []

  function makeGroup(treatment, visits, attendances, isTemporary = false) {
    const rawTotal = Number(treatment.total_sesiones)
    const total = Number.isFinite(rawTotal) && rawTotal > 0 ? Math.min(Math.floor(rawTotal), 100) : 1
    const safeAttendances = (Array.isArray(attendances) ? attendances : []).filter(Boolean)
    const safeVisits = (Array.isArray(visits) ? visits : []).filter(Boolean)
    const orderedAttendances = safeAttendances.slice().sort((first, second) => Number(first.numero_sesion) - Number(second.numero_sesion))
    const visitById = new Map(safeVisits.map((visit) => [visit.id, visit]))
    const visitBySession = new Map(safeVisits
      .map((visit) => [getTreatmentSessionNumber(visit, total, treatment.servicio_nombre, treatment.id), visit])
      .filter(([number]) => number !== null))
    const attendedVisitIds = new Set(orderedAttendances.map((attendance) => attendance.cita_id).filter(Boolean))
    const visitsWithoutAttendance = safeVisits.filter((visit) => !attendedVisitIds.has(visit.id)).sort((first, second) => `${first.fecha}${first.hora_inicio}`.localeCompare(`${second.fecha}${second.hora_inicio}`))
    const attendanceByNumber = new Map(orderedAttendances.map((attendance) => [Number(attendance.numero_sesion), attendance]))
    const sessions = Array.from({ length: total }, (_, index) => {
      const numero = index + 1
      const asistencia = attendanceByNumber.get(numero) ?? null
      const visita = asistencia?.cita_id
        ? visitById.get(asistencia.cita_id) ?? null
        : visitBySession.get(numero) ?? visitsWithoutAttendance.shift() ?? null
      return { numero, asistencia, visita }
    })
    const uniqueVisits = [...new Map(safeVisits.map((visit) => [visit.id, visit])).values()]
      .sort((first, second) => `${first.fecha}${first.hora_inicio}`.localeCompare(`${second.fecha}${second.hora_inicio}`))
    uniqueVisits.forEach((visit) => groupedVisitIds.add(visit.id))
    const photos = uniqueVisits.flatMap((visit) => asList(visit.fotos_cita))
    const completed = Math.min(total, Number(treatment.sesiones_completadas) || orderedAttendances.length)
    return {
      tratamiento: treatment,
      visitas: uniqueVisits,
      sesiones: sessions,
      beforePhoto: latestPhotoOfType(photos, 'antes'),
      afterPhoto: latestPhotoOfType(photos, 'despues'),
      beforeVisit: uniqueVisits[0] ?? null,
      afterVisit: sessions[total - 1]?.visita ?? uniqueVisits.at(-1) ?? null,
      isComplete: treatment.estado === 'completado' || completed >= total,
      isTemporary,
    }
  }

  for (const treatment of treatments) {
    const service = asList(treatment.servicio)[0]
    const total = Number(treatment.total_sesiones ?? service?.sesiones) || 1
    if (total <= 1) continue
    const attendances = asList(treatment.asistencias_sesion)
    const attendanceIds = new Set(attendances.map((attendance) => attendance.cita_id).filter(Boolean))
    const startDate = String(treatment.fecha_inicio ?? '').slice(0, 10)
    const serviceName = treatment.servicio_nombre || service?.nombre || ''
    const hasExplicitLinkedVisits = appointments.some((visit) => (
      parseTreatmentSessionNote(visit.notas)?.treatmentId === treatment.id
    ))
    const belongsToTreatment = (visit) => {
      const note = parseTreatmentSessionNote(visit.notas)
      if (!note || note.total !== total || note.serviceName !== serviceName) return false
      if (note.treatmentId) return note.treatmentId === treatment.id
      return !hasExplicitLinkedVisits && String(visit.fecha ?? '').slice(0, 10) >= startDate
    }
    let visits = appointments.filter((visit) => attendanceIds.has(visit.id))

    if (treatment.estado === 'en_curso') {
      const scheduledVisits = appointments.filter((visit) => (
        visit.servicio_id === treatment.servicio_id
        && Number(asList(visit.servicio)[0]?.sesiones) > 1
        && belongsToTreatment(visit)
        && !groupedVisitIds.has(visit.id)
      ))
      visits = [...visits, ...scheduledVisits]
    } else if (treatment.estado === 'abandonado') {
      const canceledVisits = appointments.filter((visit) => (
        visit.estado === 'cancelada'
        && visit.servicio_id === treatment.servicio_id
        && belongsToTreatment(visit)
        && !groupedVisitIds.has(visit.id)
      ))
      visits = [...visits, ...canceledVisits]
    }

    groups.push(makeGroup({ ...treatment, total_sesiones: total, servicio_nombre: treatment.servicio_nombre || service?.nombre || '', profesional_nombre: treatment.profesional_nombre || asList(treatment.profesional)[0]?.nombre || '' }, visits, attendances))
  }

  const ungroupedPackageVisits = appointments.filter((visit) => Number(asList(visit.servicio)[0]?.sesiones) > 1 && !groupedVisitIds.has(visit.id))
  const visitsByService = new Map()
  for (const visit of ungroupedPackageVisits) {
    const service = asList(visit.servicio)[0]
    const key = visit.servicio_id || service?.nombre || 'paquete'
    const entries = visitsByService.get(key) ?? []
    entries.push(visit)
    visitsByService.set(key, entries)
  }
  for (const [serviceId, visits] of visitsByService) {
    const service = asList(visits[0].servicio)[0]
    const ordered = visits.slice().sort((first, second) => `${first.fecha}${first.hora_inicio}`.localeCompare(`${second.fecha}${second.hora_inicio}`))
    groups.push(makeGroup({
      id: `sin-tratamiento-${serviceId}`,
      servicio_id: serviceId,
      servicio_nombre: service?.nombre || 'Tratamiento',
      profesional_nombre: asList(ordered[0].profesional)[0]?.nombre || '',
      fecha_inicio: ordered[0].fecha,
      total_sesiones: Number(service?.sesiones) || ordered.length,
      sesiones_completadas: 0,
      estado: 'en_curso',
      asistencias_sesion: [],
    }, ordered, [], true))
  }

  return { groups, groupedVisitIds }
}

function calculateBmi(weight, height) {
  const parsedWeight = Number.parseFloat(weight)
  const parsedHeight = Number.parseFloat(height)
  if (!Number.isFinite(parsedWeight) || !Number.isFinite(parsedHeight) || parsedWeight <= 0 || parsedHeight <= 0) return null
  return (parsedWeight / (parsedHeight * parsedHeight)).toFixed(2)
}

function calculateAge(birthDate, today = new Date()) {
  if (!birthDate) return null
  const [year, month, day] = birthDate.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null

  let age = today.getFullYear() - year
  const birthdayHasPassed = today.getMonth() + 1 > month
    || (today.getMonth() + 1 === month && today.getDate() >= day)
  if (!birthdayHasPassed) age -= 1
  return age >= 0 ? age : null
}

function formatBirthDate(value) {
  if (!value) return null
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function ClientData({ label, value, valueClassName = '' }) {
  return (
    <div className="client-data__item">
      <dt>{label}</dt>
      <dd className={valueClassName}>{value || 'No registrado'}</dd>
    </div>
  )
}

function ClienteDetalle({ isAdmin = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loadResult, setLoadResult] = useState(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [selectedHistory, setSelectedHistory] = useState(null)
  const [photoViewer, setPhotoViewer] = useState(null)
  const [selectedTreatment, setSelectedTreatment] = useState(null)
  const [showHiddenHistory, setShowHiddenHistory] = useState(false)
  const [historyActionError, setHistoryActionError] = useState('')
  const [busyHistoryKey, setBusyHistoryKey] = useState('')
  const result = loadResult?.id === id ? loadResult : null
  const loading = Boolean(supabase && !result)
  const client = result?.client ?? null
  const appointments = result?.appointments ?? []
  const treatments = result?.treatments ?? []
  const historyVisibilityAvailable = result?.historyVisibilityAvailable !== false
  const hiddenTreatments = treatments.filter((treatment) => Boolean(treatment.oculto_en_expediente_at))
  const displayedTreatments = showHiddenHistory ? treatments : treatments.filter((treatment) => !treatment.oculto_en_expediente_at)
  const hiddenPackageAppointments = appointments.filter((visit) => hiddenTreatments.some((treatment) => visitBelongsToTreatment(visit, treatment)))
  const visibleAppointments = showHiddenHistory
    ? appointments
    : appointments.filter((visit) => !visit.oculto_en_expediente_at && !hiddenPackageAppointments.some((hiddenVisit) => hiddenVisit.id === visit.id))
  const hiddenStandaloneCount = appointments.filter((visit) => visit.oculto_en_expediente_at && !hiddenPackageAppointments.some((hiddenVisit) => hiddenVisit.id === visit.id)).length
  const hiddenHistoryCount = hiddenTreatments.length + hiddenStandaloneCount
  const { groups: treatmentHistoryGroups, groupedVisitIds } = buildTreatmentHistoryGroups(displayedTreatments, visibleAppointments)
  const standaloneAppointments = visibleAppointments.filter((visit) => !groupedVisitIds.has(visit.id))
  const historyItems = [
    ...treatmentHistoryGroups.map((group) => ({
      type: 'treatment',
      key: `treatment-${group.tratamiento.id}`,
      item: group,
      dateTime: group.visitas.map(getVisitDateTimeKey).sort().at(-1) || `${group.tratamiento.fecha_inicio}T00:00:00`,
    })),
    ...standaloneAppointments.map((visit) => ({
      type: 'visit',
      key: `visit-${visit.id}`,
      item: visit,
      dateTime: getVisitDateTimeKey(visit),
    })),
  ].sort((first, second) => second.dateTime.localeCompare(first.dateTime))

  function openPhotoGallery(photos, selectedUrl) {
    const availablePhotos = photos.filter((photo) => photo?.url)
    if (availablePhotos.length === 0) return
    setPhotoViewer({
      photos: availablePhotos,
      initialIndex: Math.max(0, availablePhotos.findIndex((photo) => photo.url === selectedUrl)),
    })
  }
  const clientError = !supabase
    ? 'La conexión con Supabase no está configurada.'
    : result?.clientError || ''
  const historyError = result?.historyError || ''
  const treatmentError = result?.treatmentError || ''
  const bmiValue = calculateBmi(client?.peso, client?.estatura)
  const clientAge = calculateAge(client?.fecha_nacimiento)

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    async function loadClient() {
      const { data: clientData, error: queryError } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', id)
        .single()

      if (!active) return
      if (queryError || !clientData) {
        setLoadResult({
          id,
          client: null,
          appointments: [],
          treatments: [],
          clientError: queryError?.code === 'PGRST205'
            ? 'Supabase no encuentra public.clientes. Verifica que la tabla esté creada y expuesta en el esquema public.'
            : 'No se encontró este cliente o no tienes permiso para consultar su expediente.',
        })
        return
      }

      const baseVisitSelection = 'id, cliente_id, servicio_id, fecha, hora_inicio, estado, servicio:servicios(nombre, sesiones), profesional:profesionales(nombre), historia_clinica(id, tipo, contenido, observaciones_sesion, fecha), fotos_cita(id, tipo, url_foto, fecha_subida)'
      const archivedVisitSelection = `id, cliente_id, servicio_id, fecha, hora_inicio, estado, oculto_en_expediente_at, oculto_en_expediente_por, ${baseVisitSelection.slice('id, cliente_id, servicio_id, fecha, hora_inicio, estado, '.length)}`
      let visitQuery = await supabase.from('citas')
        .select(archivedVisitSelection)
        .eq('cliente_id', id)
        .order('fecha', { ascending: false })
        .order('hora_inicio', { ascending: false })

      let historyVisibilityAvailable = true
      if (isMissingArchiveColumns(visitQuery.error)) {
        historyVisibilityAvailable = false
        visitQuery = await supabase.from('citas')
          .select(baseVisitSelection)
          .eq('cliente_id', id)
          .order('fecha', { ascending: false })
          .order('hora_inicio', { ascending: false })
      }
      const { data: visitData, error: visitError } = visitQuery

      if (!active) return
     // Después:
      const allVisits = visitError
        ? []
        : visitData ?? []
      const visitIds = allVisits.map((visit) => visit.id)
      const photosByVisit = new Map()
      if (visitIds.length > 0) {
        const { data: photoRows, error: photoQueryError } = await supabase
          .from('fotos_cita')
          .select('id, cita_id, cliente_id, tipo, url_foto, fecha_subida')
          .in('cita_id', visitIds)
          .order('fecha_subida', { ascending: false })

        if (!photoQueryError) {
          for (const photo of photoRows ?? []) {
            const visitPhotos = photosByVisit.get(photo.cita_id) ?? []
            visitPhotos.push(photo)
            photosByVisit.set(photo.cita_id, visitPhotos)
          }
        }
      }
      const visibleStatuses = ['atendida', 'confirmada', 'pendiente', 'cancelada']
      const visibleVisits = allVisits.filter((visit) => visibleStatuses.includes(visit.estado?.toLocaleLowerCase('es-MX')))
      const visitsWithSignedPhotos = await Promise.all(visibleVisits.map(async (visit) => {
        const mergedPhotos = [...asList(visit.fotos_cita), ...(photosByVisit.get(visit.id) ?? [])]
        const uniquePhotos = [...new Map(mergedPhotos.map((photo) => [photo.id ?? photo.url_foto, photo])).values()]
        const photos = await Promise.all(uniquePhotos.map(async (photo) => {
          if (/^https?:\/\//i.test(photo.url_foto)) return { ...photo, displayUrl: photo.url_foto }
          try {
            const { data: signedData, error: signedError } = await supabase.storage
              .from(photoBucket)
              .createSignedUrl(photo.url_foto, 60 * 60)
            return { ...photo, displayUrl: signedError ? '' : signedData?.signedUrl ?? '' }
          } catch {
            return { ...photo, displayUrl: '' }
          }
        }))
        return { ...visit, fotos_cita: photos }
      }))

      const baseTreatmentSelection = 'id, cliente_id, servicio_id, profesional_id, total_sesiones, sesiones_completadas, fecha_inicio, estado, created_at, servicio:servicios(nombre, sesiones), profesional:profesionales(nombre), asistencias_sesion(id, cita_id, numero_sesion, fecha_asistencia, hora_inicio, firma_paciente_url, observaciones_sesion)'
      const archivedTreatmentSelection = `id, cliente_id, servicio_id, profesional_id, total_sesiones, sesiones_completadas, fecha_inicio, estado, created_at, oculto_en_expediente_at, oculto_en_expediente_por, ${baseTreatmentSelection.slice('id, cliente_id, servicio_id, profesional_id, total_sesiones, sesiones_completadas, fecha_inicio, estado, created_at, '.length)}`
      let treatmentQuery = await supabase.from('tratamientos')
        .select(archivedTreatmentSelection)
        .eq('cliente_id', id)
        .order('created_at', { ascending: false })
      if (isMissingArchiveColumns(treatmentQuery.error)) {
        historyVisibilityAvailable = false
        treatmentQuery = await supabase.from('tratamientos')
          .select(baseTreatmentSelection)
          .eq('cliente_id', id)
          .order('created_at', { ascending: false })
      }
      const { data: treatmentData, error: treatmentQueryError } = treatmentQuery

      const treatmentsWithSignedAttendances = await Promise.all((treatmentData ?? []).map(async (treatment) => {
        const service = asList(treatment.servicio)[0]
        const professional = asList(treatment.profesional)[0]
        const attendances = await Promise.all(asList(treatment.asistencias_sesion).map(async (attendance) => {
          const signaturePath = attendance.firma_paciente_url
          if (!signaturePath) return { ...attendance, firma_display_url: '' }
          if (/^https?:\/\//i.test(signaturePath)) return { ...attendance, firma_display_url: signaturePath }
          try {
            const { data: signedData, error: signedError } = await supabase.storage
              .from('firmas-asistencias')
              .createSignedUrl(signaturePath, 60 * 60)
            return { ...attendance, firma_display_url: signedError ? '' : signedData?.signedUrl ?? '' }
          } catch {
            return { ...attendance, firma_display_url: '' }
          }
        }))

        return {
          ...treatment,
          servicio_nombre: treatment.servicio_nombre || service?.nombre || '',
          total_sesiones: treatment.total_sesiones ?? service?.sesiones ?? 0,
          profesional_nombre: treatment.profesional_nombre || professional?.nombre || '',
          asistencias_sesion: attendances,
        }
      }))

      if (!active) return
      setLoadResult({
        id,
        client: clientData,
        appointments: visitsWithSignedPhotos,
        historyError: visitError ? getHistoryError(visitError) : '',
        treatments: treatmentsWithSignedAttendances,
        treatmentError: treatmentQueryError ? getTreatmentError(treatmentQueryError) : '',
        historyVisibilityAvailable,
      })
    }

    loadClient()
    return () => {
      active = false
    }
  }, [id])

  function handleSaved(updatedClient) {
    setLoadResult((current) => current?.id === id ? { ...current, client: updatedClient } : current)
    setEditing(false)
  }

  function handleAfterPhotoSaved(visitId, photo) {
    setLoadResult((current) => current?.id === id
      ? { ...current, appointments: current.appointments.map((visit) => visit.id === visitId ? { ...visit, fotos_cita: [...asList(visit.fotos_cita).filter((existing) => existing.id !== photo.id), photo] } : visit) }
      : current)
  }

  async function toggleHistoryVisibility(kind, record) {
    if (!isAdmin || !historyVisibilityAvailable || !supabase || busyHistoryKey) return
    const table = kind === 'visit' ? 'citas' : 'tratamientos'
    const isHidden = Boolean(record.oculto_en_expediente_at)
    const message = isHidden
      ? 'La atención volverá a mostrarse en el expediente. ¿Continuar?'
      : 'La atención se ocultará del expediente, pero sus citas, fotos e historia se conservarán. ¿Continuar?'
    if (!window.confirm(message)) return

    setBusyHistoryKey(`${kind}:${record.id}`)
    setHistoryActionError('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('No se pudo verificar la sesión. Inicia sesión de nuevo.')
      const nowHidden = !isHidden
      const { data, error } = await supabase.from(table)
        .update({
          oculto_en_expediente_at: nowHidden ? new Date().toISOString() : null,
          oculto_en_expediente_por: nowHidden ? user.id : null,
        })
        .eq('id', record.id)
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('No se pudo confirmar el cambio. Ejecuta supabase/historial_atenciones_ocultar.sql y verifica tu rol administrador.')

      setLoadResult((current) => {
        if (current?.id !== id) return current
        const collection = kind === 'visit' ? 'appointments' : 'treatments'
        return {
          ...current,
          [collection]: current[collection].map((item) => item.id === record.id
            ? { ...item, oculto_en_expediente_at: nowHidden ? new Date().toISOString() : null, oculto_en_expediente_por: nowHidden ? user.id : null }
            : item),
        }
      })
    } catch (actionError) {
      setHistoryActionError(actionError?.message || 'No se pudo actualizar la visibilidad de la atención.')
    } finally {
      setBusyHistoryKey('')
    }
  }

  async function handleDeleteClient() {
    if (!supabase || !client?.id || deleting) return
    setDeleting(true)
    setDeleteError('')
    const { data, error: removeError } = await supabase.from('clientes').delete().eq('id', client.id).select('id').maybeSingle()
    if (removeError) {
      setDeleteError(getDeleteError(removeError))
      setDeleting(false)
      return
    }
    if (!data) {
      setDeleteError('No se pudo confirmar la eliminación. Verifica los permisos de tu cuenta.')
      setDeleting(false)
      return
    }
    navigate('/clientes', { replace: true })
  }

  if (loading) return <main className="loading-screen" aria-live="polite">Cargando expediente…</main>
  if (clientError) {
    return (
      <section className="workspace-main client-detail-error">
        <Link className="client-back-link" to="/clientes"><ArrowLeft size={17} /> Volver a clientes</Link>
        <p className="client-state client-state--error" role="alert">{clientError}</p>
      </section>
    )
  }

  return (
    <section className="workspace-main client-detail">
      <Link className="client-back-link" to="/clientes"><ArrowLeft size={17} aria-hidden="true" /> Clientes</Link>
      <header className="client-detail__header">
        <span className="client-avatar client-avatar--large" aria-hidden="true">{client.nombre.trim().slice(0, 1).toLocaleUpperCase('es-MX')}</span>
        <div className="client-detail__title">
          <span className="eyebrow text-dorado-oscuro">EXPEDIENTE DE CLIENTE</span>
          <h1>{client.nombre}</h1>
          <span className={`client-detail__status client-detail__status--${client.activo ? 'activo' : 'inactivo'}`}>{client.activo ? 'Activo' : 'Inactivo'}</span>
        </div>
        <div className="client-detail__actions">
          <Button className="client-detail__edit" variant="outline" onClick={() => setEditing(true)}>
            <Pencil size={16} aria-hidden="true" /> Editar
          </Button>
          <Button className="client-detail__delete" variant="outline" type="button" aria-label={`Eliminar cliente ${client.nombre}`} title="Eliminar cliente" onClick={() => { setDeleteError(''); setConfirmDelete(true) }}>
            <Trash2 size={17} aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section className="client-detail__section" aria-labelledby="client-personal-title">
        <h2 id="client-personal-title"><UserRound size={18} aria-hidden="true" /> Datos del cliente</h2>
        <div className="client-profile-accordions">
          <details className="client-profile-accordion">
            <summary>
              <span>Contacto e identificación</span>
              <small>{client.telefono || 'Sin teléfono'} · {client.correo || 'Sin correo'}</small>
            </summary>
            <dl className="client-data-grid">
              <ClientData label="Teléfono" value={client.telefono} />
              <ClientData label="Correo" value={client.correo} />
              <ClientData
                label="Fecha de nacimiento"
                value={client.fecha_nacimiento ? (
                  <span className="client-data__birth-value">
                    <span>{formatBirthDate(client.fecha_nacimiento)}</span>
                    {clientAge !== null && <span>Edad {clientAge} años</span>}
                  </span>
                ) : null}
              />
              <ClientData label="Documento" value={[client.tipo_documento, client.numero_documento].filter(Boolean).join(' · ')} />
            </dl>
          </details>

          <details className="client-profile-accordion">
            <summary>
              <span>Datos personales</span>
              <small>{formatCivilStatus(client.estado_civil) || client.genero || client.ciudad || 'Sin datos adicionales'}</small>
            </summary>
            <dl className="client-data-grid">
              <ClientData label="Estado civil" value={formatCivilStatus(client.estado_civil)} />
              <ClientData label="Género" value={client.genero} />
              <ClientData label="Ciudad" value={client.ciudad} />
              <ClientData label="Dirección" value={client.direccion} />
              <ClientData label="Ocupación" value={client.ocupacion} />
              <ClientData label="¿Cómo nos conoció?" value={client.como_nos_conocio} />
            </dl>
          </details>

          <details className="client-profile-accordion">
            <summary>
              <span>Salud y medidas</span>
              <small>{client.peso ? `${Number(client.peso).toFixed(2)} kg` : 'Sin medidas registradas'}</small>
            </summary>
            <dl className="client-data-grid">
              <ClientData label="Estatura" value={client.estatura ? `${Number(client.estatura).toFixed(2)} m` : null} />
              <ClientData label="Peso" value={client.peso ? `${Number(client.peso).toFixed(2)} kg` : null} />
              <ClientData label="IMC Calculado" value={bmiValue ? `${bmiValue} kg/m²` : null} valueClassName={bmiValue ? 'client-data__value--green' : ''} />
              <ClientData label="Alergias" value={client.alergias} />
              <ClientData label="Enfermedades" value={client.enfermedades} />
              <ClientData label="Medicamentos" value={client.medicamentos} />
              <ClientData label="Observaciones" value={client.observaciones} />
            </dl>
          </details>
        </div>
      </section>

      <section className="client-detail__section" aria-labelledby="client-history-title">
        <div className="client-history__heading">
          <h2 id="client-history-title"><CalendarDays size={18} aria-hidden="true" /> Historial de atenciones</h2>
          {isAdmin && historyVisibilityAvailable && (hiddenHistoryCount > 0 || showHiddenHistory) && (
            <button className="history-visibility-filter" type="button" aria-pressed={showHiddenHistory} onClick={() => setShowHiddenHistory((current) => !current)}>
              {showHiddenHistory ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
              {showHiddenHistory ? 'Ocultar archivados' : `Mostrar ocultas (${hiddenHistoryCount})`}
            </button>
          )}
        </div>
        {historyError && <p className="client-state client-state--notice" role="status">{historyError}</p>}
        {isAdmin && !historyVisibilityAvailable && !historyError && <p className="client-state client-state--notice" role="status">Para ocultar o restaurar atenciones, ejecuta supabase/historial_atenciones_ocultar.sql en Supabase.</p>}
        {historyActionError && <p className="client-state client-state--error" role="alert">{historyActionError}</p>}
        {!historyError && historyItems.length === 0 && <p className="client-state">{showHiddenHistory ? 'No hay atenciones ocultas para mostrar.' : 'Aún no hay citas para mostrar a este cliente.'}</p>}
        <div className="visit-list">
          {historyItems.map(({ type, key, item }) => {
            if (type === 'treatment') {
              return (
                <TratamientoHistorialCard
                  key={key}
                  group={item}
                  clientId={id}
                  onPhotoSaved={handleAfterPhotoSaved}
                  onViewPhoto={openPhotoGallery}
                  isAdmin={isAdmin && historyVisibilityAvailable}
                  busy={busyHistoryKey === `treatment:${item.tratamiento.id}`}
                  onToggleVisibility={(treatment) => toggleHistoryVisibility('treatment', treatment)}
                />
              )
            }

            const visit = item
            const service = asList(visit.servicio)[0]
            const professional = asList(visit.profesional)[0]
            const histories = asList(visit.historia_clinica)
            const status = visit.estado?.toLocaleLowerCase('es-MX') || 'pendiente'
            const photos = asList(visit.fotos_cita)
            const beforePhoto = latestPhotoOfType(photos, 'antes')
            const afterPhoto = latestPhotoOfType(photos, 'despues')
            const photoGallery = [
              beforePhoto?.displayUrl && { url: beforePhoto.displayUrl, type: 'Antes', service: service?.nombre || '', date: formatDate(visit.fecha, visit.hora_inicio), alt: 'Foto antes del servicio' },
              afterPhoto?.displayUrl && { url: afterPhoto.displayUrl, type: 'Después', service: service?.nombre || '', date: formatDate(visit.fecha, visit.hora_inicio), alt: 'Foto después del servicio' },
            ].filter(Boolean)
            const totalSessions = Number(service?.sesiones) || 1
            const canReplaceAttendedPhoto = visit.estado === 'atendida'
            const isFinalVisit = ['atendida', 'cancelada'].includes(status)
            const isHidden = Boolean(visit.oculto_en_expediente_at)
            const canUploadBeforePhoto = canCaptureAppointmentPhoto(visit, 'antes', totalSessions, 1) || (Boolean(beforePhoto) && canReplaceAttendedPhoto)
            const canUploadAfterPhoto = canCaptureAppointmentPhoto(visit, 'despues', totalSessions, 1) || (Boolean(afterPhoto) && canReplaceAttendedPhoto)
            return (
              <article className="visit-card" key={key}>
                <div className="visit-card__heading">
                  <div>
                    <span className="visit-card__date">{formatDate(visit.fecha, visit.hora_inicio)}</span>
                    <h3>{service?.nombre || 'Servicio'}</h3>
                    <p>Atendió: {professional?.nombre || 'Profesional no registrado'}</p>
                  </div>
                  <span className={`visit-card__status visit-card__status--${status}`}>{historyStatusLabels[status] || status}</span>
                  {isHidden && <span className="visit-card__status visit-card__status--oculta">Oculta</span>}
                </div>
                <div className="visit-card__actions">
                  {histories.length > 0 && (
                    <Button type="button" variant="outline" onClick={() => setSelectedHistory({ historia: histories[0], servicio: service?.nombre, profesional: professional?.nombre })}>
                      <FileText size={16} aria-hidden="true" /> Ver historia clínica
                    </Button>
                  )}
                  {status === 'pendiente' ? (
                    <Link className="visit-pending-link" to={`/citas?fecha=${encodeURIComponent(visit.fecha)}&cita=${encodeURIComponent(visit.id)}`}>
                      <CalendarDays size={16} aria-hidden="true" /> Ver cita en el calendario
                    </Link>
                  ) : (
                    <div className="visit-gallery" aria-label="Fotos de la atención">
                    <article className="visit-gallery__item">
                      <div className="visit-gallery__media">
                        {beforePhoto?.displayUrl
                          ? <button className="visit-gallery__open" type="button" aria-label="Ampliar foto antes" onClick={() => openPhotoGallery(photoGallery, beforePhoto.displayUrl)}><img src={beforePhoto.displayUrl} alt="Foto antes del servicio" loading="lazy" /></button>
                          : <div className="visit-gallery__placeholder"><Camera size={20} aria-hidden="true" /><span>{beforePhoto ? 'Foto no disponible' : 'Sin foto antes'}</span></div>}
                      </div>
                      <span className="visit-gallery__caption"><Camera size={14} aria-hidden="true" /> Antes</span>
                      {!historyError && (
                        <VisitAfterPhotoUploader
                          visit={visit}
                          clientId={id}
                          hasPhoto={Boolean(beforePhoto)}
                          existingPhoto={beforePhoto}
                          photoType="antes"
                          canUpload={canUploadBeforePhoto}
                          allowReplace={visit.estado !== 'atendida'}
                          onSaved={(photo) => handleAfterPhotoSaved(visit.id, photo)}
                        />
                      )}
                    </article>
                    <article className="visit-gallery__item">
                      <div className="visit-gallery__media">
                        {afterPhoto?.displayUrl
                          ? <button className="visit-gallery__open" type="button" aria-label="Ampliar foto después" onClick={() => openPhotoGallery(photoGallery, afterPhoto.displayUrl)}><img src={afterPhoto.displayUrl} alt="Foto después del servicio" loading="lazy" /></button>
                          : <div className="visit-gallery__placeholder"><Camera size={20} aria-hidden="true" /><span>{afterPhoto ? 'Foto no disponible' : 'Sin foto después'}</span></div>}
                      </div>
                      <span className="visit-gallery__caption"><Camera size={14} aria-hidden="true" /> Después</span>
                      {!historyError && visit.estado !== 'cancelada' && (
                        <VisitAfterPhotoUploader
                          visit={visit}
                          clientId={id}
                          hasPhoto={Boolean(afterPhoto)}
                          existingPhoto={afterPhoto}
                          canUpload={canUploadAfterPhoto}
                          allowReplace={visit.estado !== 'atendida'}
                          onSaved={(photo) => handleAfterPhotoSaved(visit.id, photo)}
                        />
                      )}
                    </article>
                    </div>
                  )}
                  {isAdmin && historyVisibilityAvailable && isFinalVisit && (
                    <button className="history-visibility-action" type="button" disabled={busyHistoryKey === `visit:${visit.id}`} onClick={() => toggleHistoryVisibility('visit', visit)}>
                      {isHidden ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                      {isHidden ? 'Restaurar' : 'Ocultar atención'}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="client-detail__section" aria-labelledby="client-treatments-title">
        <h2 id="client-treatments-title"><ClipboardList size={18} aria-hidden="true" /> Tratamientos</h2>
        {treatmentError && <p className="client-state client-state--notice" role="status">{treatmentError}</p>}
        {!treatmentError && treatments.length === 0 && <p className="client-state">Aún no hay tratamientos registrados para este cliente.</p>}
        <div className="treatment-card-grid">
          {displayedTreatments.map((treatment) => (
            <TratamientoCard key={treatment.id} tratamiento={treatment} onVerTarjeta={setSelectedTreatment} />
          ))}
        </div>
      </section>

      {editing && <ClienteForm client={client} onClose={() => setEditing(false)} onSaved={handleSaved} />}
      {confirmDelete && (
        <div className="creation-overlay client-delete-overlay">
          <section className="creation-dialog client-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-client-title" aria-describedby="delete-client-description">
            <span className="eyebrow text-dorado-oscuro">CONFIRMAR ELIMINACIÓN</span>
            <h2 id="delete-client-title">Eliminar cliente</h2>
            <p id="delete-client-description">¿Seguro que desea eliminar al paciente?</p>
            <p className="client-delete-dialog__name">{client.nombre}</p>
            <p className="client-delete-dialog__warning">Esta acción no se puede deshacer. Si tiene citas o historias clínicas relacionadas, se conservarán y la base de datos impedirá eliminar el registro.</p>
            {deleteError && <p className="form-message form-message--error" role="alert">{deleteError}</p>}
            <div className="client-delete-dialog__actions">
              <Button variant="outline" type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancelar</Button>
              <Button className="client-delete-dialog__confirm" type="button" onClick={handleDeleteClient} disabled={deleting}><Trash2 size={16} aria-hidden="true" /> {deleting ? 'Eliminando…' : 'Eliminar cliente'}</Button>
            </div>
          </section>
        </div>
      )}
      {selectedHistory && <VisorHistoriaClinica historia={selectedHistory.historia} cliente={client} servicio={selectedHistory.servicio} profesional={selectedHistory.profesional} onCerrar={() => setSelectedHistory(null)} />}
      {selectedTreatment && <TarjetaAsistencia tratamiento={selectedTreatment} asistencias={asList(selectedTreatment.asistencias_sesion)} onCerrar={() => setSelectedTreatment(null)} />}
      {photoViewer && <PhotoLightbox photos={photoViewer.photos} initialIndex={photoViewer.initialIndex} onClose={() => setPhotoViewer(null)} />}
    </section>
  )
}

export default ClienteDetalle