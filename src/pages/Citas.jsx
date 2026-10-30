import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
  Pencil,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import CitaForm from '@/components/CitaForm'
import HistoriaClinicaFacial from '@/components/HistoriaClinicaFacial'
import HistoriaClinicaCorporal from '@/components/HistoriaClinicaCorporal'
import HistoriaClinicaGeneral from '@/components/HistoriaClinicaGeneral'
import FirmaAsistencia from '@/components/FirmaAsistencia'
import PhotoLightbox from '@/components/PhotoLightbox'
import { uploadAttendanceSignature } from '@/lib/clinicalSignature'
import { canCaptureAppointmentPhoto, getLocalDateKey } from '@/lib/clinicalPhotoPolicy'
import useAppointmentSounds from '@/hooks/useAppointmentSounds'
import { getVisibleAppointmentNotes, parseTreatmentSessionNote } from '@/lib/treatmentSessionNotes'

const photoBucket = 'fotos-cita'
const today = new Date()
const emptyAppointments = []

function makeUploadToken() {
  return `${Date.now()}-${crypto.randomUUID()}`
}

function getUpdatedAt() {
  return new Date().toISOString()
}

async function loadOpenTreatmentAppointments(appointment, treatment, service) {
  const { data, error } = await supabase.from('citas')
    .select('id, cliente_id, servicio_id, fecha, estado, notas')
    .eq('cliente_id', appointment.cliente_id)
    .eq('servicio_id', appointment.servicio_id)
    .gte('fecha', treatment.fecha_inicio)
    .in('estado', ['pendiente', 'confirmada'])
    .order('fecha', { ascending: true })
    .order('hora_inicio', { ascending: true })

  if (error) throw error
  const requestedTreatmentId = parseTreatmentSessionNote(appointment.notas)?.treatmentId
  return (data ?? []).filter((candidate) => {
    const note = parseTreatmentSessionNote(candidate.notas)
    if (!note) return false
    if (requestedTreatmentId) return note.treatmentId === requestedTreatmentId
    return !note.treatmentId
      && note.total === Number(treatment.total_sesiones)
      && note.serviceName === service.nombre
  })
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function isAppointmentToday(appointment) {
  return appointment?.fecha === toDateKey(new Date())
}

function isOverdueAppointment(appointment) {
  if (!appointment?.fecha || ['atendida', 'cancelada'].includes(appointment.estado)) return false
  const appointmentDate = new Date(`${appointment.fecha.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(appointmentDate.getTime())) return false
  const todayDate = new Date()
  todayDate.setHours(0, 0, 0, 0)
  return appointmentDate < todayDate
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function getMonthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start: toDateKey(start), end: toDateKey(end) }
}

function getCalendarDays(date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1)
  const offset = (firstDay.getDay() + 6) % 7
  const start = new Date(date.getFullYear(), date.getMonth(), 1 - offset)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return { date: day, key: toDateKey(day), inMonth: day.getMonth() === date.getMonth() }
  })
}

function getAppointmentError(error) {
  if (error?.code === 'PGRST205' || error?.code === 'PGRST200') {
    return 'Supabase no encuentra citas o alguna de sus relaciones. Verifica las tablas y claves foráneas del esquema public.'
  }
  if (error?.code === '42501' || error?.code === 'PGRST301') {
    return 'Tu cuenta no tiene permiso para consultar o actualizar citas.'
  }
  return 'No se pudieron cargar las citas. Inténtalo de nuevo.'
}

function getStorageError(error) {
  if (error?.statusCode === '404' || error?.status === 404) {
    return 'Falta configurar el bucket privado fotos-cita en Supabase. Ejecuta supabase/citas-storage.sql.'
  }
  if (error?.statusCode === '403' || error?.status === 403) {
    return 'Storage rechazó la foto. Revisa las políticas de storage.objects en supabase/citas-storage.sql.'
  }
  return `No se pudo subir la foto: ${error?.message || 'error desconocido de Storage.'}`
}

function asOne(value) {
  return Array.isArray(value) ? value[0] : value
}

function asList(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function getPhotoTypeOrder(photo) {
  const type = String(photo?.tipo ?? '').toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (type.startsWith('antes')) return 0
  if (type.startsWith('despues')) return 1
  return 2
}

function formatMonth(date) {
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date)
}

function formatSelectedDate(value) {
  const date = new Date(`${value}T12:00:00`)
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
}

function formatTime(value) {
  if (!value) return 'Hora pendiente'
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number)
  return new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(new Date(2020, 0, 1, hours, minutes))
}

function latestPhotoOfType(photos, type) {
  return photos
    .filter((photo) => photo.tipo === type)
    .sort((first, second) => (Date.parse(second.fecha_subida) || 0) - (Date.parse(first.fecha_subida) || 0))[0] ?? null
}

function isImageFile(file) {
  const mimeType = file.type?.toLowerCase() ?? ''
  const extension = file.name?.split('.').pop()?.toLowerCase() ?? ''
  return mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp'].includes(extension)
}

function convertPhotoToJpeg(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(sourceUrl)
        reject(new Error('No se pudo procesar la imagen en este dispositivo.'))
        return
      }
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(sourceUrl)
        if (blob) resolve(blob)
        else reject(new Error('No se pudo convertir la imagen a JPEG.'))
      }, 'image/jpeg', 0.9)
    }
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl)
      reject(new Error('El formato de esta imagen no se puede leer en este dispositivo. Selecciona otra foto en JPEG o PNG.'))
    }
    image.src = sourceUrl
  })
}

function Citas() {
  const { enabled: soundsEnabled, toggle: toggleSounds, play: playAppointmentSound } = useAppointmentSounds()
  const [searchParams] = useSearchParams()
  const requestedDate = searchParams.get('fecha') ?? ''
  const requestedAppointmentId = searchParams.get('cita') ?? ''
  const initialDate = parseDateKey(requestedDate) ?? today
  const [month, setMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(initialDate))
  const [loadResult, setLoadResult] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [formState, setFormState] = useState(null)
  const [clinicalTarget, setClinicalTarget] = useState(null)
  const [attendanceTarget, setAttendanceTarget] = useState(null)
  const [preparedAttendance, setPreparedAttendance] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelError, setCancelError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [photoViewer, setPhotoViewer] = useState(null)
  const [busyAppointmentId, setBusyAppointmentId] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState('')
  const photoInputRef = useRef(null)
  const photoContextRef = useRef(null)
  const monthKey = getMonthKey(month)
  const currentResult = loadResult?.monthKey === monthKey ? loadResult : null
  const appointments = currentResult?.appointments ?? emptyAppointments
  const loading = Boolean(supabase && !currentResult)
  const loadError = !supabase
    ? 'La conexión con Supabase no está configurada.'
    : currentResult?.error ?? ''
  const calendarDays = useMemo(() => getCalendarDays(month), [month])
  const selectedAppointments = appointments.filter((appointment) => appointment.fecha === selectedDate)
  const clinicalCategory = asOne(clinicalTarget?.servicio)?.categoria?.toLocaleLowerCase('es-MX')
  const ClinicalHistoryForm = clinicalCategory === 'facial'
    ? HistoriaClinicaFacial
    : clinicalCategory === 'corporal'
      ? HistoriaClinicaCorporal
      : HistoriaClinicaGeneral
  const appointmentCounts = useMemo(() => appointments.reduce((counts, appointment) => {
    counts[appointment.fecha] ??= { total: 0, hasOverdue: false }
    counts[appointment.fecha].total += 1
    if (isOverdueAppointment(appointment)) counts[appointment.fecha].hasOverdue = true
    return counts
  }, {}), [appointments])

  useEffect(() => {
    if (!requestedAppointmentId || loading || loadError) return undefined
    const target = document.getElementById(`appointment-${requestedAppointmentId}`)
    if (!target) return undefined

    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [requestedAppointmentId, appointments, selectedDate, loading, loadError])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const { start, end } = getMonthRange(month)

    async function loadAppointments() {
      const { data, error } = await supabase
        .from('citas')
        .select('id, cliente_id, profesional_id, servicio_id, empleado_id, fecha, hora_inicio, hora_fin, estado, notas, cliente:clientes(id, nombre, correo, telefono, fecha_nacimiento, estado_civil, peso, estatura), profesional:profesionales(id, nombre, especialidad), servicio:servicios(id, nombre, categoria, sesiones, requiere_consentimiento, duracion_minutos), historia_clinica(id, tipo, contenido, observaciones_sesion, fecha), fotos_cita(id, tipo, url_foto, fecha_subida)')
        .gte('fecha', start)
        .lt('fecha', end)
        .order('fecha', { ascending: true })
        .order('hora_inicio', { ascending: true })

      if (!active) return
      if (error) {
        setLoadResult({ monthKey, appointments: [], error: getAppointmentError(error) })
        return
      }

      const activeAppointments = (data ?? []).filter((appointment) => appointment.estado !== 'cancelada')
      const withPhotoUrls = await Promise.all(activeAppointments.map(async (appointment) => {
        const photos = await Promise.all((appointment.fotos_cita ?? []).map(async (photo) => {
          if (/^https?:\/\//i.test(photo.url_foto)) return { ...photo, displayUrl: photo.url_foto }
          const { data: signedData, error: signedError } = await supabase.storage
            .from(photoBucket)
            .createSignedUrl(photo.url_foto, 60 * 60)
          return { ...photo, displayUrl: signedError ? '' : signedData?.signedUrl ?? '' }
        }))
        return { ...appointment, fotos_cita: photos }
      }))

      if (active) setLoadResult({ monthKey, appointments: withPhotoUrls, error: '' })
    }

    loadAppointments()
    return () => {
      active = false
    }
  }, [month, monthKey, reloadToken])

  function changeMonth(amount) {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + amount, 1)
    setMonth(nextMonth)
    setSelectedDate(toDateKey(nextMonth))
  }

  async function updateAppointment(appointment, changes) {
    if (!supabase) return
    if (changes.estado === 'confirmada' && !isAppointmentToday(appointment)) {
      setActionError('Solo puedes confirmar la cita el día programado.')
      return
    }
    setBusyAppointmentId(appointment.id)
    setActionError('')
    const { error } = await supabase
      .from('citas')
      .update({ ...changes, updated_at: getUpdatedAt() })
      .eq('id', appointment.id)

    setBusyAppointmentId('')
    if (error) {
      setActionError(getAppointmentError(error))
      return
    }
    if (changes.estado === 'confirmada') playAppointmentSound('confirmed')
    if (changes.estado === 'atendida') playAppointmentSound('attended')
    setReloadToken((current) => current + 1)
  }

  async function handleClinicalHistorySaved(appointment, history) {
    if (appointment.historiaClinica?.id && history) {
      setLoadResult((current) => current?.monthKey === monthKey
        ? { ...current, appointments: current.appointments.map((item) => item.id === appointment.id ? { ...item, historia_clinica: [history] } : item) }
        : current)
      setActionSuccess('Historia clínica actualizada. El estado de la cita no cambió.')
      setReloadToken((current) => current + 1)
      return { ok: true }
    }
    if (appointment.packageClinicalContext) {
      if (appointment.packageAttendanceContext) setPreparedAttendance(appointment.packageAttendanceContext)
      if (history) {
        setLoadResult((current) => current?.monthKey === monthKey
          ? { ...current, appointments: current.appointments.map((item) => item.id === appointment.id ? { ...item, historia_clinica: [history] } : item) }
          : current)
        setReloadToken((current) => current + 1)
      }
      return { ok: true }
    }
    setActionError('')
    setActionSuccess('Historia clínica guardada. El estado de la cita no cambió.')
    setReloadToken((current) => current + 1)
    return { ok: true }
  }

  async function handleMarkAttended(appointment) {
    if (!isAppointmentToday(appointment)) {
      setActionError('Solo puedes marcar atendida la cita el día programado.')
      return
    }
    const service = asOne(appointment.servicio)
    const totalSessions = Math.max(1, Number(service?.sesiones) || 1)
    if (totalSessions <= 1) {
      await updateAppointment(appointment, { estado: 'atendida' })
      return
    }
    if (!supabase || busyAppointmentId) return

    setBusyAppointmentId(appointment.id)
    setActionError('')
    try {
      const sessionNote = parseTreatmentSessionNote(appointment.notas)
      const treatmentQuery = supabase.from('tratamientos').select('*')
      const { data: activeTreatment, error: treatmentQueryError } = sessionNote?.treatmentId
        ? await treatmentQuery.eq('id', sessionNote.treatmentId).eq('estado', 'en_curso').maybeSingle()
        : await treatmentQuery
          .eq('cliente_id', appointment.cliente_id)
          .eq('servicio_id', appointment.servicio_id)
          .eq('estado', 'en_curso')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      if (treatmentQueryError) throw new Error(treatmentQueryError.message || 'No se pudo consultar el tratamiento activo.')

      let treatment = activeTreatment
      if (!treatment) {
        if (sessionNote?.treatmentId) throw new Error('No se encontró el tratamiento relacionado con esta sesión. No se creó otro paquete.')
        const { data, error: insertError } = await supabase.from('tratamientos').insert({
          cliente_id: appointment.cliente_id,
          servicio_id: appointment.servicio_id,
          profesional_id: appointment.profesional_id,
          total_sesiones: totalSessions,
          sesiones_completadas: 0,
          fecha_inicio: getLocalDateKey(),
          estado: 'en_curso',
        }).select('*').single()
        if (insertError) throw new Error(insertError.message || 'No se pudo crear el tratamiento.')
        treatment = data
      }

      const numeroSesion = sessionNote?.treatmentId === treatment.id
        ? sessionNote.number
        : (Number(treatment.sesiones_completadas) || 0) + 1
      const treatmentTotal = Number(treatment.total_sesiones) || totalSessions
      if (numeroSesion > treatmentTotal) throw new Error('El tratamiento ya completó todas sus sesiones.')
      const attendanceContext = {
        appointment,
        treatmentId: treatment.id,
        numeroSesion,
        totalSesiones: treatmentTotal,
        esPrimeraSesion: numeroSesion === 1,
        service,
      }

      if (numeroSesion === 1) {
        const { data: existingHistory, error: historyQueryError } = await supabase.from('historia_clinica')
          .select('id')
          .eq('cita_id', appointment.id)
          .limit(1)
          .maybeSingle()
        if (historyQueryError) throw new Error(historyQueryError.message || 'No se pudo verificar la historia clínica de primera sesión.')
        if (existingHistory) {
          setPreparedAttendance(attendanceContext)
        } else {
          setClinicalTarget({ ...appointment, packageClinicalContext: true, packageAttendanceContext: attendanceContext })
        }
      } else {
        setAttendanceTarget(attendanceContext)
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo preparar la firma de asistencia.')
    }
    setBusyAppointmentId('')
  }

  async function confirmSessionAttendance({ signatureCanvas, observaciones, tratamientoId, numeroSesion, totalSesiones, cita }) {
    if (!supabase) return { error: 'la conexión con Supabase no está configurada.' }
    if (!isAppointmentToday(cita)) return { error: 'La asistencia solo se puede firmar el día programado de la cita.' }
    const { path, error: signatureError } = await uploadAttendanceSignature(signatureCanvas, tratamientoId, numeroSesion)
    if (signatureError) return { error: signatureError }

    const { data: existingAttendance, error: attendanceQueryError } = await supabase.from('asistencias_sesion')
      .select('id')
      .eq('tratamiento_id', tratamientoId)
      .eq('numero_sesion', numeroSesion)
      .limit(1)
      .maybeSingle()
    if (attendanceQueryError) return { error: attendanceQueryError.message || 'No se pudo verificar la asistencia existente.' }

    const attendanceData = {
      tratamiento_id: tratamientoId,
      cita_id: cita.id,
      numero_sesion: numeroSesion,
      fecha_asistencia: toDateKey(new Date()),
      hora_inicio: cita.hora_inicio,
      firma_paciente_url: path,
      profesional_id: cita.profesional_id,
      observaciones_sesion: observaciones || null,
    }
    const attendanceResult = existingAttendance
      ? await supabase.from('asistencias_sesion').update(attendanceData).eq('id', existingAttendance.id)
      : await supabase.from('asistencias_sesion').insert(attendanceData)
    if (attendanceResult.error) return { error: attendanceResult.error.message || 'No se pudo guardar la asistencia.' }

    const { count: completedSessions, error: countError } = await supabase.from('asistencias_sesion')
      .select('id', { count: 'exact', head: true })
      .eq('tratamiento_id', tratamientoId)
    if (countError) return { error: countError.message || 'La asistencia se guardó, pero no se pudo calcular el progreso del tratamiento.' }

    const treatmentUpdate = { sesiones_completadas: completedSessions ?? numeroSesion }
    if (treatmentUpdate.sesiones_completadas >= totalSesiones) treatmentUpdate.estado = 'completado'
    const { error: treatmentUpdateError } = await supabase.from('tratamientos').update(treatmentUpdate).eq('id', tratamientoId)
    if (treatmentUpdateError) return { error: treatmentUpdateError.message || 'La asistencia se guardó, pero no se pudo actualizar el tratamiento.' }

    const { data: updatedAppointment, error: appointmentUpdateError } = await supabase.from('citas')
      .update({ estado: 'atendida', updated_at: getUpdatedAt() })
      .eq('id', cita.id)
      .select('id')
      .maybeSingle()
    if (appointmentUpdateError) return { error: getAppointmentError(appointmentUpdateError) }
    if (!updatedAppointment) return { error: 'La asistencia se guardó, pero no se confirmó el cambio de estado de la cita.' }

    setLoadResult((current) => current?.monthKey === monthKey
      ? { ...current, appointments: current.appointments.map((item) => item.id === cita.id ? { ...item, estado: 'atendida' } : item) }
      : current)
    setPreparedAttendance(null)
    setAttendanceTarget(null)
    setReloadToken((current) => current + 1)
    playAppointmentSound('attended')
    return { ok: true }
  }

  async function confirmCancellation() {
    if (!cancelTarget) return
    const { appointment, isPackage, treatment, relatedAppointments } = cancelTarget
    setBusyAppointmentId(appointment.id)
    setCancelError('')

    if (isPackage) {
      const { error: treatmentError } = await supabase.from('tratamientos')
        .update({ estado: 'abandonado' })
        .eq('id', treatment.id)
      if (treatmentError) {
        setBusyAppointmentId('')
        setCancelError(getAppointmentError(treatmentError))
        return
      }

      const { error: appointmentsError } = await supabase.from('citas')
        .update({ estado: 'cancelada', motivo_cancelacion: 'Tratamiento completo cancelado desde el calendario', updated_at: getUpdatedAt() })
        .in('id', relatedAppointments.map((item) => item.id))
        .in('estado', ['pendiente', 'confirmada'])

      if (appointmentsError) {
        const { error: rollbackError } = await supabase.from('tratamientos')
          .update({ estado: 'en_curso' })
          .eq('id', treatment.id)
        setBusyAppointmentId('')
        setCancelError(rollbackError
          ? `No se pudieron cancelar las citas y tampoco restaurar el tratamiento: ${appointmentsError.message}`
          : getAppointmentError(appointmentsError))
        return
      }

      let remainingAppointments
      try {
        remainingAppointments = await loadOpenTreatmentAppointments(appointment, treatment, asOne(appointment.servicio))
      } catch (refreshError) {
        const { error: rollbackError } = await supabase.from('tratamientos')
          .update({ estado: 'en_curso' })
          .eq('id', treatment.id)
        setBusyAppointmentId('')
        setCancelError(rollbackError
          ? `No se pudo verificar el resultado ni restaurar el tratamiento: ${refreshError.message}`
          : `No se pudo verificar que todas las citas se cancelaran: ${refreshError.message}`)
        return
      }

      if (remainingAppointments.length > 0) {
        const { error: rollbackError } = await supabase.from('tratamientos')
          .update({ estado: 'en_curso' })
          .eq('id', treatment.id)
        setCancelTarget({ ...cancelTarget, relatedAppointments: remainingAppointments })
        setBusyAppointmentId('')
        setCancelError(rollbackError
          ? 'Quedaron citas activas y no se pudo restaurar el tratamiento. Actualiza el calendario antes de continuar.'
          : `Quedaron ${remainingAppointments.length} citas activas. Confirma de nuevo para cancelar las restantes.`)
        return
      }
    } else {
      const { error } = await supabase
        .from('citas')
        .update({ estado: 'cancelada', motivo_cancelacion: 'Cancelada desde el calendario', updated_at: getUpdatedAt() })
        .eq('id', appointment.id)

      if (error) {
        setBusyAppointmentId('')
        setCancelError(getAppointmentError(error))
        return
      }
    }

    playAppointmentSound('cancelled')
    setBusyAppointmentId('')
    setCancelTarget(null)
    setReloadToken((current) => current + 1)
  }

  async function requestCancellation(appointment) {
    const service = asOne(appointment.servicio)
    setCancelError('')

    if (Number(service?.sesiones) <= 1) {
      setCancelTarget({ appointment, isPackage: false, relatedAppointments: [appointment], loading: false })
      return
    }

    const sessionNote = parseTreatmentSessionNote(appointment.notas)
    if (!sessionNote || (!sessionNote.treatmentId && sessionNote.serviceName !== service?.nombre)) {
      setCancelTarget({ appointment, isPackage: false, relatedAppointments: [appointment], loading: false })
      return
    }

    setCancelTarget({ appointment, isPackage: true, relatedAppointments: [], loading: true, treatment: null })
    if (!supabase) {
      setCancelTarget({ appointment, isPackage: true, relatedAppointments: [], loading: false, treatment: null, lookupError: 'La conexión con Supabase no está configurada.' })
      return
    }

    try {
      const { data: treatments, error: treatmentError } = await supabase.from('tratamientos')
        .select('id, cliente_id, servicio_id, total_sesiones, fecha_inicio, estado, created_at')
        .eq('cliente_id', appointment.cliente_id)
        .eq('servicio_id', appointment.servicio_id)
        .eq('estado', 'en_curso')
        .lte('fecha_inicio', appointment.fecha)
        .order('created_at', { ascending: false })
        .limit(20)
      if (treatmentError) throw treatmentError

      const treatment = (treatments ?? []).find((item) => sessionNote.treatmentId
        ? item.id === sessionNote.treatmentId
        : Number(item.total_sesiones) === sessionNote.total)
      if (!treatment) {
        setCancelTarget({ appointment, isPackage: true, relatedAppointments: [], loading: false, treatment: null, lookupError: 'No se encontró un tratamiento activo relacionado. No se canceló ninguna cita.' })
        return
      }

      const relatedAppointments = await loadOpenTreatmentAppointments(appointment, treatment, service)
      if (!relatedAppointments.some((item) => item.id === appointment.id)) {
        setCancelTarget({ appointment, isPackage: true, relatedAppointments: [], loading: false, treatment, lookupError: 'No se pudo asociar esta cita con seguridad al tratamiento. No se canceló ninguna cita.' })
        return
      }

      setCancelTarget({ appointment, isPackage: true, relatedAppointments, loading: false, treatment })
    } catch (lookupError) {
      setCancelTarget({
        appointment,
        isPackage: true,
        relatedAppointments: [],
        loading: false,
        treatment: null,
        lookupError: getAppointmentError(lookupError),
      })
    }
  }

  function requestPhoto(appointment, type, existingPhoto = null) {
    photoContextRef.current = { appointment, type, existingPhoto }
    photoInputRef.current?.click()
  }

  async function handlePhotoSelected(event) {
    const file = event.target.files?.[0]
    const photoContext = photoContextRef.current
    event.target.value = ''
    if (!file || !photoContext || !supabase) return
    if (file.size <= 0) {
      setActionError('El archivo seleccionado está vacío. Toma la foto de nuevo e inténtalo otra vez.')
      return
    }
    if (!isImageFile(file)) {
      setActionError('Selecciona un archivo de imagen válido.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setActionError('La foto debe pesar menos de 10 MB.')
      return
    }

    const { appointment, type, existingPhoto } = photoContext
    const uploadKey = `${appointment.id}:${type}`
    setUploadingPhoto(uploadKey)
    setActionError('')
    console.log('Archivo a subir:', { size: file.size, type: file.type || 'MIME no detectado' })

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('No se pudo verificar la sesión. Inicia sesión de nuevo.')
      const photoBlob = await convertPhotoToJpeg(file)
      const storagePath = `${appointment.cliente_id}/${appointment.id}/${type}-${makeUploadToken()}.jpg`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(photoBucket)
        .upload(storagePath, photoBlob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })

      if (uploadError) throw uploadError

      const photoValues = {
        cita_id: appointment.id,
        cliente_id: appointment.cliente_id,
        tipo: type,
        url_foto: uploadData.path,
        fecha_subida: getUpdatedAt(),
        subida_por: user.id,
      }
      const photoResult = existingPhoto
        ? await supabase.from('fotos_cita').update(photoValues).eq('id', existingPhoto.id).select('id').maybeSingle()
        : await supabase.from('fotos_cita').insert(photoValues).select('id').single()

      if (photoResult.error || !photoResult.data) {
        await supabase.storage.from(photoBucket).remove([uploadData.path])
        throw photoResult.error || new Error('No se pudo actualizar el registro de la foto. Ejecuta supabase/fotos_cita_update_policy.sql en Supabase y vuelve a intentarlo.')
      }

      if (existingPhoto?.url_foto && !/^https?:\/\//i.test(existingPhoto.url_foto)) {
        const { error: oldPhotoError } = await supabase.storage.from(photoBucket).remove([existingPhoto.url_foto])
        if (oldPhotoError) console.warn('La foto anterior quedó almacenada, pero la nueva quedó activa.', oldPhotoError)
      }
    } catch (uploadError) {
      console.error('Error detallado al subir foto:', uploadError)
      console.error('Mensaje:', uploadError?.message)
      console.error('Status:', uploadError?.statusCode ?? uploadError?.status)
      setActionError(getStorageError(uploadError))
      setUploadingPhoto('')
      return
    }

    setUploadingPhoto('')
    setReloadToken((current) => current + 1)
  }

  return (
    <section className="workspace-main appointments-page">
      <header className="appointments-heading">
        <div>
          <span className="eyebrow text-dorado-oscuro">AGENDA</span>
          <h1>Calendario</h1>
        </div>
        <div className="appointments-heading__actions">
          <button
            className="appointments-sound-toggle"
            type="button"
            role="switch"
            aria-checked={soundsEnabled}
            aria-label={`Sonidos de confirmación ${soundsEnabled ? 'activados' : 'desactivados'}`}
            title={`Sonidos ${soundsEnabled ? 'activados' : 'desactivados'}`}
            onClick={toggleSounds}
          >
            {soundsEnabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
            <span>Sonidos</span>
          </button>
          <button className="appointments-add" type="button" onClick={() => setFormState({ mode: 'create', date: selectedDate })}>
            <CalendarDays size={17} aria-hidden="true" /> Nueva cita
          </button>
        </div>
      </header>
      <button
        className="floating-action appointments-floating-action"
        type="button"
        aria-label="Agendar una cita"
        title="Agendar una cita"
        onClick={() => setFormState({ mode: 'create', date: selectedDate })}
      >
        <CalendarDays size={22} aria-hidden="true" />
      </button>

      <section className="calendar-panel" aria-label={`Calendario de ${formatMonth(month)}`}>
        <header className="calendar-toolbar">
          <button type="button" className="calendar-month-nav" aria-label="Mes anterior" onClick={() => changeMonth(-1)}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <h2>{formatMonth(month)}</h2>
          <button type="button" className="calendar-month-nav" aria-label="Mes siguiente" onClick={() => changeMonth(1)}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="calendar-weekdays" aria-hidden="true">
          {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
        </div>
        <div className="calendar-grid" role="grid" aria-label={formatMonth(month)}>
          {calendarDays.map(({ date, key, inMonth }) => {
            const dayAppointments = appointmentCounts[key] ?? { total: 0, hasOverdue: false }
            const count = dayAppointments.total
            const isSelected = selectedDate === key
            const isToday = toDateKey(today) === key
            const overdueClass = dayAppointments.hasOverdue ? ' calendar-day--has-overdue' : ''
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                className={`calendar-day${inMonth ? '' : ' calendar-day--outside'}${isSelected ? ' calendar-day--selected' : ''}${isToday ? ' calendar-day--today' : ''}${overdueClass}`}
                aria-label={`${date.getDate()} ${formatMonth(date)}${count ? `, ${count} ${count === 1 ? 'cita' : 'citas'}` : ''}${dayAppointments.hasOverdue ? ', con citas vencidas no atendidas' : ''}`}
                aria-pressed={isSelected}
                disabled={!inMonth}
                onClick={() => setSelectedDate(key)}
              >
                <span>{date.getDate()}</span>
                {count > 0 && <span className={`calendar-day__count${dayAppointments.hasOverdue ? ' calendar-day__count--overdue' : ''}`}>{count}</span>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="day-agenda" aria-live="polite">
        <header className="day-agenda__heading">
          <h2>{formatSelectedDate(selectedDate)}</h2>
          <span>{selectedAppointments.length} {selectedAppointments.length === 1 ? 'cita' : 'citas'}</span>
        </header>
        {loadError && <p className="client-state client-state--error" role="alert">{loadError}</p>}
        {actionError && <p className="client-state client-state--error" role="alert">{actionError}</p>}
        {actionSuccess && <p className="appointment-success" role="status" aria-live="polite">✅ {actionSuccess}</p>}
        {loading && <p className="client-state" role="status">Cargando calendario…</p>}
        {!loading && !loadError && selectedAppointments.length === 0 && (
          <div className="calendar-empty">
            <span>No hay citas para este día.</span>
            <button type="button" onClick={() => setFormState({ mode: 'create', date: selectedDate })}>Agendar cita</button>
          </div>
        )}

        <div className="appointment-list">
          {selectedAppointments.map((appointment) => {
            const client = asOne(appointment.cliente)
            const service = asOne(appointment.servicio)
            const photos = appointment.fotos_cita ?? []
            const orderedPhotos = [...photos].sort((first, second) => (
              getPhotoTypeOrder(first) - getPhotoTypeOrder(second)
              || (Date.parse(second.fecha_subida) || 0) - (Date.parse(first.fecha_subida) || 0)
            ))
            const isBusy = busyAppointmentId === appointment.id
            const photoLoadingType = uploadingPhoto.startsWith(`${appointment.id}:`) ? uploadingPhoto.slice(appointment.id.length + 1) : ''
            const isOverdue = isOverdueAppointment(appointment)
            const isToday = isAppointmentToday(appointment)
            const beforePhoto = latestPhotoOfType(photos, 'antes')
            const afterPhoto = latestPhotoOfType(photos, 'despues')
            const totalSessions = Math.max(1, Number(service?.sesiones) || 1)
            const sessionNote = parseTreatmentSessionNote(appointment.notas)
            const sessionNumber = sessionNote?.number ?? 0
            const clinicalHistories = asList(appointment.historia_clinica)
            const clinicalHistory = clinicalHistories[0] ?? null
            const hasClinicalHistory = Boolean(clinicalHistory)
            const canOpenClinicalHistory = ['confirmada', 'atendida'].includes(appointment.estado) && !isOverdue
            const hasBeforePhoto = Boolean(beforePhoto)
            const hasAfterPhoto = Boolean(afterPhoto)
            const viewablePhotos = orderedPhotos.filter((photo) => photo.displayUrl).map((photo) => ({
              id: photo.id,
              url: photo.displayUrl,
              type: photo.tipo === 'antes' ? 'Antes' : photo.tipo === 'despues' ? 'Después' : photo.tipo,
              service: service?.nombre || '',
              date: `${formatSelectedDate(appointment.fecha)} · ${formatTime(appointment.hora_inicio)}`,
              alt: `Foto ${photo.tipo} del tratamiento de ${client?.nombre || 'cliente'}`,
            }))
            const attendanceReady = preparedAttendance?.appointment.id === appointment.id
            const isPackageService = Number(service?.sesiones) > 1
            const canTakePhotos = !isOverdue && ['confirmada', 'atendida'].includes(appointment.estado)
            const photoEligibilityAppointment = { ...appointment, fecha: getLocalDateKey() }
            const canTakeBeforePhoto = canTakePhotos && (hasBeforePhoto
              ? appointment.estado !== 'atendida'
              : canCaptureAppointmentPhoto(appointment, 'antes', totalSessions, isPackageService ? sessionNumber : 1))
            const canTakeAfterPhoto = canTakePhotos && (hasAfterPhoto
              ? appointment.estado !== 'atendida'
              : canCaptureAppointmentPhoto(appointment, 'despues', totalSessions, isPackageService ? sessionNumber : 1))
            const showBeforePhotoAction = canTakePhotos && !hasBeforePhoto
              && canCaptureAppointmentPhoto(photoEligibilityAppointment, 'antes', totalSessions, isPackageService ? sessionNumber : 1)
            const showAfterPhotoAction = canTakePhotos && !hasAfterPhoto
              && canCaptureAppointmentPhoto(photoEligibilityAppointment, 'despues', totalSessions, isPackageService ? sessionNumber : 1)
            const photosWaitForAppointmentDay = (showBeforePhotoAction && !canTakeBeforePhoto) || (showAfterPhotoAction && !canTakeAfterPhoto)
            const highlightClinicalHistory = canOpenClinicalHistory && !isPackageService && !hasClinicalHistory
            const highlightBeforePhoto = showBeforePhotoAction && canTakeBeforePhoto
            const highlightAfterPhoto = showAfterPhotoAction && canTakeAfterPhoto
            return (
              <article
                id={`appointment-${appointment.id}`}
                className={`appointment-card appointment-card--${appointment.estado}${isOverdue ? ' appointment-card--overdue' : ''}${requestedAppointmentId === appointment.id ? ' appointment-card--target' : ''}`}
                key={appointment.id}
              >
                <div className="appointment-card__time">
                  <strong>{formatTime(appointment.hora_inicio)}</strong>
                  <span>{formatTime(appointment.hora_fin)}</span>
                </div>
                <div className="appointment-card__body">
                  <header className="appointment-card__heading">
                    <div>
                      <h3>{client?.nombre || 'Cliente'}</h3>
                      <p className="appointment-card__service-line">
                        <span className="appointment-card__service-name">{service?.nombre || 'Servicio'}</span>
                        <span className="appointment-card__session-count">{totalSessions} {totalSessions === 1 ? 'sesión' : 'sesiones'}</span>
                      </p>
                    </div>
                    <span className={`appointment-status appointment-status--${isOverdue ? 'overdue' : appointment.estado}`}>{isOverdue ? 'No atendida' : appointment.estado.replace('_', ' ')}</span>
                  </header>
                  {isOverdue && <p className="appointment-card__overdue-note">Esta cita no fue atendida</p>}
                  {getVisibleAppointmentNotes(appointment.notas) && <p className="appointment-card__notes">{getVisibleAppointmentNotes(appointment.notas)}</p>}

                  {photos.length > 0 && (
                    <div className="appointment-photos">
                      {orderedPhotos.map((photo) => (
                        <div className="appointment-photo" key={photo.id}>
                          <div className="appointment-photo__content">
                            <button
                              className="appointment-photo__open"
                              type="button"
                              aria-label={`Ampliar foto ${photo.tipo} del tratamiento de ${client?.nombre || 'cliente'}`}
                              disabled={!photo.displayUrl}
                              onClick={() => setPhotoViewer({
                                photos: viewablePhotos,
                                initialIndex: Math.max(0, viewablePhotos.findIndex((item) => item.id === photo.id)),
                              })}
                            >
                              {photo.displayUrl
                                ? <img src={photo.displayUrl} alt={`Foto ${photo.tipo} del tratamiento de ${client?.nombre || 'cliente'}`} />
                                : <span className="appointment-photo__missing">Foto privada no disponible</span>}
                            </button>
                            <span>{photo.tipo === 'antes' ? 'Antes' : 'Después'}</span>
                          </div>
                          {photo.displayUrl && appointment.estado !== 'atendida' && (
                            <button
                              className="appointment-action appointment-photo__replace"
                              type="button"
                              disabled={Boolean(uploadingPhoto)}
                              onClick={() => requestPhoto(appointment, photo.tipo, photo)}
                            >
                              <Camera size={14} aria-hidden="true" /> Cambiar foto
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="appointment-card__actions">
                    {appointment.estado === 'pendiente' && !isOverdue && (
                      <button className="appointment-action appointment-action--confirm" type="button" title={isToday ? 'Confirmar cita' : 'Disponible el día de la cita'} disabled={isBusy || !isToday} onClick={() => updateAppointment(appointment, { estado: 'confirmada' })}>
                        <Check size={15} aria-hidden="true" /> Confirmar
                      </button>
                    )}
                    {appointment.estado === 'pendiente' && !isOverdue && !isToday && <span className="appointment-day-hint" role="status">Confirmación disponible el día de la cita.</span>}
                    {appointment.estado === 'pendiente' && !isOverdue && (
                      <button className="appointment-action" type="button" disabled={isBusy} onClick={() => setFormState({ mode: 'edit', appointment })}>
                        <Pencil size={15} aria-hidden="true" /> Cambiar fecha
                      </button>
                    )}
                    {(appointment.estado === 'pendiente' || appointment.estado === 'confirmada') && (
                      <button className="appointment-action appointment-action--cancel" type="button" disabled={isBusy} onClick={() => requestCancellation(appointment)}>
                        <X size={15} aria-hidden="true" /> Cancelar
                      </button>
                    )}
                    {canOpenClinicalHistory && !isPackageService && !hasClinicalHistory && (
                      <button className={`appointment-action${highlightClinicalHistory ? ' appointment-action--needs-attention' : ''}`} type="button" disabled={isBusy} onClick={() => { setActionError(''); setClinicalTarget(appointment) }}>
                        <FileText size={15} aria-hidden="true" /> Historia clínica
                      </button>
                    )}
                    {canOpenClinicalHistory && hasClinicalHistory && (
                      <div className="appointment-clinical-actions">
                        <span className="appointment-clinical-ready" role="status">Historia clínica guardada</span>
                        {appointment.estado === 'confirmada' && (
                          <button className="appointment-action" type="button" disabled={isBusy} onClick={() => { setActionError(''); setClinicalTarget({ ...appointment, historiaClinica: clinicalHistory }) }}>
                            <Pencil size={15} aria-hidden="true" /> Editar historia
                          </button>
                        )}
                      </div>
                    )}
                    {showBeforePhotoAction && (
                      <button className={`appointment-action${highlightBeforePhoto ? ' appointment-action--needs-attention' : ''}`} type="button" title={canTakeBeforePhoto ? 'Tomar foto antes' : 'Disponible el día de la cita'} disabled={Boolean(uploadingPhoto) || !canTakeBeforePhoto} onClick={() => requestPhoto(appointment, 'antes')}>
                        <Camera size={15} aria-hidden="true" /> Foto antes
                      </button>
                    )}
                    {showAfterPhotoAction && (
                      <button className={`appointment-action${highlightAfterPhoto ? ' appointment-action--needs-attention' : ''}`} type="button" title={canTakeAfterPhoto ? 'Tomar foto después' : 'Disponible el día de la cita'} disabled={Boolean(uploadingPhoto) || !canTakeAfterPhoto} onClick={() => requestPhoto(appointment, 'despues')}>
                        <Camera size={15} aria-hidden="true" /> Foto después
                      </button>
                    )}
                    {photosWaitForAppointmentDay && <span className="appointment-photo-hint" role="status">Fotos disponibles el día de la cita.</span>}
                    {appointment.estado === 'confirmada' && !isOverdue && (
                      <>
                        {attendanceReady
                          ? <button className="appointment-action appointment-action--confirm" type="button" disabled={isBusy || !isToday} onClick={() => setAttendanceTarget(preparedAttendance)}><Check size={15} aria-hidden="true" /> Firmar asistencia</button>
                          : <button className="appointment-action appointment-action--confirm" type="button" title={!isToday ? 'Disponible el día de la cita' : undefined} disabled={isBusy || !isToday || (!isPackageService && !hasClinicalHistory)} onClick={() => { setActionError(''); handleMarkAttended(appointment) }}><Check size={15} aria-hidden="true" /> Marcar atendida</button>}
                      </>
                    )}
                    {appointment.estado === 'confirmada' && !isToday && <span className="appointment-day-hint" role="status">Atención disponible el día de la cita.</span>}
                    {photoLoadingType && <span className="appointment-uploading" role="status" aria-live="polite"><LoaderCircle className="appointment-uploading__spinner" size={14} aria-hidden="true" /> Cargando foto {photoLoadingType === 'antes' ? 'antes' : 'después'}…</span>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <input ref={photoInputRef} className="visually-hidden-file" type="file" accept="image/*" capture="environment" onChange={handlePhotoSelected} />

      {photoViewer && <PhotoLightbox photos={photoViewer.photos} initialIndex={photoViewer.initialIndex} onClose={() => setPhotoViewer(null)} />}

      {attendanceTarget && !clinicalTarget && (
        <FirmaAsistencia
          cita={attendanceTarget.appointment}
          tratamientoId={attendanceTarget.treatmentId}
          servicio={attendanceTarget.service?.nombre}
          numeroSesion={attendanceTarget.numeroSesion}
          totalSesiones={attendanceTarget.totalSesiones}
          esPrimeraSesion={attendanceTarget.esPrimeraSesion}
          onCerrar={() => setAttendanceTarget(null)}
          onConfirmar={confirmSessionAttendance}
          onIrHistoria={() => setClinicalTarget({ ...attendanceTarget.appointment, packageClinicalContext: true })}
        />
      )}

      {clinicalTarget && <ClinicalHistoryForm cita={clinicalTarget} onGuardado={(history) => handleClinicalHistorySaved(clinicalTarget, history)} onCerrar={() => setClinicalTarget(null)} />}

      {formState && (
        <CitaForm
          appointment={formState.mode === 'edit' ? formState.appointment : null}
          initialDate={formState.date}
          onClose={() => setFormState(null)}
          onSaved={(result) => {
            if (formState.mode === 'create') playAppointmentSound('scheduled')
            setFormState(null)
            setReloadToken((current) => current + 1)
            setActionSuccess(result?.successMessage ?? '')
          }}
        />
      )}

      {cancelTarget && (
        <div className="creation-overlay">
          <section className="creation-dialog cancel-appointment-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cancel-appointment-title" aria-describedby="cancel-appointment-description">
            <button className="creation-dialog__close" type="button" aria-label="Cerrar confirmación" onClick={() => setCancelTarget(null)} disabled={busyAppointmentId === cancelTarget.appointment.id}>
              <X size={19} aria-hidden="true" />
            </button>
            <span className="eyebrow text-dorado-oscuro">{cancelTarget.isPackage ? 'ELIMINAR TRATAMIENTO' : 'CANCELAR CITA'}</span>
            <h2 id="cancel-appointment-title">{cancelTarget.isPackage ? '¿Eliminar este tratamiento?' : cancelTarget.appointment.estado === 'confirmada' ? '¿Seguro que desea cancelar la cita?' : '¿Seguro que quieres cancelar esta cita?'}</h2>
            {cancelTarget.loading ? (
              <p id="cancel-appointment-description" role="status">Buscando las citas relacionadas con este tratamiento…</p>
            ) : cancelTarget.isPackage ? (
              <>
                <p className="cancel-treatment-warning"><span>Tratamiento a eliminar:</span> <span className="cancel-treatment-warning__name">{asOne(cancelTarget.appointment.servicio)?.nombre || 'Tratamiento'}</span></p>
                <p id="cancel-appointment-description">Se eliminarán del calendario todas las citas relacionadas a este tratamiento de este paciente: <strong>{cancelTarget.relatedAppointments.length}</strong> {cancelTarget.relatedAppointments.length === 1 ? 'sesión pendiente o confirmada' : 'sesiones pendientes o confirmadas'}.</p>
                <p>Las sesiones ya atendidas se conservarán en el historial.</p>
              </>
            ) : (
              <p id="cancel-appointment-description">{cancelTarget.appointment.estado === 'confirmada'
                ? 'La cita se eliminará del calendario. La historia clínica y las fotos de esta atención se conservarán.'
                : 'Se eliminará del calendario.'}</p>
            )}
            {cancelTarget.lookupError && <p className="form-message form-message--error" role="alert">{cancelTarget.lookupError}</p>}
            {cancelError && <p className="form-message form-message--error" role="alert">{cancelError}</p>}
            <div className="client-delete-dialog__actions">
              <button className="appointment-action" type="button" onClick={() => setCancelTarget(null)} disabled={busyAppointmentId === cancelTarget.appointment.id}>Volver</button>
              <button
                className="appointment-action appointment-action--cancel"
                type="button"
                onClick={confirmCancellation}
                disabled={busyAppointmentId === cancelTarget.appointment.id || cancelTarget.loading || Boolean(cancelTarget.lookupError) || (cancelTarget.isPackage && cancelTarget.relatedAppointments.length === 0)}
              >
                {busyAppointmentId === cancelTarget.appointment.id ? 'Eliminando…' : cancelTarget.isPackage ? `Eliminar ${cancelTarget.relatedAppointments.length} citas` : 'Sí, cancelar cita'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default Citas