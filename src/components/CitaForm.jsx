import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Clock3, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import ClienteForm from '@/components/ClienteForm'
import { useVisualViewport } from '@/hooks/useVisualViewport'

const TODAY_ISO = new Date().toISOString().slice(0, 10)

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

function CitaForm({ appointment = null, initialDate, onClose, onSaved }) {
  const overlayRef = useRef(null)
  useVisualViewport(overlayRef)
  const [lookups, setLookups] = useState(null)
  const [lookupError, setLookupError] = useState(supabase ? '' : 'La conexión con Supabase no está configurada.')
  const [clientSearch, setClientSearch] = useState(appointment?.cliente?.nombre ?? '')
  const [clientResults, setClientResults] = useState([])
  const [selectedClient, setSelectedClient] = useState(appointment?.cliente ?? null)
  const [profesionalId, setProfesionalId] = useState(appointment?.profesional_id ?? '')
  const [servicioId, setServicioId] = useState(appointment?.servicio_id ?? '')
  const [fecha, setFecha] = useState(appointment?.fecha ?? initialDate ?? '')
  const [horaInicio, setHoraInicio] = useState(appointment?.hora_inicio?.slice(0, 5) ?? '')
  const [notas, setNotas] = useState(appointment?.notas ?? '')
  const [creatingClient, setCreatingClient] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isEditing = Boolean(appointment?.id)
  const selectedService = lookups?.servicios.find((service) => service.id === servicioId)
  const timeSlots = getTimeSlots(selectedService?.duracion_minutos ?? 60)

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    Promise.all([
      supabase.from('profesionales').select('id, nombre, especialidad').eq('activo', true).order('nombre'),
      supabase.from('servicios').select('id, nombre, duracion_minutos, categoria').eq('activo', true).order('nombre'),
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
    if (!supabase || selectedClient || clientSearch.trim().length < 1) return undefined

    let active = true
    const timer = window.setTimeout(async () => {
      const { data, error: searchError } = await supabase
        .from('clientes')
        .select('id, nombre')
        .eq('activo', true)
        .ilike('nombre', `%${clientSearch.trim()}%`)
        .order('nombre')
        .limit(10)

      if (!active) return
      setClientResults(searchError ? [] : data ?? [])
      if (searchError) setLookupError(getFormError(searchError))
    }, 180)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [clientSearch, selectedClient])

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
      notas: notas.trim() || null,
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
          setClientResults([])
          setCreatingClient(false)
        }}
      />
    )
  }

  return (
    <div ref={overlayRef} className="creation-overlay cita-form-overlay">
      <section className="creation-dialog cita-form-dialog" role="dialog" aria-modal="true" aria-labelledby="cita-form-title">
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
                  <Input id="appointment-client-search" placeholder="Buscar por nombre" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} autoComplete="off" />
                </label>
                {clientResults.length > 0 && (
                  <ul className="appointment-client-results">
                    {clientResults.map((client) => (
                      <li key={client.id}>
                        <button type="button" onClick={() => { setSelectedClient(client); setClientSearch(client.nombre); setClientResults([]) }}>
                          <span>{client.nombre}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {clientSearch.trim() && clientResults.length === 0 && <span className="cita-form__hint">No hay resultados con ese nombre.</span>}
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
              <select id="appointment-professional" className="cliente-form__select" value={profesionalId} onChange={(event) => setProfesionalId(event.target.value)} required>
                <option value="">Seleccionar profesional</option>
                {lookups?.profesionales.map((professional) => <option key={professional.id} value={professional.id}>{professional.nombre} · {professional.especialidad}</option>)}
              </select>
            </label>
            <label className="cliente-form__field" htmlFor="appointment-service">
              <span>Servicio *</span>
              <select id="appointment-service" className="cliente-form__select" value={servicioId} onChange={(event) => setServicioId(event.target.value)} required>
                <option value="">Seleccionar servicio</option>
                {lookups?.servicios.map((service) => <option key={service.id} value={service.id}>{service.categoria ? `${service.categoria} · ` : ''}{service.nombre} · {service.duracion_minutos} min</option>)}
              </select>
            </label>
            <label className="cliente-form__field" htmlFor="appointment-date">
              <span>Fecha *</span>
              <Input id="appointment-date" type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} min={TODAY_ISO} required />
            </label>
            <label className="cliente-form__field" htmlFor="appointment-time">
              <span><Clock3 size={14} aria-hidden="true" /> Hora *</span>
              <select id="appointment-time" className="cliente-form__select" value={horaInicio} onChange={(event) => setHoraInicio(event.target.value)} required>
                <option value="">Seleccionar horario</option>
                {timeSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </label>
            <label className="cliente-form__field cita-form__field--wide" htmlFor="appointment-notes">
              <span>Notas (opcional)</span>
              <textarea id="appointment-notes" className="cliente-form__textarea" rows={3} value={notas} onChange={(event) => setNotas(event.target.value)} />
            </label>
          </div>

          {selectedService && <p className="cita-form__hint"><CalendarDays size={15} aria-hidden="true" /> Duración: {selectedService.duracion_minutos} minutos. La cita quedará {isEditing ? 'conservando su estado actual' : 'pendiente'}.</p>}
          {error && <p className="form-message form-message--error" role="alert">{error}</p>}

          <div className="cliente-form__actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" className="cliente-form__submit" disabled={saving || !lookups}>
              {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Agendar cita'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default CitaForm