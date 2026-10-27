import { useEffect, useState } from 'react'
import { ChevronRight, Search, Trash2, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'

function getClientError(error) {
  if (error?.code === 'PGRST205') {
    return 'Supabase no encuentra public.clientes. Verifica que la tabla esté creada y expuesta en el esquema public.'
  }
  if (error?.code === '42501' || error?.code === 'PGRST301') {
    return 'Tu cuenta no tiene permiso para consultar clientes.'
  }
  return 'No se pudieron cargar los clientes. Inténtalo de nuevo.'
}

function getDeleteError(error) {
  if (error?.code === '23503') {
    return 'No se puede eliminar porque este cliente tiene citas o historias clínicas relacionadas. El historial se conservó.'
  }
  if (error?.code === '42501' || error?.code === 'PGRST301') {
    return 'Tu cuenta no tiene permiso para eliminar clientes. Ejecuta supabase/clientes_delete_policy.sql en Supabase.'
  }
  return 'No se pudo eliminar el cliente. Inténtalo de nuevo.'
}

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('es-MX'))
    .join('') || 'CL'
}

function Clientes() {
  const [search, setSearch] = useState('')
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState(supabase ? '' : 'La conexión con Supabase no está configurada.')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')

      let request = supabase
        .from('clientes')
        .select('id, nombre, telefono, ciudad')
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .limit(10)

      const term = search.trim()
      if (term) request = request.ilike('nombre', `%${term}%`)

      const { data, error: queryError } = await request
      if (!active) return

      if (queryError) {
        setClients([])
        setError(getClientError(queryError))
      } else {
        setClients(data ?? [])
      }
      setLoading(false)
    }, search.trim() ? 220 : 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [search])

  async function handleDeleteClient() {
    if (!supabase || !pendingDelete || deleting) return

    setDeleting(true)
    setDeleteError('')
    const { data, error: deleteQueryError } = await supabase
      .from('clientes')
      .delete()
      .eq('id', pendingDelete.id)
      .select('id')
      .maybeSingle()

    if (deleteQueryError) {
      setDeleteError(getDeleteError(deleteQueryError))
      setDeleting(false)
      return
    }
    if (!data) {
      setDeleteError('No se pudo confirmar la eliminación. Verifica los permisos de tu cuenta.')
      setDeleting(false)
      return
    }

    setClients((current) => current.filter((client) => client.id !== pendingDelete.id))
    setPendingDelete(null)
    setDeleting(false)
  }

  return (
    <section className="workspace-main clients-page">
      <header className="clients-page__heading">
        <div>
          <span className="eyebrow text-dorado-oscuro">DIRECTORIO</span>
          <h1>Clientes</h1>
          <p className="workspace-intro">Busca y consulta los expedientes de atención.</p>
        </div>
        <span className="clients-page__count" aria-live="polite">{clients.length}{clients.length === 10 ? '+' : ''}</span>
      </header>

      <label className="client-search" htmlFor="client-search-input">
        <Search size={18} aria-hidden="true" />
        <Input
          id="client-search-input"
          type="search"
          placeholder="Buscar por nombre"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoComplete="off"
        />
      </label>

      {error && <p className="client-state client-state--error" role="alert">{error}</p>}
      {loading && <p className="client-state" role="status">Cargando clientes…</p>}
      {!loading && !error && clients.length === 0 && (
        <div className="client-empty">
          <span className="client-empty__icon"><UsersRound size={22} aria-hidden="true" /></span>
          <h2>{search.trim() ? 'No hay coincidencias' : 'Aún no hay clientes'}</h2>
          <p>{search.trim() ? 'Prueba con otro nombre.' : 'Usa el botón + para registrar el primer cliente.'}</p>
        </div>
      )}

      {clients.length > 0 && (
        <ul className="client-list" aria-label="Resultados de clientes">
          {clients.map((client) => (
            <li className="client-list__item" key={client.id}>
              <Link className="client-list__link" to={`/clientes/${client.id}`}>
                <span className="client-avatar" aria-hidden="true">{getInitials(client.nombre)}</span>
                <span className="client-list__details">
                  <strong>{client.nombre}</strong>
                  <span>{client.telefono || 'Teléfono pendiente'}</span>
                  <span className="client-list__city-mobile">{client.ciudad || 'Sin ciudad'}</span>
                </span>
                <span className="client-list__city">{client.ciudad || 'Sin ciudad'}</span>
                <ChevronRight className="client-list__arrow" size={18} aria-hidden="true" />
              </Link>
              <button
                className="client-list__delete"
                type="button"
                aria-label={`Eliminar cliente ${client.nombre}`}
                title="Eliminar cliente"
                onClick={() => {
                  setDeleteError('')
                  setPendingDelete(client)
                }}
              >
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <div className="creation-overlay client-delete-overlay">
          <section className="creation-dialog client-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-client-title" aria-describedby="delete-client-description">
            <span className="eyebrow text-dorado-oscuro">CONFIRMAR ELIMINACIÓN</span>
            <h2 id="delete-client-title">Eliminar cliente</h2>
            <p id="delete-client-description">¿Seguro que desea eliminar al paciente?</p>
            <p className="client-delete-dialog__name">{pendingDelete.nombre}</p>
            <p className="client-delete-dialog__warning">Esta acción no se puede deshacer. Si tiene citas o historias clínicas relacionadas, se conservarán y la base de datos impedirá eliminar el registro.</p>
            {deleteError && <p className="form-message form-message--error" role="alert">{deleteError}</p>}
            <div className="client-delete-dialog__actions">
              <Button variant="outline" type="button" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancelar</Button>
              <Button className="client-delete-dialog__confirm" type="button" onClick={handleDeleteClient} disabled={deleting}>
                <Trash2 size={16} aria-hidden="true" /> {deleting ? 'Eliminando…' : 'Eliminar cliente'}
              </Button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default Clientes