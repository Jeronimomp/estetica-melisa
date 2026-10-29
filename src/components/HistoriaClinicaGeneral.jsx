import { useRef, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useVisualViewport } from '@/hooks/useVisualViewport'

function HistoriaClinicaGeneral({ cita, onGuardado, onCerrar }) {
  const overlayRef = useRef(null)
  useVisualViewport(overlayRef)
  const [observaciones, setObservaciones] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedHistory, setSavedHistory] = useState(null)
  const client = Array.isArray(cita.cliente) ? cita.cliente[0] : cita.cliente

  async function complete(history) {
    const result = await onGuardado(history)
    if (result?.error) setError(`La historia se guardó, pero ${result.error}`)
    else onCerrar()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!observaciones.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      if (savedHistory) {
        await complete(savedHistory)
        setSaving(false)
        return
      }
      if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
      const { data: existing, error: existingError } = await supabase.from('historia_clinica').select('*').eq('cita_id', cita.id).eq('tipo', 'general').limit(1).maybeSingle()
      if (existingError) throw new Error('No se pudo verificar si ya existe una historia clínica para esta cita.')
      if (existing) {
        setSavedHistory(existing)
        await complete(existing)
        setSaving(false)
        return
      }
      const { data, error: saveError } = await supabase.from('historia_clinica').insert({
        cliente_id: cita.cliente_id,
        cita_id: cita.id,
        profesional_id: cita.profesional_id,
        tipo: 'general',
        contenido: { observaciones_generales: observaciones.trim() },
        fecha: new Date().toISOString().split('T')[0],
      }).select('*').single()
      if (saveError) throw new Error('No se pudo guardar la historia clínica. Revisa permisos y datos.')
      setSavedHistory(data)
      await complete(data)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la historia clínica.')
    }
    setSaving(false)
  }

  return (
    <div ref={overlayRef} className="creation-overlay clinical-history-overlay">
      <section className="clinical-history-dialog clinical-history-dialog--general" role="dialog" aria-modal="true" aria-labelledby="general-history-title">
        <header className="clinical-history__header"><div><span className="eyebrow text-dorado-oscuro">EXPEDIENTE CLÍNICO</span><h2 id="general-history-title">Observaciones generales</h2><p>{client?.nombre || 'Cliente'}</p></div><button className="creation-dialog__close" type="button" aria-label="Cerrar ficha" onClick={onCerrar} disabled={saving}><X size={19} aria-hidden="true" /></button></header>
        <form className="clinical-history__form" onSubmit={handleSubmit}>
          <label className="clinical-history__field clinical-history__field--wide"><span>Observaciones de la atención *</span><textarea value={observaciones} onChange={(event) => setObservaciones(event.target.value)} rows={6} maxLength={4000} required /></label>
          {error && <p className="form-message form-message--error" role="alert">{error}</p>}
          <div className="clinical-history__actions"><Button type="button" variant="outline" onClick={onCerrar} disabled={saving}>Cancelar</Button><Button type="submit" className="clinical-history__submit" disabled={saving || !observaciones.trim()}>{saving ? <LoaderCircle className="clinical-history__spinner" size={17} aria-hidden="true" /> : null}{savedHistory ? 'Reintentar finalizar cita' : saving ? 'Guardando…' : 'Guardar historia clínica'}</Button></div>
        </form>
      </section>
    </div>
  )
}

export default HistoriaClinicaGeneral
