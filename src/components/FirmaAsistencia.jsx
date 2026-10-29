import { useRef, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import PatientSignatureField from '@/components/PatientSignatureField'

function FirmaAsistencia({ cita, tratamientoId, servicio, numeroSesion, totalSesiones, esPrimeraSesion, onCerrar, onConfirmar, onIrHistoria }) {
  const signatureRef = useRef(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const client = Array.isArray(cita.cliente) ? cita.cliente[0] : cita.cliente

  async function handleSubmit(event) {
    event.preventDefault()
    if (!hasSignature) {
      setError('La firma del paciente es obligatoria para confirmar la asistencia.')
      return
    }
    if (saving) return

    setSaving(true)
    setError('')
    const result = await onConfirmar({
      signatureCanvas: signatureRef.current,
      observaciones: observaciones.trim(),
      tratamientoId,
      numeroSesion,
      totalSesiones,
      cita,
    })
    if (result?.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    onCerrar()
  }

  return (
    <div className="creation-overlay attendance-signature-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCerrar() }}>
      <section className="attendance-signature-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-signature-title">
        <header className="attendance-signature__header">
          <div>
            <span className="eyebrow text-dorado-oscuro">{servicio || 'TRATAMIENTO'}</span>
            <h2 id="attendance-signature-title">Sesión {numeroSesion} de {totalSesiones} — Firma de asistencia</h2>
            <p>{client?.nombre || 'Paciente'}</p>
          </div>
          <button className="creation-dialog__close" type="button" aria-label="Cerrar firma de asistencia" onClick={onCerrar} disabled={saving}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <form className="attendance-signature__form" onSubmit={handleSubmit}>
          {esPrimeraSesion && (
            <aside className="attendance-signature__first-session">
              <p>Primera sesión: recuerda diligenciar la historia clínica del paciente.</p>
              <Button type="button" variant="outline" onClick={onIrHistoria} disabled={saving}>Ir a historia clínica</Button>
            </aside>
          )}
          <label className="clinical-history__field attendance-signature__observations">
            <span>Observaciones de esta sesión</span>
            <textarea value={observaciones} onChange={(event) => setObservaciones(event.target.value)} rows={3} maxLength={2000} placeholder="Opcional" />
          </label>
          <PatientSignatureField signatureRef={signatureRef} hasSignature={hasSignature} onSignatureChange={setHasSignature} />
          {error && <p className="form-message form-message--error" role="alert">{error}</p>}
          <div className="clinical-history__actions">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={saving}>Cancelar</Button>
            <Button type="submit" className="clinical-history__submit" disabled={saving || !hasSignature}>
              {saving ? <LoaderCircle className="clinical-history__spinner" size={17} aria-hidden="true" /> : null}
              {saving ? 'Guardando asistencia…' : 'Confirmar asistencia'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default FirmaAsistencia
