import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'

const categories = ['Facial', 'Corporal', 'Uñas', 'Depilación', 'Masajes', 'Otro']

function ServicioForm({ service = null, onClose, onSaved }) {
  const isEditing = Boolean(service?.id)
  const [values, setValues] = useState({
    nombre: service?.nombre ?? '',
    descripcion: service?.descripcion ?? '',
    categoria: service?.categoria ?? '',
    duracion_minutos: String(service?.duracion_minutos ?? 60),
    sesiones: String(service?.sesiones ?? 1),
    precio: service?.precio == null ? '' : String(service.precio),
    requiere_consentimiento: service?.requiere_consentimiento ?? false,
    activo: service?.activo ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleChange(event) {
    const { name, value, checked, type } = event.target
    setValues((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!supabase) {
      setError('La conexión con Supabase no está configurada.')
      return
    }

    setSaving(true)
    setError('')
    const payload = {
        nombre: values.nombre.trim(),
        descripcion: values.descripcion.trim() || null,
        categoria: values.categoria,
        duracion_minutos: Number(values.duracion_minutos),
        sesiones: Number(values.sesiones),
        precio: values.precio === '' ? null : Number(values.precio),
        requiere_consentimiento: values.requiere_consentimiento,
        activo: values.activo,
      }
    const request = isEditing
      ? supabase.from('servicios').update(payload).eq('id', service.id)
      : supabase.from('servicios').insert(payload)
    const { data: savedService, error: saveError } = await request.select('*').single()

    setSaving(false)
    if (saveError) {
      setError(saveError.code === '42501' || saveError.code === 'PGRST301'
        ? 'Tu cuenta no tiene permiso para crear servicios; esta acción requiere rol administrador.'
        : saveError.code === 'PGRST205'
          ? 'Supabase no encuentra public.servicios. Verifica que la tabla esté creada y expuesta.'
          : 'No se pudo guardar el servicio. Revisa los datos e inténtalo de nuevo.')
      return
    }

    onSaved(savedService)
  }

  return (
    <div className="creation-overlay cliente-form-overlay">
      <section className="creation-dialog cliente-form-dialog service-form-dialog" role="dialog" aria-modal="true" aria-labelledby="service-form-title">
        <button className="creation-dialog__close" type="button" aria-label="Cerrar formulario" onClick={onClose} disabled={saving}>
          <X size={19} aria-hidden="true" />
        </button>
        <span className="eyebrow text-dorado-oscuro">CATÁLOGO</span>
        <h2 id="service-form-title">{isEditing ? 'Editar servicio' : 'Nuevo servicio'}</h2>
        <p className="cliente-form__intro">Registra los detalles del servicio para la agenda.</p>

        <form onSubmit={handleSubmit}>
          <div className="cliente-form__grid">
            <label className="cliente-form__field cliente-form__field--wide" htmlFor="service-name">
              <span>Nombre *</span>
              <Input id="service-name" name="nombre" value={values.nombre} onChange={handleChange} required maxLength={120} />
            </label>
            <label className="cliente-form__field" htmlFor="service-category">
              <span>Categoría *</span>
              <select id="service-category" className="cliente-form__select" name="categoria" value={values.categoria} onChange={handleChange} required>
                <option value="">Seleccionar</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="cliente-form__field" htmlFor="service-duration">
              <span>Duración (minutos) *</span>
              <Input id="service-duration" name="duracion_minutos" type="number" min="1" step="1" value={values.duracion_minutos} onChange={handleChange} required />
            </label>
            <label className="cliente-form__field" htmlFor="service-sessions">
              <span>Sesiones *</span>
              <Input id="service-sessions" name="sesiones" type="number" min="1" step="1" value={values.sesiones} onChange={handleChange} required />
            </label>
            <label className="cliente-form__field" htmlFor="service-price">
              <span>Precio</span>
              <Input id="service-price" name="precio" type="number" min="0" step="0.01" value={values.precio} onChange={handleChange} />
            </label>
            <label className="cliente-form__field cliente-form__field--wide" htmlFor="service-description">
              <span>Descripción</span>
              <textarea id="service-description" className="cliente-form__textarea" name="descripcion" value={values.descripcion} onChange={handleChange} rows={3} />
            </label>
            <label className="service-form__toggle">
              <input type="checkbox" name="requiere_consentimiento" checked={values.requiere_consentimiento} onChange={handleChange} />
              <span>Requiere consentimiento informado</span>
            </label>
            <label className="service-form__toggle">
              <input type="checkbox" name="activo" checked={values.activo} onChange={handleChange} />
              <span>Servicio activo</span>
            </label>
          </div>

          {error && <p className="form-message form-message--error" role="alert">{error}</p>}
          <div className="cliente-form__actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" className="cliente-form__submit" disabled={saving}>{saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Guardar servicio'}</Button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default ServicioForm