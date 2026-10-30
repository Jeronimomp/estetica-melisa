import { Camera, Check, Eye, EyeOff } from 'lucide-react'
import VisitAfterPhotoUploader from '@/components/VisitAfterPhotoUploader'
import { canCaptureAppointmentPhoto } from '@/lib/clinicalPhotoPolicy'

const statusLabels = {
  en_curso: 'En curso',
  completado: 'Completado',
  pausado: 'Pausado',
  abandonado: 'Abandonado',
}

function formatDate(value) {
  if (!value) return 'Fecha pendiente'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Fecha pendiente' : new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function formatTime(value) {
  if (!value) return '—'
  const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '—'
  return new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(new Date(2020, 0, 1, hours, minutes))
}

function TratamientoHistorialCard({ group, clientId, onPhotoSaved, onViewPhoto, isAdmin = false, busy = false, onToggleVisibility }) {
  const { tratamiento, sesiones, beforePhoto, afterPhoto, beforeVisit, afterVisit, isComplete } = group
  const total = Math.max(0, Number(tratamiento.total_sesiones) || 0)
  const completed = Math.min(total, Math.max(0, Number(tratamiento.sesiones_completadas) || 0))
  const progress = total ? completed / total * 100 : 0
  const status = statusLabels[tratamiento.estado] ? tratamiento.estado : 'pausado'
  const latestVisit = group.visitas.at(-1) ?? null
  const afterSessionStart = Math.max(1, total - 2)
  const currentAfterVisit = sesiones
    .filter(({ numero, visita }) => numero >= afterSessionStart && canCaptureAppointmentPhoto(visita, 'despues', total, numero))
    .at(-1)?.visita ?? null
  const beforePhotoVisit = beforePhoto?.cita_id
    ? group.visitas.find((visit) => visit.id === beforePhoto.cita_id) ?? beforeVisit
    : beforeVisit
  const afterPhotoVisit = afterPhoto?.cita_id
    ? group.visitas.find((visit) => visit.id === afterPhoto.cita_id) ?? currentAfterVisit ?? (isComplete ? afterVisit : null)
    : currentAfterVisit ?? (isComplete ? afterVisit : null)

  function openTreatmentPhoto(photo) {
    const gallery = [
      beforePhoto?.displayUrl && { url: beforePhoto.displayUrl, type: 'Antes', service: tratamiento.servicio_nombre, date: formatDate(beforePhoto.fecha_subida), alt: 'Foto antes del tratamiento' },
      afterPhoto?.displayUrl && { url: afterPhoto.displayUrl, type: 'Después', service: tratamiento.servicio_nombre, date: formatDate(afterPhoto.fecha_subida), alt: 'Foto después del tratamiento' },
    ].filter(Boolean)
    onViewPhoto(gallery, photo.displayUrl)
  }

  function renderPhoto(photo, type, targetVisit) {
    const canUpload = photo
      ? targetVisit?.estado !== 'atendida'
      : type === 'antes'
        ? canCaptureAppointmentPhoto(targetVisit, 'antes', total, 1)
        : Boolean(currentAfterVisit) || (isComplete && Boolean(afterPhotoVisit))
    return (
      <article className="visit-gallery__item" key={type}>
        <div className="visit-gallery__media">
          {photo?.displayUrl
            ? <button className="visit-gallery__open" type="button" aria-label={`Ampliar foto ${type}`} onClick={() => openTreatmentPhoto(photo)}><img src={photo.displayUrl} alt={`Foto ${type} del tratamiento`} loading="lazy" /></button>
            : <div className="visit-gallery__placeholder"><Camera size={20} aria-hidden="true" /><span>{photo ? 'Foto no disponible' : `Sin foto ${type}`}</span></div>}
        </div>
        <span className="visit-gallery__caption"><Camera size={14} aria-hidden="true" /> {type === 'antes' ? 'Antes' : 'Después'}</span>
        {targetVisit && canUpload && (
          <VisitAfterPhotoUploader
            visit={targetVisit}
            clientId={clientId}
            hasPhoto={Boolean(photo)}
            existingPhoto={photo}
            photoType={type}
            canUpload={canUpload}
            allowReplace={targetVisit.estado !== 'atendida'}
            onSaved={(savedPhoto) => onPhotoSaved(targetVisit.id, savedPhoto)}
          />
        )}
        {!photo && type === 'despues' && !canUpload && <span className="treatment-history__after-locked">Disponible desde la sesión {afterSessionStart}</span>}
      </article>
    )
  }

  return (
    <article className={`treatment-history-card treatment-history-card--${status}`}>
      <header className="treatment-history-card__header">
        <div>
          <span className="visit-card__date">{latestVisit ? `${formatDate(latestVisit.fecha)} · ${formatTime(latestVisit.hora_inicio)}` : formatDate(tratamiento.fecha_inicio)}</span>
          <h3>{tratamiento.servicio_nombre || 'Tratamiento'}</h3>
          <p>{tratamiento.profesional_nombre || 'Profesional no registrado'}</p>
        </div>
        <div className="treatment-history-card__header-actions">
          {isAdmin && ['completado', 'abandonado'].includes(status) && (
            <button className="history-visibility-action" type="button" disabled={busy} onClick={() => onToggleVisibility(tratamiento)}>
              {tratamiento.oculto_en_expediente_at ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
              {tratamiento.oculto_en_expediente_at ? 'Restaurar' : 'Ocultar'}
            </button>
          )}
          {tratamiento.oculto_en_expediente_at && <span className="visit-card__status visit-card__status--oculta">Oculta</span>}
          <span className={`treatment-card__status treatment-card__status--${status}`}>{statusLabels[status]}</span>
        </div>
      </header>
      <div className="treatment-card__progress-label"><span>Progreso</span><strong>{completed}/{total} sesiones</strong></div>
      <div className="treatment-card__progress" role="progressbar" aria-label="Progreso del tratamiento" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}><span style={{ width: `${progress}%` }} /></div>
      <div className="treatment-history__sessions" aria-label="Sesiones del tratamiento">
        {sesiones.map(({ numero, asistencia, visita }) => (
          (() => {
            const sessionStatus = asistencia || visita?.estado === 'atendida'
              ? 'atendida'
              : visita?.estado === 'cancelada'
                ? 'cancelada'
                : visita?.estado === 'confirmada'
                  ? 'confirmada'
                  : 'pendiente'
            const sessionStatusLabels = { atendida: 'Atendida', confirmada: 'Confirmada', cancelada: 'Cancelada', pendiente: 'Pendiente' }
            return (
              <div className={`treatment-history__session treatment-history__session--${sessionStatus}`} key={numero}>
                <span className="treatment-history__session-number">{numero}</span>
                <span className="treatment-history__session-date">{asistencia ? formatDate(asistencia.fecha_asistencia) : visita ? formatDate(visita.fecha) : 'Pendiente'}</span>
                <span className="treatment-history__session-time">{asistencia ? formatTime(asistencia.hora_inicio) : visita ? formatTime(visita.hora_inicio) : '—'}</span>
                <span className={`treatment-history__session-status treatment-history__session-status--${sessionStatus}`}>{sessionStatusLabels[sessionStatus]}</span>
                {sessionStatus === 'atendida' && <Check size={15} aria-label="Sesión atendida" />}
              </div>
            )
          })()
        ))}
      </div>
      <div className="visit-gallery treatment-history__gallery" aria-label="Fotos del tratamiento">
        {renderPhoto(beforePhoto, 'antes', beforePhotoVisit)}
        {renderPhoto(afterPhoto, 'despues', afterPhotoVisit)}
      </div>
    </article>
  )
}

export default TratamientoHistorialCard
