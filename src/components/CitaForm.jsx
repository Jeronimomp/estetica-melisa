import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Bell, CalendarDays, CheckCircle2, Clock3, Package, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { ajustarHorarioAtencion, calcularSesiones, sumarMinutos, verificarDisponibilidad } from '@/lib/sessionScheduling'
import { getRemainingTreatmentSessions, getVisibleAppointmentNotes, hasBlockingActiveTreatment, matchesTreatmentService, parseTreatmentSessionNote, withTreatmentId } from '@/lib/treatmentSessionNotes'
import ClienteForm from '@/components/ClienteForm'
import { useVisualViewport } from '@/hooks/useVisualViewport'

const TODAY_ISO = new Date().toISOString().slice(0, 10)
const CLIENT_PAGE_SIZE = 1000

function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function getEndTime(startTime, duration) {
  const [hours, minutes] = startTime.split(':').map(Number)
  const total = hours * 60 + minutes + Number(duration || 60)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}:00`
}

function getUpdatedAt() {
  return new Date().toISOString()
}

function getTimeSlots(duration) {
  const slots = []
  const length = Number(duration || 60)
  for (let minute = 8 * 60; minute + length <= 19 * 60; minute += 30) {
    slots.push(`${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`)
  }
  return slots
}

function getFormError(error) {
  if (error?.code === '23503') return 'Selecciona un cliente, profesional y servicio válidos.'
  if (error?.code === '23505' || error?.code === '23P01') return 'Ese horario ya no está disponible para el profesional.'
  if (error?.code === '42501' || error?.code === 'PGRST301') return 'Tu cuenta no tiene permiso para guardar citas.'
  if (error?.code === 'PGRST205') return 'Supabase no encuentra public.citas. Verifica la tabla y su esquema.'
  return 'No se pudo guardar la cita. Revisa los datos e inténtalo de nuevo.'
}

async function findBlockingTreatment(clientId, serviceId, selectedService) {
  const { data, error } = await supabase.from('tratamientos')
    .select('id, servicio_id, total_sesiones, sesiones_completadas, servicio:servicios(nombre)')
    .eq('cliente_id', clientId)
    .eq('estado', 'en_curso')

  if (error) throw error
  return (data ?? []).find((treatment) => {
    return matchesTreatmentService(treatment, { ...selectedService, id: serviceId })
      && hasBlockingActiveTreatment(treatment)
  }) ?? null
}

function getBlockingTreatmentMessage(treatment) {
  const remaining = getRemainingTreatmentSessions(treatment)
  return `Este cliente ya tiene este paquete en curso y le quedan ${remaining} sesiones. Podrá agendar otro cuando le queden 3 o menos.`
}

function CitaForm({ appointment = null, initialDate, onClose, onSaved }) {
  const overlayRef = useRef(null)
  const packageGenerationRef = useRef(0)
  const verificationSequenceRef = useRef(0)
  const verificationIdsRef = useRef(new Map())
  useVisualViewport(overlayRef)
  const [lookups, setLookups] = useState(null)
  const [lookupError, setLookupError] = useState(supabase ? '' : 'La conexión con Supabase no está configurada.')
  const [clientSearch, setClientSearch] = useState(appointment?.cliente?.nombre ?? '')
  const [clientCatalog, setClientCatalog] = useState(null)
  const [clientSearchFocused, setClientSearchFocused] = useState(false)
  const [loadingClientCatalog, setLoadingClientCatalog] = useState(false)
  const [selectedClient, setSelectedClient] = useState(appointment?.cliente ?? null)
  const [professionalSelectionId, setProfessionalSelectionId] = useState(appointment?.profesional_id ?? '')
  const [servicioId, setServicioId] = useState(appointment?.servicio_id ?? '')
  const [categoryFilter, setCategoryFilter] = useState('todas')
  const [fecha, setFecha] = useState(appointment?.fecha ?? initialDate ?? '')
  const [horaInicio, setHoraInicio] = useState(appointment?.hora_inicio?.slice(0, 5) ?? '')
  const [notas, setNotas] = useState(getVisibleAppointmentNotes(appointment?.notas ?? ''))
  const [creatingClient, setCreatingClient] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [intervaloDias, setIntervaloDias] = useState('')
  const [packageStep, setPackageStep] = useState('config')
  const [packageSessions, setPackageSessions] = useState([])
  const [calculatingPackage, setCalculatingPackage] = useState(false)

  const isEditing = Boolean(appointment?.id)
  const professionals = lookups?.profesionales ?? []
  const preferredProfessional = professionals.find((professional) => normalizeSearch(professional.nombre) === 'melisa peralta')
  const defaultProfessionalId = appointment?.profesional_id
    || preferredProfessional?.id
    || (professionals.length === 1 ? professionals[0].id : '')
  const profesionalId = professionalSelectionId || defaultProfessionalId
  const selectedService = lookups?.servicios.find((service) => service.id === servicioId)
  const serviceCategories = [...new Map((lookups?.servicios ?? [])
    .map((service) => String(service.categoria ?? '').trim())
    .filter(Boolean)
    .map((category) => [normalizeSearch(category), category]))]
  const filteredServices = (lookups?.servicios ?? []).filter((service) => (
    categoryFilter === 'todas' || normalizeSearch(service.categoria) === categoryFilter
  ))
  const timeSlots = getTimeSlots(selectedService?.duracion_minutos ?? 60)
  const isPackageCreation = !isEditing && Number(selectedService?.sesiones) > 1
  const packageTotal = Number(selectedService?.sesiones) || 0
  const packageConflicts = packageSessions.filter((session) => session.estado === 'conflict').length
  const packageWarnings = packageSessions.filter((session) => session.estado === 'pending').length
  const packageAvailable = packageSessions.filter((session) => session.estado === 'available').length
  const packageChecking = packageSessions.some((session) => session.estado === 'checking')
  const packageErrors = packageSessions.some((session) => session.estado === 'error')
  const canSchedulePackage = packageSessions.length === packageTotal && !packageChecking && !packageErrors && packageConflicts === 0
  const clientResults = clientSearchFocused && !selectedClient && clientCatalog !== null
    ? clientCatalog.filter((client) => normalizeSearch(client.nombre).includes(normalizeSearch(clientSearch.trim()))).slice(0, 10)
    : []

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    Promise.all([
      supabase.from('profesionales').select('id, nombre, especialidad').eq('activo', true).order('nombre'),
      supabase.from('servicios').select('id, nombre, duracion_minutos, categoria, sesiones').eq('activo', true).order('nombre'),
    ]).then(([professionalsResult, servicesResult]) => {
      if (!active) return
      const lookupErrorResult = professionalsResult.error || servicesResult.error
      if (lookupErrorResult) setLookupError(getFormError(lookupErrorResult))
      setLookups({
        profesionales: professionalsResult.data ?? [],
        servicios: servicesResult.data ?? [],
      })
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!supabase || !clientSearchFocused || selectedClient || clientCatalog !== null) return undefined

    let active = true
    async function loadClientCatalog() {
      setLoadingClientCatalog(true)
      try {
        const clients = []
        for (let offset = 0; ; offset += CLIENT_PAGE_SIZE) {
          const { data, error: searchError } = await supabase
            .from('clientes')
            .select('id, nombre')
            .eq('activo', true)
            .order('nombre')
            .order('id')
            .range(offset, offset + CLIENT_PAGE_SIZE - 1)

          if (searchError) throw searchError
          const page = data ?? []
          clients.push(...page)
          if (page.length < CLIENT_PAGE_SIZE) break
        }

        if (active) setClientCatalog(clients)
      } catch (searchError) {
        if (active) {
          setClientCatalog([])
          setLookupError(getFormError(searchError))
        }
      } finally {
        if (active) setLoadingClientCatalog(false)
      }
    }

    loadClientCatalog()

    return () => {
      active = false
    }
  }, [clientCatalog, clientSearchFocused, selectedClient])

  function resetPackagePlan() {
    packageGenerationRef.current += 1
    verificationIdsRef.current.clear()
    setCalculatingPackage(false)
    setPackageStep('config')
    setPackageSessions([])
  }

  async function inspectPackageSession(session) {
    const duration = Number(selectedService?.duracion_minutos) || 60
    const adjusted = ajustarHorarioAtencion(session.fecha, session.horaInicio)
    let candidate = { ...session, fecha: adjusted.fecha, horaInicio: adjusted.hora, horaFin: getEndTime(adjusted.hora, duration).slice(0, 5) }
    let appointments = await verificarDisponibilidad(profesionalId, candidate.fecha, candidate.horaInicio, candidate.horaFin)
    const confirmedConflict = appointments.some((existing) => existing.estado === 'confirmada')
    let suggested = false

    if (confirmedConflict) {
      const later = sumarMinutos(candidate.fecha, candidate.horaInicio, 30)
      const adjusted = ajustarHorarioAtencion(later.fecha, later.hora)
      candidate = { ...candidate, fecha: adjusted.fecha, horaInicio: adjusted.hora, horaFin: getEndTime(adjusted.hora, duration).slice(0, 5) }
      appointments = await verificarDisponibilidad(profesionalId, candidate.fecha, candidate.horaInicio, candidate.horaFin)
      suggested = true
    }

    const stillConfirmed = appointments.some((existing) => existing.estado === 'confirmada')
    const hasPending = appointments.some((existing) => existing.estado === 'pendiente')
    if (stillConfirmed) {
      return { ...candidate, estado: 'conflict', mensaje: suggested ? 'Horario confirmado ocupado; se probó mover 30 min. Ajusta la hora.' : 'Horario ocupado por una cita confirmada.' }
    }
    if (hasPending) {
      return { ...candidate, estado: 'pending', mensaje: suggested ? 'Hora movida 30 min; coincide con una cita pendiente.' : 'Coincide con una cita pendiente, pero se puede agendar.' }
    }
    return { ...candidate, estado: 'available', mensaje: suggested ? 'Hora movida 30 min por una cita confirmada.' : 'Horario disponible.' }
  }

  async function handleCalculatePackage() {
    setError('')
    if (!selectedClient?.id || !profesionalId || !servicioId || !fecha || !horaInicio) {
      setError('Selecciona cliente, profesional, servicio, fecha y hora antes de calcular.')
      return
    }
    if (!Number.isInteger(Number(intervaloDias)) || Number(intervaloDias) < 1 || Number(intervaloDias) > 60) {
      setError('El intervalo debe ser de 1 a 60 días.')
      return
    }

    setCalculatingPackage(true)
    const generation = ++packageGenerationRef.current
    try {
      const blockingTreatment = await findBlockingTreatment(selectedClient.id, servicioId, selectedService)
      if (blockingTreatment) {
        setPackageSessions([])
        setPackageStep('config')
        setError(getBlockingTreatmentMessage(blockingTreatment))
        return
      }

      const sessions = calcularSesiones(fecha, horaInicio, intervaloDias, packageTotal, selectedService.duracion_minutos)
      setPackageSessions(sessions)
      setPackageStep('review')
      setFecha(sessions[0].fecha)
      setHoraInicio(sessions[0].horaInicio)

      const results = await Promise.all(sessions.map(async (session) => {
        const verificationId = ++verificationSequenceRef.current
        verificationIdsRef.current.set(session.numero, verificationId)
        try {
          return await inspectPackageSession(session)
        } catch (availabilityError) {
          return { ...session, estado: 'error', mensaje: availabilityError.message || 'No se pudo verificar disponibilidad.' }
        }
      }))

      if (packageGenerationRef.current !== generation) return
      setPackageSessions(results)
      if (results[0]) {
        setFecha(results[0].fecha)
        setHoraInicio(results[0].horaInicio)
      }
    } catch (calculationError) {
      setError(calculationError.message || 'No se pudieron calcular las fechas del paquete.')
    } finally {
      if (packageGenerationRef.current === generation) setCalculatingPackage(false)
    }
  }

  function updatePackageSession(numero, field, value) {
    const current = packageSessions.find((session) => session.numero === numero)
    if (!current) return
    const updated = { ...current, [field]: value, estado: 'checking', mensaje: 'Verificando disponibilidad…' }
    if (numero === 1) {
      setFecha(updated.fecha)
      setHoraInicio(updated.horaInicio)
    }
    const verificationId = ++verificationSequenceRef.current
    verificationIdsRef.current.set(numero, verificationId)
    setPackageSessions((sessions) => sessions.map((session) => session.numero === numero ? updated : session))

    if (!updated.fecha || !/^\d{2}:\d{2}$/.test(updated.horaInicio)) {
      setPackageSessions((sessions) => sessions.map((session) => session.numero === numero
        ? { ...updated, estado: 'error', mensaje: 'Completa una fecha y una hora válidas.' }
        : session))
      return
    }

    inspectPackageSession(updated)
      .then((result) => {
        if (verificationIdsRef.current.get(numero) !== verificationId) return
        if (numero === 1) {
          setFecha(result.fecha)
          setHoraInicio(result.horaInicio)
        }
        setPackageSessions((sessions) => sessions.map((session) => session.numero === numero ? result : session))
      })
      .catch((availabilityError) => {
        if (verificationIdsRef.current.get(numero) !== verificationId) return
        setPackageSessions((sessions) => sessions.map((session) => session.numero === numero
          ? { ...updated, estado: 'error', mensaje: availabilityError.message || 'No se pudo verificar disponibilidad.' }
          : session))
      })
  }

  async function handlePackageSubmit() {
    setError('')
    if (packageStep !== 'review' || !canSchedulePackage) {
      setError('Resuelve los conflictos y verifica todas las sesiones antes de agendar.')
      return
    }

    setSaving(true)
    try {
      const blockingTreatment = await findBlockingTreatment(selectedClient.id, servicioId, selectedService)
      if (blockingTreatment) {
        setPackageSessions([])
        setPackageStep('config')
        setError(getBlockingTreatmentMessage(blockingTreatment))
        return
      }

      const verifiedSessions = await Promise.all(packageSessions.map(async (session) => {
        try {
          return await inspectPackageSession(session)
        } catch (availabilityError) {
          return { ...session, estado: 'error', mensaje: availabilityError.message || 'No se pudo verificar disponibilidad.' }
        }
      }))
      setPackageSessions(verifiedSessions)
      if (verifiedSessions.some((session) => session.estado === 'conflict' || session.estado === 'error')) {
        setError('Hay conflictos o sesiones sin verificar. Revisa las filas marcadas antes de agendar.')
        return
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('No se pudo verificar la sesión. Inicia sesión de nuevo.')

      const { data: treatment, error: treatmentError } = await supabase.from('tratamientos').insert({
        cliente_id: selectedClient.id,
        servicio_id: servicioId,
        profesional_id: profesionalId,
        total_sesiones: packageTotal,
        sesiones_completadas: 0,
        fecha_inicio: verifiedSessions[0].fecha,
        estado: 'en_curso',
      }).select('id').single()
      if (treatmentError) throw treatmentError

      const appointments = verifiedSessions.map((session) => ({
        cliente_id: selectedClient.id,
        servicio_id: servicioId,
        profesional_id: profesionalId,
        empleado_id: user.id,
        fecha: session.fecha,
        hora_inicio: `${session.horaInicio}:00`,
        hora_fin: getEndTime(session.horaInicio, selectedService.duracion_minutos),
        estado: 'pendiente',
        notas: withTreatmentId(`Sesión ${session.numero} de ${packageTotal} — ${selectedService.nombre}`, treatment.id),
        updated_at: getUpdatedAt(),
      }))
      const { error: appointmentsError } = await supabase.from('citas').insert(appointments)
      if (appointmentsError) {
        const { error: rollbackError } = await supabase.from('tratamientos').delete().eq('id', treatment.id)
        if (rollbackError) throw new Error(`No se guardaron las citas y no se pudo revertir el tratamiento: ${appointmentsError.message}`)
        throw appointmentsError
      }

      onSaved({ successMessage: `Se agendaron ${packageTotal} citas para ${selectedClient.nombre}.` })
    } catch (saveError) {
      setError(saveError?.code ? getFormError(saveError) : saveError?.message || getFormError(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!supabase) {
      setError('La conexión con Supabase no está configurada.')
      return
    }
    if (!selectedClient?.id || !profesionalId || !servicioId || !fecha || !horaInicio) {
      setError('Completa cliente, profesional, servicio, fecha y hora.')
      return
    }

    if (isPackageCreation) {
      await handlePackageSubmit()
      return
    }

    setSaving(true)
    setError('')
    const horaFin = getEndTime(horaInicio, selectedService?.duracion_minutos)
    const appointmentId = appointment?.id
    let conflictQuery = supabase
      .from('citas')
      .select('id, hora_inicio, hora_fin')
      .eq('profesional_id', profesionalId)
      .eq('fecha', fecha)
      .not('estado', 'in', '(cancelada,no_asistio)')
    if (appointmentId) conflictQuery = conflictQuery.neq('id', appointmentId)

    const { data: sameDayAppointments, error: conflictError } = await conflictQuery
    if (conflictError) {
      setError(getFormError(conflictError))
      setSaving(false)
      return
    }

    const startMinutes = Number(horaInicio.slice(0, 2)) * 60 + Number(horaInicio.slice(3, 5))
    const endMinutes = startMinutes + Number(selectedService?.duracion_minutos ?? 60)
    const overlaps = (sameDayAppointments ?? []).some((existing) => {
      const [oldHours, oldMinutes] = existing.hora_inicio.split(':').map(Number)
      const oldStart = oldHours * 60 + oldMinutes
      const [endHours, endMinute] = (existing.hora_fin ?? getEndTime(existing.hora_inicio, 60)).split(':').map(Number)
      const oldEnd = endHours * 60 + endMinute
      return startMinutes < oldEnd && endMinutes > oldStart
    })

    if (overlaps) {
      setError('Ese horario se cruza con otra cita del profesional. Elige otro horario.')
      setSaving(false)
      return
    }

    const payload = {
      cliente_id: selectedClient.id,
      profesional_id: profesionalId,
      servicio_id: servicioId,
      fecha,
      hora_inicio: `${horaInicio}:00`,
      hora_fin: horaFin,
      notas: withTreatmentId(
        notas.trim() || null,
        parseTreatmentSessionNote(appointment?.notas)?.treatmentId,
        parseTreatmentSessionNote(appointment?.notas),
      ),
      updated_at: getUpdatedAt(),
    }

    if (appointmentId) {
      const { data, error: saveError } = await supabase
        .from('citas')
        .update(payload)
        .eq('id', appointmentId)
        .select('id')
        .single()
      if (saveError) {
        setError(getFormError(saveError))
        setSaving(false)
        return
      }
      setSaving(false)
      onSaved(data)
      return
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      setError('No se pudo verificar la sesión. Inicia sesión de nuevo.')
      setSaving(false)
      return
    }

    const { data, error: saveError } = await supabase
      .from('citas')
      .insert({ ...payload, estado: 'pendiente', empleado_id: user.id })
      .select('id')
      .single()

    if (saveError) {
      setError(getFormError(saveError))
      setSaving(false)
      return
    }
    setSaving(false)
    onSaved(data)
  }

  if (creatingClient) {
    return (
      <ClienteForm
        quick
        onClose={() => setCreatingClient(false)}
        onSaved={(client) => {
          setSelectedClient(client)
          setClientSearch(client.nombre)
          setClientCatalog((current) => current?.map((existing) => existing.id === client.id ? client : existing) ?? current)
          setClientSearchFocused(false)
          setCreatingClient(false)
        }}
      />
    )
  }

  return (
    <div ref={overlayRef} className="creation-overlay cita-form-overlay">
      <section className={`creation-dialog cita-form-dialog${isPackageCreation ? ' cita-form-dialog--package' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cita-form-title">
        <button className="creation-dialog__close" type="button" aria-label="Cerrar formulario" onClick={onClose} disabled={saving}>
          <X size={19} aria-hidden="true" />
        </button>
        <span className="eyebrow text-dorado-oscuro">AGENDA</span>
        <h2 id="cita-form-title">{isEditing ? 'Cambiar cita' : 'Nueva cita'}</h2>

        <form className="cita-form" onSubmit={handleSubmit}>
          <fieldset className="cita-form__group">
            <legend>Cliente</legend>
            {selectedClient ? (
              <div className="cita-form__selected-client">
                <strong>{selectedClient.nombre}</strong>
                <button type="button" onClick={() => { setSelectedClient(null); setClientSearch('') }} aria-label="Cambiar cliente">Cambiar</button>
              </div>
            ) : (
              <>
                <label className="appointment-search" htmlFor="appointment-client-search">
                  <Search size={16} aria-hidden="true" />
                  <Input
                    id="appointment-client-search"
                    placeholder="Buscar por nombre"
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    onFocus={() => setClientSearchFocused(true)}
                    onBlur={() => window.setTimeout(() => setClientSearchFocused(false), 0)}
                    autoComplete="off"
                  />
                </label>
                {clientSearchFocused && loadingClientCatalog && <span className="cita-form__hint" role="status">Cargando clientes…</span>}
                {clientResults.length > 0 && (
                  <ul className="appointment-client-results">
                    {clientResults.map((client) => (
                      <li key={client.id}>
                        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedClient(client); setClientSearch(client.nombre); setClientSearchFocused(false) }}>
                          <span>{client.nombre}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {clientSearchFocused && !loadingClientCatalog && clientSearch.trim() && clientResults.length === 0 && <span className="cita-form__hint">No hay resultados con ese nombre.</span>}
                <Button className="cita-form__new-client" type="button" variant="outline" onClick={() => setCreatingClient(true)}>
                  <Plus size={16} aria-hidden="true" /> Crear cliente rápido
                </Button>
              </>
            )}
          </fieldset>

          {lookupError && <p className="form-message form-message--error" role="alert">{lookupError}</p>}
          {!lookups && !lookupError && <p className="cita-form__hint" role="status">Cargando profesionales y servicios…</p>}

          <div className="cita-form__grid">
            <label className="cliente-form__field" htmlFor="appointment-professional">
              <span>Profesional *</span>
              <select id="appointment-professional" className="cliente-form__select" value={profesionalId} onChange={(event) => { setProfessionalSelectionId(event.target.value); resetPackagePlan() }} required>
                <option value="">Seleccionar profesional</option>
                {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.nombre} · {professional.especialidad}</option>)}
              </select>
            </label>
            <div className="cliente-form__field">
              <label htmlFor="appointment-service"><span>Servicio *</span></label>
              {serviceCategories.length > 0 && (
                <div className="service-category-filter" role="group" aria-label="Filtrar servicios por categoría">
                  <button className={categoryFilter === 'todas' ? 'service-category-filter__option service-category-filter__option--active' : 'service-category-filter__option'} type="button" aria-pressed={categoryFilter === 'todas'} onClick={() => { setCategoryFilter('todas'); setServicioId(''); resetPackagePlan() }}>Todas</button>
                  {serviceCategories.map(([categoryKey, categoryLabel]) => (
                    <button className={categoryFilter === categoryKey ? 'service-category-filter__option service-category-filter__option--active' : 'service-category-filter__option'} type="button" aria-pressed={categoryFilter === categoryKey} key={categoryKey} onClick={() => { setCategoryFilter(categoryKey); setServicioId(''); resetPackagePlan() }}>{categoryLabel}</button>
                  ))}
                </div>
              )}
              <select id="appointment-service" className="cliente-form__select" value={servicioId} onChange={(event) => { setServicioId(event.target.value); resetPackagePlan() }} required>
                <option value="">Seleccionar servicio</option>
                {filteredServices.map((service) => <option key={service.id} value={service.id}>{service.nombre} · {service.sesiones || 1} {Number(service.sesiones) === 1 ? 'sesión' : 'sesiones'} · {service.duracion_minutos} min</option>)}
              </select>
            </div>
            {isPackageCreation && (
              <section className="cita-package-setup cita-form__field--wide" aria-labelledby="package-setup-title">
                <header className="cita-package-setup__heading">
                  <Package size={20} aria-hidden="true" />
                  <div>
                    <h3 id="package-setup-title">Tratamiento de {packageTotal} sesiones</h3>
                    <p>Este servicio requiere {packageTotal} sesiones. Programa todas las citas automáticamente.</p>
                  </div>
                </header>
                {packageStep === 'config' ? (
                  <div className="cita-package-setup__controls">
                    <div className="cita-package-setup__schedule">
                      <label className="cliente-form__field" htmlFor="appointment-date">
                        <span><CalendarDays size={14} aria-hidden="true" /> Fecha primera sesión *</span>
                        <Input id="appointment-date" type="date" value={fecha} onChange={(event) => { setFecha(event.target.value); resetPackagePlan() }} min={TODAY_ISO} required />
                      </label>
                      <label className="cliente-form__field" htmlFor="appointment-time">
                        <span><Clock3 size={14} aria-hidden="true" /> Hora primera sesión *</span>
                        <select id="appointment-time" className="cliente-form__select" value={horaInicio} onChange={(event) => { setHoraInicio(event.target.value); resetPackagePlan() }} required>
                          <option value="">Seleccionar horario</option>
                          {timeSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="cliente-form__field" htmlFor="package-interval">
                      <span>¿Cada cuántos días?</span>
                      <div className="cita-package-setup__interval">
                        <Input id="package-interval" type="number" min="1" max="60" step="1" required value={intervaloDias} onChange={(event) => setIntervaloDias(event.target.value)} />
                        <span>días</span>
                      </div>
                      <small>Ej: 1 = diario · 7 = semanal · 15 = quincenal. Si cae en fin de semana o festivo, pasa al siguiente día hábil.</small>
                    </label>
                    <Button className="cita-package-setup__calculate" type="button" onClick={handleCalculatePackage} disabled={calculatingPackage || !selectedClient || !profesionalId || !fecha || !horaInicio}>
                      {calculatingPackage ? 'Calculando…' : <>Calcular fechas <ArrowRight size={16} aria-hidden="true" /></>}
                    </Button>
                  </div>
                ) : (
                  <p className="cita-package-setup__summary">Una cita cada {intervaloDias} {Number(intervaloDias) === 1 ? 'día calendario' : 'días calendario'}. Si la fecha cae en fin de semana o festivo, se moverá al siguiente día hábil.</p>
                )}
              </section>
            )}
            {!isPackageCreation && <label className="cliente-form__field" htmlFor="appointment-date">
              <span>Fecha *</span>
              <Input id="appointment-date" type="date" value={fecha} onChange={(event) => { setFecha(event.target.value); if (isPackageCreation) resetPackagePlan() }} min={TODAY_ISO} required />
            </label>}
            {!isPackageCreation && <label className="cliente-form__field" htmlFor="appointment-time">
              <span><Clock3 size={14} aria-hidden="true" /> Hora *</span>
              <select id="appointment-time" className="cliente-form__select" value={horaInicio} onChange={(event) => { setHoraInicio(event.target.value); if (isPackageCreation) resetPackagePlan() }} required>
                <option value="">Seleccionar horario</option>
                {timeSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </label>}
            <label className="cliente-form__field cita-form__field--wide" htmlFor="appointment-notes">
              <span>Notas (opcional)</span>
              <textarea id="appointment-notes" className="cliente-form__textarea" rows={3} value={notas} onChange={(event) => setNotas(event.target.value)} />
            </label>
          </div>

          {isPackageCreation && packageStep === 'review' && (
            <section className="cita-package-review" aria-labelledby="package-review-title">
              <header className="cita-package-review__heading">
                <div>
                  <span className="eyebrow text-dorado-oscuro">PASO 2</span>
                  <h3 id="package-review-title">Revisa las fechas del tratamiento</h3>
                </div>
                <span>{packageTotal} sesiones</span>
              </header>
              <div className="cita-package-review__table-wrap">
                <table className="cita-package-review__table">
                  <thead>
                    <tr><th scope="col">#</th><th scope="col">Fecha</th><th scope="col">Hora</th><th scope="col">Estado</th></tr>
                  </thead>
                  <tbody>
                    {packageSessions.map((session) => (
                      <tr className={`cita-package-review__row cita-package-review__row--${session.estado}`} key={session.numero}>
                        <th scope="row">{session.numero}</th>
                        <td><Input type="date" aria-label={`Fecha de sesión ${session.numero}`} min={TODAY_ISO} value={session.fecha} disabled={saving || calculatingPackage} onChange={(event) => updatePackageSession(session.numero, 'fecha', event.target.value)} /></td>
                        <td><Input type="time" aria-label={`Hora de sesión ${session.numero}`} value={session.horaInicio} disabled={saving || calculatingPackage} onChange={(event) => updatePackageSession(session.numero, 'horaInicio', event.target.value)} /></td>
                        <td>
                          <div className="cita-package-review__status">
                            {session.estado === 'available' && <CheckCircle2 size={16} aria-hidden="true" />}
                            {session.estado === 'pending' && <Bell size={16} aria-hidden="true" />}
                            {(session.estado === 'conflict' || session.estado === 'error') && <AlertTriangle size={16} aria-hidden="true" />}
                            {session.estado === 'checking' && <Clock3 size={16} aria-hidden="true" />}
                            <span>{session.estado === 'available' ? 'Disponible' : session.estado === 'pending' ? 'Coincide con pendiente' : session.estado === 'conflict' ? 'Conflicto confirmado' : session.estado === 'error' ? 'Sin verificar' : 'Verificando…'}</span>
                          </div>
                          <small>{session.mensaje}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="cita-package-review__footer">
                <p aria-live="polite">{packageAvailable} de {packageTotal} citas disponibles · {packageWarnings} avisos · {packageConflicts} conflictos{packageErrors ? ' · Hay sesiones sin verificar' : ''}</p>
                <div className="cita-package-review__actions">
                  <Button type="button" variant="outline" onClick={resetPackagePlan} disabled={saving || calculatingPackage}><ArrowLeft size={16} aria-hidden="true" /> Volver</Button>
                  <Button type="submit" className="cliente-form__submit" disabled={saving || !canSchedulePackage}>
                    {saving ? 'Agendando…' : `Agendar ${packageTotal} citas`}
                  </Button>
                </div>
              </div>
            </section>
          )}

          {selectedService && <p className="cita-form__hint"><CalendarDays size={15} aria-hidden="true" /> Duración: {selectedService.duracion_minutos} minutos. La cita quedará {isEditing ? 'conservando su estado actual' : 'pendiente'}.</p>}
          {error && <p className="form-message form-message--error" role="alert">{error}</p>}

          <div className="cliente-form__actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            {!isPackageCreation && (
              <Button type="submit" className="cliente-form__submit" disabled={saving || !lookups}>
                {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Agendar cita'}
              </Button>
            )}
          </div>
        </form>
      </section>
    </div>
  )
}

export default CitaForm