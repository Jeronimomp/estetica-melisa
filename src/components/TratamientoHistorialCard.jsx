import { Camera, Check } from 'lucide-react'
import VisitAfterPhotoUploader from '@/components/VisitAfterPhotoUploader'

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

function TratamientoHistorialCard({ group, clientId, onPhotoSaved, onViewPhoto }) {
  const { tratamiento, sesiones, beforePhoto, afterPhoto, beforeVisit, afterVisit, isComplete } = group
  const total = Math.max(0, Number(tratamiento.total_sesiones) || 0)
  const completed = Math.min(total, Math.max(0, Number(tratamiento.sesiones_completadas) || 0))
  const progress = total ? completed / total * 100 : 0
  const status = statusLabels[tratamiento.estado] ? tratamiento.estado : 'pausado'

  function renderPhoto(photo, type, targetVisit) {
    return (
      <article className="visit-gallery__item" key={type}>
        <div className="visit-gallery__media">
          {photo?.displayUrl
            ? <button className="visit-gallery__open" type="button" aria-label={`Ampliar foto ${type}`} onClick={() => onViewPhoto({ url: photo.displayUrl, type: type === 'antes' ? 'Antes' : 'Después', service: tratamiento.servicio_nombre, date: formatDate(photo.fecha_subida) })}><img src={photo.displayUrl} alt={`Foto ${type} del tratamiento`} loading="lazy" /></button>
            : <div className="visit-gallery__placeholder"><Camera size={20} aria-hidden="true" /><span>{photo ? 'Foto no disponible' : `Sin foto ${type}`}</span></div>}
        </div>
        <span className="visit-gallery__caption"><Camera size={14} aria-hidden="true" /> {type === 'antes' ? 'Antes' : 'Después'}</span>
        {!photo && targetVisit && (type === 'antes' || isComplete) && (
          <VisitAfterPhotoUploader
            visit={targetVisit}
            clientId={clientId}
            hasPhoto={false}
            photoType={type}
            onSaved={(savedPhoto) => onPhotoSaved(targetVisit.id, savedPhoto)}
          />
        )}
        {!photo && type === 'despues' && !isComplete && <span className="treatment-history__after-locked">Disponible al completar todas las sesiones</span>}
      </article>
    )
  }

  return (
    <article className={`treatment-history-card treatment-history-card--${status}`}>
      <header className="treatment-history-card__header">
        <div>
          <span className="visit-card__date">{formatDate(tratamiento.fecha_inicio)}</span>
          <h3>{tratamiento.servicio_nombre || 'Tratamiento'}</h3>
          <p>{tratamiento.profesional_nombre || 'Profesional no registrado'}</p>
        </div>
        <span className={`treatment-card__status treatment-card__status--${status}`}>{statusLabels[status]}</span>
      </header>
      <div className="treatment-card__progress-label"><span>Progreso</span><strong>{completed}/{total} sesiones</strong></div>
      <div className="treatment-card__progress" role="progressbar" aria-label="Progreso del tratamiento" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}><span style={{ width: `${progress}%` }} /></div>
      <div className="treatment-history__sessions" aria-label="Sesiones del tratamiento">
        {sesiones.map(({ numero, asistencia, visita }) => (
          <div className={`treatment-history__session${asistencia ? ' treatment-history__session--complete' : ''}`} key={numero}>
            <span className="treatment-history__session-number">{numero}</span>
            <span className="treatment-history__session-date">{asistencia ? formatDate(asistencia.fecha_asistencia) : visita ? formatDate(visita.fecha) : 'Pendiente'}</span>
            <span className="treatment-history__session-time">{asistencia ? formatTime(asistencia.hora_inicio) : visita ? formatTime(visita.hora_inicio) : '—'}</span>
            {asistencia && <Check size={15} aria-label="Sesión completada" />}
          </div>
        ))}
      </div>
      <div className="visit-gallery treatment-history__gallery" aria-label="Fotos del tratamiento">
        {renderPhoto(beforePhoto, 'antes', beforeVisit)}
        {renderPhoto(afterPhoto, 'despues', afterVisit)}
      </div>
    </article>
  )
}

export default TratamientoHistorialCard
