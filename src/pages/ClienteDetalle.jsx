import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, Camera, ClipboardList, FileText, Pencil, Trash2, UserRound, X } from 'lucide-react'
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

const photoBucket = 'fotos-cita'

function getHistoryError(error) {
  if (error?.code === 'PGRST205' || error?.code === 'PGRST200') {
    return 'El historial aparecerá cuando existan las relaciones entre citas, servicios, profesionales, historias clínicas y fotos.'
  }
  if (error?.code === '42501' || error?.code === 'PGRST301') {
    return 'Tu cuenta no tiene permiso para consultar el historial de atenciones.'
  }
  return 'No se pudo cargar el historial de atenciones.'
}

function getTreatmentError(error) {
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
    const attendedVisitIds = new Set(orderedAttendances.map((attendance) => attendance.cita_id).filter(Boolean))
    const visitsWithoutAttendance = safeVisits.filter((visit) => !attendedVisitIds.has(visit.id)).sort((first, second) => `${first.fecha}${first.hora_inicio}`.localeCompare(`${second.fecha}${second.hora_inicio}`))
    const attendanceByNumber = new Map(orderedAttendances.map((attendance) => [Number(attendance.numero_sesion), attendance]))
    const sessions = Array.from({ length: total }, (_, index) => {
      const numero = index + 1
      const asistencia = attendanceByNumber.get(numero) ?? null
      const visita = asistencia?.cita_id ? visitById.get(asistencia.cita_id) ?? null : visitsWithoutAttendance.shift() ?? null
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
    let visits = appointments.filter((visit) => attendanceIds.has(visit.id))

    if (treatment.estado === 'en_curso') {
      const startDate = String(treatment.fecha_inicio ?? '').slice(0, 10)
      const scheduledVisits = appointments.filter((visit) => (
        visit.servicio_id === treatment.servicio_id
        && Number(asList(visit.servicio)[0]?.sesiones) > 1
        && String(visit.fecha ?? '').slice(0, 10) >= startDate
        && !groupedVisitIds.has(visit.id)
      ))
      visits = [...visits, ...scheduledVisits]
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

function ClienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loadResult, setLoadResult] = useState(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [selectedHistory, setSelectedHistory] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [selectedTreatment, setSelectedTreatment] = useState(null)
  const result = loadResult?.id === id ? loadResult : null
  const loading = Boolean(supabase && !result)
  const client = result?.client ?? null
  const appointments = result?.appointments ?? []
  const treatments = result?.treatments ?? []
  const { groups: treatmentHistoryGroups, groupedVisitIds } = buildTreatmentHistoryGroups(treatments, appointments)
  const standaloneAppointments = appointments.filter((visit) => !groupedVisitIds.has(visit.id))
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

      const { data: visitData, error: visitError } = await supabase
        .from('citas')
        .select('id, cliente_id, servicio_id, fecha, hora_inicio, estado, servicio:servicios(nombre, sesiones), profesional:profesionales(nombre), historia_clinica(id, tipo, contenido, observaciones_sesion, fecha), fotos_cita(id, tipo, url_foto, fecha_subida)')
        .eq('cliente_id', id)
        .order('fecha', { ascending: false })
        .order('hora_inicio', { ascending: false })

      if (!active) return
     // Después:
      const visibleStatuses = ['atendida', 'confirmada', 'pendiente']
      const visibleVisits = visitError
        ? []
        : (visitData ?? []).filter((visit) => visibleStatuses.includes(visit.estado?.toLocaleLowerCase('es-MX')))
      const visitIds = visibleVisits.map((visit) => visit.id)
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

      const { data: treatmentData, error: treatmentQueryError } = await supabase
        .from('tratamientos')
        .select('id, cliente_id, servicio_id, profesional_id, total_sesiones, sesiones_completadas, fecha_inicio, estado, created_at, servicio:servicios(nombre, sesiones), profesional:profesionales(nombre), asistencias_sesion(id, cita_id, numero_sesion, fecha_asistencia, hora_inicio, firma_paciente_url, observaciones_sesion)')
        .eq('cliente_id', id)
        .order('created_at', { ascending: false })

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
      })
    }

    loadClient()
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!selectedPhoto) return undefined
    function handleKeyDown(event) {
      if (event.key === 'Escape') setSelectedPhoto(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedPhoto])

  function handleSaved(updatedClient) {
    setLoadResult((current) => current?.id === id ? { ...current, client: updatedClient } : current)
    setEditing(false)
  }

  function handleAfterPhotoSaved(visitId, photo) {
    setLoadResult((current) => current?.id === id
      ? { ...current, appointments: current.appointments.map((visit) => visit.id === visitId ? { ...visit, fotos_cita: [...asList(visit.fotos_cita), photo] } : visit) }
      : current)
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
        <h2 id="client-personal-title"><UserRound size={18} aria-hidden="true" /> Datos personales</h2>
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
          <ClientData label="Estado civil" value={formatCivilStatus(client.estado_civil)} />
          <ClientData label="Estatura" value={client.estatura ? `${Number(client.estatura).toFixed(2)} m` : null} />
          <ClientData label="Peso" value={client.peso ? `${Number(client.peso).toFixed(2)} kg` : null} />
          <ClientData label="IMC Calculado" value={bmiValue ? `${bmiValue} kg/m²` : null} valueClassName={bmiValue ? 'client-data__value--green' : ''} />
          <ClientData label="Documento" value={[client.tipo_documento, client.numero_documento].filter(Boolean).join(' · ')} />
          <ClientData label="Género" value={client.genero} />
          <ClientData label="Ciudad" value={client.ciudad} />
          <ClientData label="Dirección" value={client.direccion} />
          <ClientData label="Ocupación" value={client.ocupacion} />
          <ClientData label="¿Cómo nos conoció?" value={client.como_nos_conocio} />
          <ClientData label="Estado" value={client.activo ? 'Activo' : 'Inactivo'} />
        </dl>
        <div className="client-detail__medical">
          <ClientData label="Alergias" value={client.alergias} />
          <ClientData label="Enfermedades" value={client.enfermedades} />
          <ClientData label="Medicamentos" value={client.medicamentos} />
          <ClientData label="Observaciones" value={client.observaciones} />
        </div>
      </section>

      <section className="client-detail__section" aria-labelledby="client-history-title">
        <h2 id="client-history-title"><CalendarDays size={18} aria-hidden="true" /> Historial de atenciones</h2>
        {historyError && <p className="client-state client-state--notice" role="status">{historyError}</p>}
        {!historyError && appointments.length === 0 && <p className="client-state">Aún no hay citas para mostrar a este cliente.</p>}
        <div className="visit-list">
          {treatmentHistoryGroups.map((group) => (
            <TratamientoHistorialCard
              key={group.tratamiento.id}
              group={group}
              clientId={id}
              onPhotoSaved={handleAfterPhotoSaved}
              onViewPhoto={setSelectedPhoto}
            />
          ))}
          {standaloneAppointments.map((visit) => {
            const service = asList(visit.servicio)[0]
            const professional = asList(visit.profesional)[0]
            const histories = asList(visit.historia_clinica)
            const photos = asList(visit.fotos_cita)
            const beforePhoto = latestPhotoOfType(photos, 'antes')
            const afterPhoto = latestPhotoOfType(photos, 'despues')
            return (
              <article className="visit-card" key={visit.id}>
                <div className="visit-card__heading">
                  <div>
                    <span className="visit-card__date">{formatDate(visit.fecha, visit.hora_inicio)}</span>
                    <h3>{service?.nombre || 'Servicio'}</h3>
                    <p>Atendió: {professional?.nombre || 'Profesional no registrado'}</p>
                  </div>
                </div>
                <div className="visit-card__actions">
                  {histories.length > 0 && (
                    <Button type="button" variant="outline" onClick={() => setSelectedHistory({ historia: histories[0], servicio: service?.nombre, profesional: professional?.nombre })}>
                      <FileText size={16} aria-hidden="true" /> Ver historia clínica
                    </Button>
                  )}
                  <div className="visit-gallery" aria-label="Fotos de la atención">
                    <article className="visit-gallery__item">
                      <div className="visit-gallery__media">
                        {beforePhoto?.displayUrl
                          ? <button className="visit-gallery__open" type="button" aria-label="Ampliar foto antes" onClick={() => setSelectedPhoto({ url: beforePhoto.displayUrl, type: 'Antes', service: service?.nombre, date: formatDate(visit.fecha, visit.hora_inicio) })}><img src={beforePhoto.displayUrl} alt="Foto antes del servicio" loading="lazy" /></button>
                          : <div className="visit-gallery__placeholder"><Camera size={20} aria-hidden="true" /><span>{beforePhoto ? 'Foto no disponible' : 'Sin foto antes'}</span></div>}
                      </div>
                      <span className="visit-gallery__caption"><Camera size={14} aria-hidden="true" /> Antes</span>
                    </article>
                    <article className="visit-gallery__item">
                      <div className="visit-gallery__media">
                        {afterPhoto?.displayUrl
                          ? <button className="visit-gallery__open" type="button" aria-label="Ampliar foto después" onClick={() => setSelectedPhoto({ url: afterPhoto.displayUrl, type: 'Después', service: service?.nombre, date: formatDate(visit.fecha, visit.hora_inicio) })}><img src={afterPhoto.displayUrl} alt="Foto después del servicio" loading="lazy" /></button>
                          : <div className="visit-gallery__placeholder"><Camera size={20} aria-hidden="true" /><span>{afterPhoto ? 'Foto no disponible' : 'Sin foto después'}</span></div>}
                      </div>
                      <span className="visit-gallery__caption"><Camera size={14} aria-hidden="true" /> Después</span>
                      {!historyError && visit.estado !== 'cancelada' && (
                        <VisitAfterPhotoUploader
                          visit={visit}
                          clientId={id}
                          hasAfterPhoto={Boolean(afterPhoto)}
                          onSaved={(photo) => handleAfterPhotoSaved(visit.id, photo)}
                        />
                      )}
                    </article>
                  </div>
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
          {treatments.map((treatment) => (
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
      {selectedPhoto && (
        <div className="photo-lightbox-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPhoto(null) }}>
          <section className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Foto ${selectedPhoto.type.toLowerCase()} ${selectedPhoto.service || ''}`}>
            <button className="photo-lightbox__close" type="button" aria-label="Cerrar foto" onClick={() => setSelectedPhoto(null)}><X size={21} aria-hidden="true" /></button>
            <img className="photo-lightbox__image" src={selectedPhoto.url} alt={`Foto ${selectedPhoto.type.toLowerCase()} del servicio ${selectedPhoto.service || ''}`} />
            <div className="photo-lightbox__caption"><strong>{selectedPhoto.type}</strong>{selectedPhoto.service && <span>{selectedPhoto.service}</span>}<span>{selectedPhoto.date}</span></div>
          </section>
        </div>
      )}
    </section>
  )
}

export default ClienteDetalle