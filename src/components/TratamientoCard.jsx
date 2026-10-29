import { ClipboardList } from 'lucide-react'

const statusLabels = {
  en_curso: 'En curso',
  completado: 'Completado',
  pausado: 'Pausado',
  abandonado: 'Abandonado',
}

function formatDate(value) {
  if (!value) return 'Fecha pendiente'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return 'Fecha pendiente'
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function TratamientoCard({ tratamiento, onVerTarjeta }) {
  const total = Math.max(0, Number(tratamiento.total_sesiones) || 0)
  const completed = Math.min(total, Math.max(0, Number(tratamiento.sesiones_completadas) || 0))
  const progress = total ? (completed / total) * 100 : 0
  const status = statusLabels[tratamiento.estado] ? tratamiento.estado : 'pausado'

  return (
    <article className={`treatment-card treatment-card--${status}`}>
      <header className="treatment-card__heading">
        <div>
          <h3>{tratamiento.servicio_nombre || 'Tratamiento'}</h3>
          <p>{tratamiento.profesional_nombre || 'Profesional no registrado'} · Inicio: {formatDate(tratamiento.fecha_inicio)}</p>
        </div>
        <span className={`treatment-card__status treatment-card__status--${status}`}>
          {statusLabels[status]}
        </span>
      </header>
      <div className="treatment-card__progress-label">
        <span>Progreso</span>
        <strong>{completed}/{total} sesiones</strong>
      </div>
      <div className="treatment-card__progress" role="progressbar" aria-label="Progreso del tratamiento" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <button className="treatment-card__view" type="button" onClick={() => onVerTarjeta(tratamiento)}>
        <ClipboardList size={16} aria-hidden="true" /> Ver tarjeta de asistencia
      </button>
    </article>
  )
}

export default TratamientoCard
