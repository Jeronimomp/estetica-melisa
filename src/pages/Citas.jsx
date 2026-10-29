import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import CitaForm from '@/components/CitaForm'
import HistoriaClinicaFacial from '@/components/HistoriaClinicaFacial'
import HistoriaClinicaCorporal from '@/components/HistoriaClinicaCorporal'
import HistoriaClinicaGeneral from '@/components/HistoriaClinicaGeneral'
import FirmaAsistencia from '@/components/FirmaAsistencia'
import { uploadAttendanceSignature } from '@/lib/clinicalSignature'

const photoBucket = 'fotos-cita'
const today = new Date()
const emptyAppointments = []

function makeUploadToken() {
  return `${Date.now()}-${crypto.randomUUID()}`
}

function getUpdatedAt() {
  return new Date().toISOString()
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(today))
  const [loadResult, setLoadResult] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [formState, setFormState] = useState(null)
  const [clinicalTarget, setClinicalTarget] = useState(null)
  const [attendanceTarget, setAttendanceTarget] = useState(null)
  const [preparedAttendance, setPreparedAttendance] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelError, setCancelError] = useState('')
  const [actionError, setActionError] = useState('')
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
    if (!supabase) return undefined
    let active = true
    const { start, end } = getMonthRange(month)

    async function loadAppointments() {
      const { data, error } = await supabase
        .from('citas')
        .select('id, cliente_id, profesional_id, servicio_id, empleado_id, fecha, hora_inicio, hora_fin, estado, notas, cliente:clientes(id, nombre, correo, telefono, fecha_nacimiento, estado_civil, peso, estatura), profesional:profesionales(id, nombre, especialidad), servicio:servicios(id, nombre, categoria, sesiones, requiere_consentimiento, duracion_minutos), historia_clinica(id, tipo), fotos_cita(id, tipo, url_foto, fecha_subida)')
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
    setReloadToken((current) => current + 1)
  }

  async function handleClinicalHistorySaved(appointment) {
    if (appointment.packageClinicalContext) {
      if (appointment.packageAttendanceContext) setPreparedAttendance(appointment.packageAttendanceContext)
      return { ok: true }
    }
    if (!supabase) return { error: 'la conexión con Supabase no está configurada.' }
    setBusyAppointmentId(appointment.id)
    setActionError('')
    let updateResult
    try {
      updateResult = await supabase.from('citas')
        .update({ estado: 'atendida', updated_at: getUpdatedAt() })
        .eq('id', appointment.id)
        .select('id')
        .maybeSingle()
    } catch {
      setBusyAppointmentId('')
      return { error: 'no se pudo actualizar el estado de la cita. Intenta de nuevo.' }
    }
    setBusyAppointmentId('')
    if (updateResult.error) return { error: getAppointmentError(updateResult.error) }
    if (!updateResult.data) return { error: 'no se confirmó el cambio de estado. Verifica los permisos de tu cuenta.' }

    setLoadResult((current) => current?.monthKey === monthKey
      ? { ...current, appointments: current.appointments.map((item) => item.id === appointment.id ? { ...item, estado: 'atendida' } : item) }
      : current)
    setReloadToken((current) => current + 1)
    return { ok: true }
  }

  async function handleMarkAttended(appointment) {
    const service = asOne(appointment.servicio)
    const totalSessions = Math.max(1, Number(service?.sesiones) || 1)
    if (totalSessions <= 1) {
      setClinicalTarget(appointment)
      return
    }
    if (!supabase || busyAppointmentId) return

    setBusyAppointmentId(appointment.id)
    setActionError('')
    try {
      const { data: activeTreatment, error: treatmentQueryError } = await supabase.from('tratamientos')
        .select('*')
        .eq('cliente_id', appointment.cliente_id)
        .eq('servicio_id', appointment.servicio_id)
        .eq('estado', 'en_curso')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (treatmentQueryError) throw new Error(treatmentQueryError.message || 'No se pudo consultar el tratamiento activo.')

      let treatment = activeTreatment
      if (!treatment) {
        const { data, error: insertError } = await supabase.from('tratamientos').insert({
          cliente_id: appointment.cliente_id,
          servicio_id: appointment.servicio_id,
          profesional_id: appointment.profesional_id,
          total_sesiones: totalSessions,
          sesiones_completadas: 0,
          fecha_inicio: toDateKey(new Date()),
          estado: 'en_curso',
        }).select('*').single()
        if (insertError) throw new Error(insertError.message || 'No se pudo crear el tratamiento.')
        treatment = data
      }

      const numeroSesion = (Number(treatment.sesiones_completadas) || 0) + 1
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

    const treatmentUpdate = { sesiones_completadas: numeroSesion }
    if (numeroSesion === totalSesiones) treatmentUpdate.estado = 'completado'
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
    return { ok: true }
  }

  async function confirmCancellation() {
    if (!cancelTarget) return
    setBusyAppointmentId(cancelTarget.id)
    setCancelError('')
    const { error } = await supabase
      .from('citas')
      .update({ estado: 'cancelada', motivo_cancelacion: 'Cancelada desde el calendario', updated_at: getUpdatedAt() })
      .eq('id', cancelTarget.id)

    setBusyAppointmentId('')
    if (error) {
      setCancelError(getAppointmentError(error))
      return
    }
    setCancelTarget(null)
    setReloadToken((current) => current + 1)
  }

  function requestPhoto(appointment, type) {
    photoContextRef.current = { appointment, type }
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

    const { appointment, type } = photoContext
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

      const { error: photoRowError } = await supabase
        .from('fotos_cita')
        .insert({
          cita_id: appointment.id,
          cliente_id: appointment.cliente_id,
          tipo: type,
          url_foto: uploadData.path,
          fecha_subida: new Date().toISOString(),
          subida_por: user.id,
        })

      if (photoRowError) {
        await supabase.storage.from(photoBucket).remove([uploadData.path])
        throw photoRowError
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
        <button className="appointments-add" type="button" onClick={() => setFormState({ mode: 'create', date: selectedDate })}>
          <CalendarDays size={17} aria-hidden="true" /> Nueva cita
        </button>
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
            const professional = asOne(appointment.profesional)
            const service = asOne(appointment.servicio)
            const photos = appointment.fotos_cita ?? []
            const isBusy = busyAppointmentId === appointment.id
            const isOverdue = isOverdueAppointment(appointment)
            const attendanceReady = preparedAttendance?.appointment.id === appointment.id
            const isPackageService = Number(service?.sesiones) > 1
            return (
              <article className={`appointment-card appointment-card--${appointment.estado}${isOverdue ? ' appointment-card--overdue' : ''}`} key={appointment.id}>
                <div className="appointment-card__time">
                  <strong>{formatTime(appointment.hora_inicio)}</strong>
                  <span>{formatTime(appointment.hora_fin)}</span>
                </div>
                <div className="appointment-card__body">
                  <header className="appointment-card__heading">
                    <div>
                      <h3>{client?.nombre || 'Cliente'}</h3>
                      <p>{service?.nombre || 'Servicio'} · {professional?.nombre || 'Profesional'}</p>
                    </div>
                    <span className={`appointment-status appointment-status--${isOverdue ? 'overdue' : appointment.estado}`}>{isOverdue ? 'No atendida' : appointment.estado.replace('_', ' ')}</span>
                  </header>
                  {isOverdue && <p className="appointment-card__overdue-note">Esta cita no fue atendida</p>}
                  {appointment.notas && <p className="appointment-card__notes">{appointment.notas}</p>}

                  {photos.length > 0 && (
                    <div className="appointment-photos">
                      {photos.map((photo) => (
                        <a className="appointment-photo" href={photo.displayUrl || undefined} target="_blank" rel="noreferrer" key={photo.id}>
                          {photo.displayUrl
                            ? <img src={photo.displayUrl} alt={`Foto ${photo.tipo} del tratamiento de ${client?.nombre || 'cliente'}`} />
                            : <span className="appointment-photo__missing">Foto privada no disponible</span>}
                          <span>{photo.tipo === 'antes' ? 'Antes' : 'Después'}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="appointment-card__actions">
                    {appointment.estado === 'pendiente' && !isOverdue && (
                      <button className="appointment-action appointment-action--confirm" type="button" disabled={isBusy} onClick={() => updateAppointment(appointment, { estado: 'confirmada' })}>
                        <Check size={15} aria-hidden="true" /> Confirmar
                      </button>
                    )}
                    {(appointment.estado === 'pendiente' || appointment.estado === 'confirmada') && !isOverdue && (
                      <button className="appointment-action" type="button" disabled={isBusy} onClick={() => setFormState({ mode: 'edit', appointment })}>
                        <Pencil size={15} aria-hidden="true" /> Cambiar fecha
                      </button>
                    )}
                    {(appointment.estado === 'pendiente' || appointment.estado === 'confirmada') && (
                      <button className="appointment-action appointment-action--cancel" type="button" disabled={isBusy} onClick={() => { setCancelError(''); setCancelTarget(appointment) }}>
                        <X size={15} aria-hidden="true" /> Cancelar
                      </button>
                    )}
                    {appointment.estado === 'confirmada' && !isOverdue && !isPackageService && (
                      <>
                        <button className="appointment-action" type="button" disabled={Boolean(uploadingPhoto)} onClick={() => requestPhoto(appointment, 'antes')}>
                          <Camera size={15} aria-hidden="true" /> Foto antes
                        </button>
                        <button className="appointment-action" type="button" disabled={Boolean(uploadingPhoto)} onClick={() => requestPhoto(appointment, 'despues')}>
                          <Camera size={15} aria-hidden="true" /> Foto después
                        </button>
                      </>
                    )}
                    {appointment.estado === 'confirmada' && !isOverdue && (
                      <>
                        {attendanceReady
                          ? <button className="appointment-action appointment-action--confirm" type="button" disabled={isBusy} onClick={() => setAttendanceTarget(preparedAttendance)}><Check size={15} aria-hidden="true" /> Firmar asistencia</button>
                          : <button className="appointment-action appointment-action--confirm" type="button" disabled={isBusy} onClick={() => { setActionError(''); handleMarkAttended(appointment) }}><Check size={15} aria-hidden="true" /> Marcar atendida</button>}
                      </>
                    )}
                    {uploadingPhoto.startsWith(`${appointment.id}:`) && <span className="appointment-uploading">Subiendo foto…</span>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <input ref={photoInputRef} className="visually-hidden-file" type="file" accept="image/*" capture="environment" onChange={handlePhotoSelected} />

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

      {clinicalTarget && <ClinicalHistoryForm cita={clinicalTarget} onGuardado={() => handleClinicalHistorySaved(clinicalTarget)} onCerrar={() => setClinicalTarget(null)} />}

      {formState && (
        <CitaForm
          appointment={formState.mode === 'edit' ? formState.appointment : null}
          initialDate={formState.date}
          onClose={() => setFormState(null)}
          onSaved={() => {
            setFormState(null)
            setReloadToken((current) => current + 1)
          }}
        />
      )}

      {cancelTarget && (
        <div className="creation-overlay">
          <section className="creation-dialog cancel-appointment-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cancel-appointment-title" aria-describedby="cancel-appointment-description">
            <button className="creation-dialog__close" type="button" aria-label="Cerrar confirmación" onClick={() => setCancelTarget(null)} disabled={busyAppointmentId === cancelTarget.id}>
              <X size={19} aria-hidden="true" />
            </button>
            <span className="eyebrow text-dorado-oscuro">CANCELAR CITA</span>
            <h2 id="cancel-appointment-title">¿Cancelar esta cita?</h2>
            <p id="cancel-appointment-description">La cita de {asOne(cancelTarget.cliente)?.nombre || 'este cliente'} dejará de aparecer en el calendario.</p>
            {cancelError && <p className="form-message form-message--error" role="alert">{cancelError}</p>}
            <div className="client-delete-dialog__actions">
              <button className="appointment-action" type="button" onClick={() => setCancelTarget(null)} disabled={busyAppointmentId === cancelTarget.id}>Volver</button>
              <button className="appointment-action appointment-action--cancel" type="button" onClick={confirmCancellation} disabled={busyAppointmentId === cancelTarget.id}>
                {busyAppointmentId === cancelTarget.id ? 'Cancelando…' : 'Sí, cancelar cita'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default Citas