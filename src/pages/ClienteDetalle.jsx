import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, Camera, FileText, Pencil, UserRound, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import ClienteForm from '@/components/ClienteForm'

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

function renderClinicalContent(content) {
  if (!content) return 'No hay contenido registrado.'
  if (typeof content === 'string') return content
  return JSON.stringify(content, null, 2)
}

function calculateBmi(weight, height) {
  const parsedWeight = Number.parseFloat(weight)
  const parsedHeight = Number.parseFloat(height)
  if (!Number.isFinite(parsedWeight) || !Number.isFinite(parsedHeight) || parsedWeight <= 0 || parsedHeight <= 0) return null
  return (parsedWeight / (parsedHeight * parsedHeight)).toFixed(2)
}

function ClientData({ label, value }) {
  return (
    <div className="client-data__item">
      <dt>{label}</dt>
      <dd>{value || 'No registrado'}</dd>
    </div>
  )
}

function ClienteDetalle() {
  const { id } = useParams()
  const [loadResult, setLoadResult] = useState(null)
  const [editing, setEditing] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState(null)
  const result = loadResult?.id === id ? loadResult : null
  const loading = Boolean(supabase && !result)
  const client = result?.client ?? null
  const appointments = result?.appointments ?? []
  const clientError = !supabase
    ? 'La conexión con Supabase no está configurada.'
    : result?.clientError || ''
  const historyError = result?.historyError || ''

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
          clientError: queryError?.code === 'PGRST205'
            ? 'Supabase no encuentra public.clientes. Verifica que la tabla esté creada y expuesta en el esquema public.'
            : 'No se encontró este cliente o no tienes permiso para consultar su expediente.',
        })
        return
      }

      const { data: visitData, error: visitError } = await supabase
        .from('citas')
        .select('id, fecha, hora_inicio, estado, servicio:servicios(nombre), profesional:profesionales(nombre), historia_clinica(id, tipo, contenido, observaciones_sesion, fecha), fotos_cita(id, tipo, url_foto, fecha_subida)')
        .eq('cliente_id', id)
        .order('fecha', { ascending: false })
        .order('hora_inicio', { ascending: false })

      if (!active) return
     // Después:
const estadosVisibles = ['atendida', 'confirmada']
const completedVisits = visitError
  ? []
  : (visitData ?? []).filter((visit) => 
      estadosVisibles.includes(visit.estado?.toLocaleLowerCase('es-MX'))
    )
       
      const visitsWithSignedPhotos = await Promise.all(completedVisits.map(async (visit) => {
        const photos = await Promise.all(asList(visit.fotos_cita).map(async (photo) => {
          if (/^https?:\/\//i.test(photo.url_foto)) return { ...photo, displayUrl: photo.url_foto }
          const { data: signedData, error: signedError } = await supabase.storage
            .from(photoBucket)
            .createSignedUrl(photo.url_foto, 60 * 60)
          return { ...photo, displayUrl: signedError ? '' : signedData?.signedUrl ?? '' }
        }))
        return { ...visit, fotos_cita: photos }
      }))

      if (!active) return
      setLoadResult({
        id,
        client: clientData,
        appointments: visitsWithSignedPhotos,
        historyError: visitError ? getHistoryError(visitError) : '',
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
        <Button className="client-detail__edit" variant="outline" onClick={() => setEditing(true)}>
          <Pencil size={16} aria-hidden="true" /> Editar
        </Button>
      </header>

      <section className="client-detail__section" aria-labelledby="client-personal-title">
        <h2 id="client-personal-title"><UserRound size={18} aria-hidden="true" /> Datos personales</h2>
        <dl className="client-data-grid">
          <ClientData label="Teléfono" value={client.telefono} />
          <ClientData label="Correo" value={client.correo} />
          <ClientData label="Fecha de nacimiento" value={client.fecha_nacimiento} />
          <ClientData label="Estatura" value={client.estatura ? `${Number(client.estatura).toFixed(2)} m` : null} />
          <ClientData label="Peso" value={client.peso ? `${Number(client.peso).toFixed(2)} kg` : null} />
          <ClientData label="IMC Calculado" value={calculateBmi(client.peso, client.estatura) ? `${calculateBmi(client.peso, client.estatura)} kg/m²` : null} />
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
        {!historyError && appointments.length === 0 && <p className="client-state">Aún no hay citas atendidas para este cliente.</p>}
        <div className="visit-list">
          {appointments.map((visit) => {
            const service = asList(visit.servicio)[0]
            const professional = asList(visit.profesional)[0]
            const histories = asList(visit.historia_clinica)
            const photos = asList(visit.fotos_cita)
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
                    <Button type="button" variant="outline" onClick={() => setSelectedHistory(histories[0])}>
                      <FileText size={16} aria-hidden="true" /> Ver historia clínica
                    </Button>
                  )}
                  {photos.length > 0 && (
                    <div className="visit-photos" aria-label="Fotos de la atención">
                      {photos.map((photo) => (
                        photo.displayUrl ? (
                          <a className="visit-photo" href={photo.displayUrl} target="_blank" rel="noreferrer" key={photo.id}>
                            <img src={photo.displayUrl} alt={`Foto ${photo.tipo === 'antes' ? 'antes' : 'después'} del servicio`} loading="lazy" />
                            <span><Camera size={14} aria-hidden="true" /> {photo.tipo === 'antes' ? 'Antes' : 'Después'}</span>
                          </a>
                        ) : (
                          <span className="visit-photo__missing" key={photo.id}>Foto privada no disponible</span>
                        )
                      ))}
                    </div>
                  )}
                  {histories.length === 0 && photos.length === 0 && <span className="visit-card__empty">Sin historia clínica ni fotos registradas.</span>}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {editing && <ClienteForm client={client} onClose={() => setEditing(false)} onSaved={handleSaved} />}
      {selectedHistory && (
        <div className="creation-overlay">
          <section className="creation-dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-dialog-title">
            <button className="creation-dialog__close" type="button" aria-label="Cerrar historia clínica" onClick={() => setSelectedHistory(null)}>
              <X size={19} aria-hidden="true" />
            </button>
            <span className="eyebrow text-dorado-oscuro">HISTORIA CLÍNICA · {selectedHistory.tipo || 'ATENCIÓN'}</span>
            <h2 id="history-dialog-title">{formatDate(selectedHistory.fecha)}</h2>
            <pre className="history-dialog__content">{renderClinicalContent(selectedHistory.contenido)}</pre>
            {selectedHistory.observaciones_sesion && <p>{selectedHistory.observaciones_sesion}</p>}
          </section>
        </div>
      )}
    </section>
  )
}

export default ClienteDetalle