import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useVisualViewport } from '@/hooks/useVisualViewport'

const requiredFields = [
  { name: 'nombre', label: 'Nombre completo', type: 'text', required: true },
  { name: 'telefono', label: 'Teléfono', type: 'tel', required: true },
]

const optionalFields = [
  { name: 'correo', label: 'Correo electrónico', type: 'email' },
  { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
  { name: 'estatura', label: 'Estatura (m)', type: 'number', min: '0.30', step: '0.01' },
  { name: 'peso', label: 'Peso (kg)', type: 'number', min: '0.01', step: '0.01' },
  {
    name: 'tipo_documento',
    label: 'Tipo de documento',
    type: 'select',
    options: ['Cédula de ciudadanía', 'Cédula de extranjería', 'Pasaporte', 'Otro'],
  },
  { name: 'numero_documento', label: 'Número de documento', type: 'text' },
  {
    name: 'genero',
    label: 'Género',
    type: 'select',
    options: ['Femenino', 'Masculino', 'No binario', 'Prefiere no decirlo'],
  },
  { name: 'direccion', label: 'Dirección', type: 'text', wide: true },
  { name: 'ciudad', label: 'Ciudad', type: 'text' },
  { name: 'ocupacion', label: 'Ocupación', type: 'text' },
  { name: 'como_nos_conocio', label: '¿Cómo nos conoció?', type: 'text' },
  { name: 'alergias', label: 'Alergias', type: 'textarea' },
  { name: 'enfermedades', label: 'Enfermedades', type: 'textarea' },
  { name: 'medicamentos', label: 'Medicamentos', type: 'textarea' },
  { name: 'observaciones', label: 'Observaciones', type: 'textarea', wide: true },
]

const allFields = [...requiredFields, ...optionalFields]

function getInitialValues(client) {
  return Object.fromEntries(allFields.map(({ name }) => [name, client?.[name] ?? '']))
}

function getSaveError(error) {
  if (error?.code === 'PGRST205') {
    return 'Supabase no encuentra public.clientes. Verifica que la tabla esté creada y expuesta en el esquema public.'
  }
  if (error?.code === '42501' || error?.code === 'PGRST301') {
    return 'Tu cuenta no tiene permiso para guardar clientes.'
  }
  return 'No se pudo guardar el cliente. Revisa los datos e inténtalo de nuevo.'
}

function calculateBmi(weight, height) {
  const parsedWeight = Number.parseFloat(weight)
  const parsedHeight = Number.parseFloat(height)
  if (!Number.isFinite(parsedWeight) || !Number.isFinite(parsedHeight) || parsedWeight <= 0 || parsedHeight <= 0) return ''
  return (parsedWeight / (parsedHeight * parsedHeight)).toFixed(2)
}

function ClienteForm({ client = null, quick = false, onClose, onSaved }) {
  const overlayRef = useRef(null)
  useVisualViewport(overlayRef)
  const [values, setValues] = useState(() => getInitialValues(client))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fields = quick ? requiredFields : allFields
  const isEditing = Boolean(client?.id)

  function handleChange(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!supabase) {
      setError('La conexión con Supabase no está configurada.')
      return
    }

    setSaving(true)
    setError('')
    const payload = Object.fromEntries(
      fields.map(({ name }) => [name, values[name].trim() || null]),
    )
    payload.nombre = values.nombre.trim()
    payload.telefono = values.telefono.trim()
    if (isEditing) payload.updated_at = new Date().toISOString()

    const request = isEditing
      ? supabase.from('clientes').update(payload).eq('id', client.id).select('*').single()
      : supabase.from('clientes').insert(payload).select('*').single()
    const { data, error: saveError } = await request

    if (saveError) {
      setError(getSaveError(saveError))
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved(data)
  }

  return (
    <div ref={overlayRef} className="creation-overlay cliente-form-overlay">
      <section className="creation-dialog cliente-form-dialog" role="dialog" aria-modal="true" aria-labelledby="cliente-form-title">
        <button className="creation-dialog__close" type="button" aria-label="Cerrar formulario" onClick={onClose} disabled={saving}>
          <X size={19} aria-hidden="true" />
        </button>
        <span className="eyebrow text-dorado-oscuro">{quick ? 'ALTA RÁPIDA' : 'EXPEDIENTE'}</span>
        <h2 id="cliente-form-title">{quick ? 'Nuevo cliente' : isEditing ? 'Editar cliente' : 'Completar expediente'}</h2>
        <p className="cliente-form__intro">
          {quick ? 'Registra nombre y teléfono; podrás completar el resto después.' : 'Los campos con * son obligatorios.'}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="cliente-form__grid">
            {fields.map((field) => (
              <label className={`cliente-form__field${field.wide ? ' cliente-form__field--wide' : ''}`} key={field.name} htmlFor={`cliente-${field.name}`}>
                <span>{field.label}{field.required && <strong> *</strong>}</span>
                {field.type === 'select' ? (
                  <select
                    id={`cliente-${field.name}`}
                    className="cliente-form__select"
                    name={field.name}
                    value={values[field.name]}
                    onChange={handleChange}
                  >
                    <option value="">Seleccionar</option>
                    {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    id={`cliente-${field.name}`}
                    className="cliente-form__textarea"
                    name={field.name}
                    value={values[field.name]}
                    onChange={handleChange}
                    rows={3}
                  />
                ) : (
                  <Input
                    id={`cliente-${field.name}`}
                    name={field.name}
                    type={field.type}
                    value={values[field.name]}
                    onChange={handleChange}
                    required={field.required}
                    min={field.min}
                    step={field.step}
                    autoComplete={field.name === 'correo' ? 'email' : 'off'}
                  />
                )}
              </label>
            ))}
              {!quick && (
                <div className="cliente-form__field cliente-form__field--readonly" aria-live="polite">
                  <span>IMC Calculado</span>
                  <output>{calculateBmi(values.peso, values.estatura) || '—'}{calculateBmi(values.peso, values.estatura) && ' kg/m²'}</output>
                  <small>IMC = peso (kg) / estatura (m)²</small>
                </div>
              )}
          </div>

          {error && <p className="form-message form-message--error" role="alert">{error}</p>}

          <div className="cliente-form__actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" className="cliente-form__submit" disabled={saving}>
              {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Guardar cliente'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default ClienteForm