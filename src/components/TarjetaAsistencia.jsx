import { useState } from 'react'
import { Printer, X } from 'lucide-react'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

function formatTime(value) {
  if (!value) return '—'
  const parts = String(value).slice(0, 5).split(':').map(Number)
  if (parts.length !== 2 || parts.some(Number.isNaN)) return String(value)
  return new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(new Date(2020, 0, 1, parts[0], parts[1]))
}

function TarjetaAsistencia({ tratamiento, asistencias, onCerrar }) {
  const [signature, setSignature] = useState(null)
  const total = Math.max(0, Number(tratamiento.total_sesiones) || 0)
  const attendanceByNumber = new Map(asistencias.map((attendance) => [Number(attendance.numero_sesion), attendance]))
  const rows = Array.from({ length: total }, (_, index) => {
    const numero = index + 1
    return { numero, attendance: attendanceByNumber.get(numero) ?? null }
  })

  return (
    <div className="creation-overlay treatment-attendance-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCerrar() }}>
      <section className="treatment-attendance-dialog" role="dialog" aria-modal="true" aria-labelledby="treatment-attendance-title">
        <header className="treatment-attendance__header">
          <div>
            <span className="eyebrow text-dorado-oscuro">TRATAMIENTO</span>
            <h2 id="treatment-attendance-title">Tarjeta de asistencia</h2>
            <p>{tratamiento.servicio_nombre || 'Tratamiento'}</p>
          </div>
          <button className="creation-dialog__close" type="button" aria-label="Cerrar tarjeta" onClick={onCerrar}><X size={19} aria-hidden="true" /></button>
        </header>
        <div className="treatment-attendance__content">
          <p className="treatment-attendance__summary">
            {tratamiento.profesional_nombre || 'Profesional no registrado'} · {tratamiento.sesiones_completadas || 0}/{total} sesiones
          </p>
          <div className="treatment-attendance__table-wrap">
            <table className="treatment-attendance__table">
              <thead><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Firma</th></tr></thead>
              <tbody>
                {rows.map(({ numero, attendance }) => (
                  <tr className={attendance ? 'treatment-attendance__row--complete' : 'treatment-attendance__row--pending'} key={numero}>
                    <th scope="row">{numero}</th>
                    <td>{attendance ? formatDate(attendance.fecha_asistencia) : '(pendiente)'}</td>
                    <td>{attendance ? formatTime(attendance.hora_inicio) : '—'}</td>
                    <td>{attendance?.firma_display_url
                      ? <button className="treatment-attendance__signature-link" type="button" onClick={() => setSignature({ url: attendance.firma_display_url, numero })}>Ver firma 🔍</button>
                      : attendance ? 'No disponible' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="treatment-attendance__actions">
            <button className="treatment-attendance__print" type="button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Imprimir tarjeta</button>
            <button className="treatment-attendance__close" type="button" onClick={onCerrar}>Cerrar</button>
          </div>
        </div>
      </section>
      {signature && (
        <div className="attendance-signature-preview-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSignature(null) }}>
          <section className="attendance-signature-preview" role="dialog" aria-modal="true" aria-label={`Firma de la sesión ${signature.numero}`}>
            <button type="button" aria-label="Cerrar firma" onClick={() => setSignature(null)}><X size={18} aria-hidden="true" /></button>
            <img src={signature.url} alt={`Firma del paciente en la sesión ${signature.numero}`} />
          </section>
        </div>
      )}
    </div>
  )
}

export default TarjetaAsistencia
