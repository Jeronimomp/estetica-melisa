import { useEffect, useState } from 'react'
import { ChevronRight, PartyPopper, Plus, Search, UsersRound } from 'lucide-react'
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

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('es-MX'))
    .join('') || 'CL'
}

function hasBirthdayToday(birthDate, today = new Date()) {
  if (!birthDate) return false
  const [, month, day] = birthDate.slice(0, 10).split('-').map(Number)
  return month === today.getMonth() + 1 && day === today.getDate()
}

function Clientes({ onAddClient }) {
  const [search, setSearch] = useState('')
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState(supabase ? '' : 'La conexión con Supabase no está configurada.')

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')

      let request = supabase
        .from('clientes')
        .select('id, nombre, telefono, ciudad, fecha_nacimiento')
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

  return (
    <section className="workspace-main clients-page">
      <header className="clients-page__heading">
        <div>
          <span className="eyebrow text-dorado-oscuro">DIRECTORIO</span>
          <h1>Clientes</h1>
          <p className="workspace-intro">Busca y consulta los expedientes de atención.</p>
        </div>
        <div className="clients-page__heading-actions">
          <span className="clients-page__count" aria-live="polite">{clients.length}{clients.length === 10 ? '+' : ''}</span>
          <Button className="clients-page__add" type="button" onClick={onAddClient}>
            <Plus size={17} aria-hidden="true" /> Agregar cliente
          </Button>
        </div>
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
                <span
                  className={`client-avatar${hasBirthdayToday(client.fecha_nacimiento) ? ' client-avatar--birthday' : ''}`}
                  role="img"
                  aria-label={hasBirthdayToday(client.fecha_nacimiento) ? `${client.nombre}, cumple años hoy` : client.nombre}
                >
                  <span aria-hidden="true">{getInitials(client.nombre)}</span>
                  {hasBirthdayToday(client.fecha_nacimiento) && <span className="client-avatar__birthday" aria-hidden="true"><PartyPopper size={12} /></span>}
                </span>
                <span className="client-list__details">
                  <strong>{client.nombre}</strong>
                  <span>{client.telefono || 'Teléfono pendiente'}</span>
                  <span className="client-list__city-mobile">{client.ciudad || 'Sin ciudad'}</span>
                </span>
                <span className="client-list__city">{client.ciudad || 'Sin ciudad'}</span>
                <ChevronRight className="client-list__arrow" size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

    </section>
  )
}

export default Clientes