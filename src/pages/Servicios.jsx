import { useEffect, useState } from 'react'
import { Clock3, Pencil, Plus, Search, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import ServicioForm from '@/components/ServicioForm'

const categories = ['Facial', 'Corporal', 'Uñas', 'Depilación', 'Masajes', 'Otro']
const emptyServices = []

function getServiceError(error) {
  if (error?.code === 'PGRST205') return 'Supabase no encuentra public.servicios. Verifica que la tabla esté creada y expuesta.'
  if (error?.code === '42703' || error?.code === 'PGRST204') return 'Falta actualizar public.servicios con sus columnas más recientes, incluidas categoria y sesiones.'
  if (error?.code === '42501' || error?.code === 'PGRST301') return 'Tu cuenta no tiene permiso para consultar servicios.'
  return 'No se pudieron cargar los servicios. Inténtalo de nuevo.'
}

function getServiceDeleteError(error) {
  if (error?.code === '23503') return 'No se puede eliminar porque hay citas relacionadas. Puedes desactivar el servicio para retirarlo de nuevas citas.'
  if (error?.code === '42501' || error?.code === 'PGRST301') return 'Solo un administrador puede eliminar servicios.'
  return 'No se pudo eliminar el servicio. Inténtalo de nuevo.'
}

function formatPrice(value) {
  if (value == null || value === '') return 'Precio por definir'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function Servicios({ isAdmin }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todas')
  const [visibility, setVisibility] = useState('activos')
  const [loadResult, setLoadResult] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [serviceForm, setServiceForm] = useState(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyServiceId, setBusyServiceId] = useState('')
  const requestKey = JSON.stringify([isAdmin, search.trim(), category, visibility, refresh])
  const result = loadResult?.key === requestKey ? loadResult : null
  const services = result?.services ?? emptyServices
  const loading = Boolean(supabase && !result)
  const error = !supabase ? 'La conexión con Supabase no está configurada.' : result?.error ?? ''

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const timer = window.setTimeout(async () => {
      function buildQuery(searchColumn) {
        let query = supabase
          .from('servicios')
          .select('id, nombre, descripcion, categoria, duracion_minutos, sesiones, precio, requiere_consentimiento, activo')
          .order('nombre', { ascending: true })
          .limit(100)
        if (!isAdmin || visibility === 'activos') query = query.eq('activo', true)
        if (isAdmin && visibility === 'inactivos') query = query.eq('activo', false)
        if (category !== 'Todas') query = query.eq('categoria', category)
        if (search.trim()) query = query.ilike(searchColumn, `%${search.trim()}%`)
        return query
      }

      const results = search.trim()
        ? await Promise.all([buildQuery('nombre'), buildQuery('categoria')])
        : [await buildQuery('nombre')]
      if (!active) return

      const queryError = results.find((item) => item.error)?.error
      if (queryError) {
        setLoadResult({ key: requestKey, services: [], error: getServiceError(queryError) })
        return
      }

      const uniqueServices = new Map()
      results.forEach(({ data }) => (data ?? []).forEach((service) => uniqueServices.set(service.id, service)))
      const sortedServices = [...uniqueServices.values()].sort((first, second) => first.nombre.localeCompare(second.nombre, 'es'))
      setLoadResult({ key: requestKey, services: sortedServices, error: '' })
    }, search.trim() ? 200 : 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [category, isAdmin, requestKey, search, visibility])

  async function toggleActive(service) {
    if (!isAdmin || !supabase || busyServiceId) return
    const nextActive = !service.activo
    const action = nextActive ? 'activar' : 'desactivar'
    if (!window.confirm(`¿Seguro que deseas ${action} el servicio “${service.nombre}”?`)) return

    setBusyServiceId(service.id)
    setActionError('')
    setNotice('')
    const { error: updateError } = await supabase
      .from('servicios')
      .update({ activo: nextActive })
      .eq('id', service.id)

    setBusyServiceId('')
    if (updateError) {
      setActionError(updateError.code === '42501' || updateError.code === 'PGRST301'
        ? 'Solo un administrador puede cambiar el estado del servicio.'
        : 'No se pudo actualizar el servicio.')
      return
    }
    setNotice(nextActive ? 'Servicio activado.' : 'Servicio desactivado; ya no se ofrecerá para nuevas citas.')
    setRefresh((current) => current + 1)
  }

  async function deleteService(service) {
    if (!isAdmin || !supabase || busyServiceId) return
    if (!window.confirm(`¿Seguro que deseas eliminar el servicio “${service.nombre}”? Esta acción no se puede deshacer.`)) return

    setBusyServiceId(service.id)
    setActionError('')
    setNotice('')
    const { data, error: deleteError } = await supabase.from('servicios').delete().eq('id', service.id).select('id').maybeSingle()
    setBusyServiceId('')
    if (deleteError) {
      setActionError(getServiceDeleteError(deleteError))
      return
    }
    if (!data) {
      setActionError('No se pudo confirmar la eliminación. Verifica los permisos de tu cuenta.')
      return
    }
    setNotice(`${service.nombre} se eliminó correctamente.`)
    setRefresh((current) => current + 1)
  }

  function handleSaved(service) {
    setServiceForm(null)
    setNotice(`${service.nombre} se guardó correctamente.`)
    setActionError('')
    setRefresh((current) => current + 1)
  }

  return (
    <section className="workspace-main services-page">
      <header className="services-page__heading">
        <div>
          <span className="eyebrow text-dorado-oscuro">CATÁLOGO</span>
          <h1>Servicios</h1>
          <p className="workspace-intro">Consulta los tratamientos disponibles en la estética.</p>
        </div>
        {isAdmin && (
          <Button className="services-page__add" onClick={() => { setNotice(''); setServiceForm({ mode: 'create' }) }}>
            <Plus size={17} aria-hidden="true" /> Nuevo servicio
          </Button>
        )}
      </header>
      {isAdmin && (
        <button
          className="floating-action services-page__floating-add"
          type="button"
          aria-label="Agregar un servicio"
          title="Agregar un servicio"
          onClick={() => { setNotice(''); setServiceForm({ mode: 'create' }) }}
        >
          <Plus size={25} aria-hidden="true" />
        </button>
      )}

      <label className="service-search" htmlFor="service-search-input">
        <Search size={18} aria-hidden="true" />
        <Input
          id="service-search-input"
          type="search"
          placeholder="Buscar por nombre o categoría"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoComplete="off"
        />
      </label>

      <div className="services-filters">
        <label className="service-category-filter" htmlFor="service-category-filter">
          <span>Categoría</span>
          <select id="service-category-filter" className="cliente-form__select" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="Todas">Todas</option>
            {categories.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        {isAdmin && (
          <div className="service-visibility-filter" role="group" aria-label="Filtrar por estado">
            {[
              ['activos', 'Activos'],
              ['inactivos', 'Inactivos'],
              ['todos', 'Todos'],
            ].map(([value, label]) => (
              <button
                className={visibility === value ? 'service-visibility-filter__active' : ''}
                type="button"
                key={value}
                aria-pressed={visibility === value}
                onClick={() => setVisibility(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {notice && <p className="form-message form-message--success" role="status">{notice}</p>}
      {actionError && <p className="client-state client-state--error" role="alert">{actionError}</p>}
      {error && <p className="client-state client-state--error" role="alert">{error}</p>}
      {loading && <p className="client-state" role="status">Cargando servicios…</p>}
      {!loading && !error && services.length === 0 && (
        <div className="client-empty">
          <span className="client-empty__icon"><Sparkles size={22} aria-hidden="true" /></span>
          <h2>{search.trim() || category !== 'Todas' ? 'No hay coincidencias' : 'No hay servicios para mostrar'}</h2>
          <p>{isAdmin ? 'Crea el primer servicio desde “Nuevo servicio”.' : 'No hay servicios activos disponibles.'}</p>
        </div>
      )}

      {services.length > 0 && (
        <div className="service-card-grid">
          {services.map((service) => (
            <article className={`service-card${service.activo ? '' : ' service-card--inactive'}`} key={service.id}>
              <div className="service-card__heading">
                <span className="service-card__category">{service.categoria || 'Sin categoría'}</span>
                {isAdmin && <span className={`service-card__state${service.activo ? '' : ' service-card__state--inactive'}`}>{service.activo ? 'Activo' : 'Inactivo'}</span>}
              </div>
              <h2>{service.nombre}</h2>
              {service.descripcion && <p className="service-card__description">{service.descripcion}</p>}
              <div className="service-card__facts">
                <span><Clock3 size={15} aria-hidden="true" /> {service.duracion_minutos} min</span>
                <span className="service-card__price">{formatPrice(service.precio)}</span>
              </div>
              <div className="service-card__meta">
                <span>{service.sesiones} {service.sesiones === 1 ? 'sesión' : 'sesiones'}</span>
                {service.requiere_consentimiento && <span className="service-card__consent"><ShieldCheck size={14} aria-hidden="true" /> Consentimiento</span>}
              </div>
              {isAdmin && (
                <div className="service-card__actions">
                  <button type="button" className="service-card__edit" onClick={() => setServiceForm({ mode: 'edit', service })}>
                    <Pencil size={15} aria-hidden="true" /> Editar
                  </button>
                  <button type="button" className="service-card__delete" disabled={Boolean(busyServiceId)} onClick={() => deleteService(service)}>
                    <Trash2 size={15} aria-hidden="true" /> Eliminar
                  </button>
                  <button type="button" className="service-card__toggle" disabled={Boolean(busyServiceId)} onClick={() => toggleActive(service)}>
                    {service.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {serviceForm && (
        <ServicioForm
          service={serviceForm.mode === 'edit' ? serviceForm.service : null}
          onClose={() => setServiceForm(null)}
          onSaved={handleSaved}
        />
      )}
    </section>
  )
}

export default Servicios