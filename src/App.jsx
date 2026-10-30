import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LogOut,
  Mail,
  Plus,
  Settings,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Header from '@/components/Header'
import { Input } from '@/components/ui/input'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import logo from './assets/logo-melisa.png'
import ClienteForm from '@/components/ClienteForm'
import ClienteDetalle from '@/pages/ClienteDetalle'
import Clientes from '@/pages/Clientes'
import Citas from '@/pages/Citas'
import Servicios from '@/pages/Servicios'
import ConfiguracionTema from '@/pages/ConfiguracionTema'
import { DEFAULT_APP_THEME, isAppTheme } from '@/lib/appThemes'
import './App.css'

const roleLabels = {
  administrador: 'Administradora',
  empleado: 'Equipo de atención',
}
const currentYear = new Date().getFullYear()

function BirthdayNotifications() {
  const panelRef = useRef(null)
  const [birthdays, setBirthdays] = useState([])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!supabase) return undefined
    let active = true

    async function loadBirthdays() {
      const { data, error: queryError } = await supabase
        .from('clientes')
        .select('id, nombre, fecha_nacimiento')
        .eq('activo', true)
        .not('fecha_nacimiento', 'is', null)
        .order('nombre', { ascending: true })

      if (!active) return
      if (queryError) {
        setError('No se pudieron cargar los cumpleaños de hoy.')
      } else {
        const now = new Date()
        setBirthdays((data ?? []).filter((client) => {
          const [, month, day] = client.fecha_nacimiento.slice(0, 10).split('-').map(Number)
          return month === now.getMonth() + 1 && day === now.getDate()
        }))
      }
      setLoading(false)
    }

    loadBirthdays()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (!panelRef.current?.contains(event.target)) setOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="birthday-notifications" ref={panelRef}>
      <button
        className="birthday-notifications__trigger"
        type="button"
        aria-label={`Cumpleaños de hoy: ${birthdays.length}`}
        aria-expanded={open}
        aria-controls="birthday-notifications-panel"
        title={`${birthdays.length} cumpleaños hoy`}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={20} aria-hidden="true" />
        <span className="birthday-notifications__count">{birthdays.length}</span>
      </button>
      {open && (
        <section className="birthday-notifications__panel" id="birthday-notifications-panel" aria-label="Cumpleaños de hoy">
          <header><h2>Cumpleaños de hoy</h2><span>{birthdays.length}</span></header>
          {loading && <p role="status">Cargando cumpleaños…</p>}
          {error && <p className="birthday-notifications__error" role="alert">{error}</p>}
          {!loading && !error && birthdays.length === 0 && <p className="birthday-notifications__empty">No hay cumpleaños hoy.</p>}
          {!loading && birthdays.length > 0 && (
            <ul>
              {birthdays.map((client) => (
                <li key={client.id}>
                  <Link to={`/clientes/${client.id}`} onClick={() => setOpen(false)}>
                    <span className="birthday-notifications__avatar" aria-hidden="true">{client.nombre.trim().slice(0, 1).toLocaleUpperCase('es-MX')}</span>
                    <span>{client.nombre}</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
const [authLoading, setAuthLoading] = useState(Boolean(supabaseConfigured))
  const [profileError, setProfileError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const sessionUserIdRef = useRef(null)
  const sessionUserId = session?.user?.id
  const profileLoading = Boolean(session && !profile && !profileError)

  useEffect(() => {
  if (!supabase) return undefined

  let active = true

  // Keep the loaded profile during token refreshes; only identity changes require a reload.
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
    if (!active) return
    const nextUserId = nextSession?.user?.id ?? null
    const userChanged = sessionUserIdRef.current !== nextUserId
    sessionUserIdRef.current = nextUserId
    setSession(nextSession)
    if (userChanged) {
      setProfile(null)
      setProfileError('')
    }
    setAuthLoading(false)
    setMessage(null)
  })

  // Restore the persisted session on initial load, including after a browser app switch.
  supabase.auth.getSession().then(({ data, error }) => {
    if (!active) return
    if (error) setMessage({ type: 'error', text: 'No fue posible recuperar tu sesión. Vuelve a iniciar sesión.' })
    const restoredSession = data.session
    const restoredUserId = restoredSession?.user?.id ?? null
    const userChanged = sessionUserIdRef.current !== restoredUserId
    sessionUserIdRef.current = restoredUserId
    setSession(restoredSession)
    if (userChanged) {
      setProfile(null)
      setProfileError('')
    }
    setAuthLoading(false)
  }).catch(() => {
    if (!active) return
    setMessage({ type: 'error', text: 'No fue posible recuperar tu sesión. Vuelve a iniciar sesión.' })
    setAuthLoading(false)
  })

  return () => {
    active = false
    subscription.unsubscribe()
  }
}, [])

 useEffect(() => {
  if (!supabase || !sessionUserId) return undefined

  let active = true

  // Timeout de seguridad: si en 5 segundos no llega el perfil, muestra error
  const timeout = setTimeout(() => {
    if (active) {
      setProfileError('No se pudo cargar tu perfil. Verifica tu conexión e intenta de nuevo.')
    }
  }, 5000)

  supabase
    .from('usuarios')
    .select('nombre, rol')
    .eq('id', sessionUserId)
    .single()
    .then(({ data, error }) => {
      if (!active) return
      clearTimeout(timeout)
      if (error || !data || !roleLabels[data.rol]) {
        setProfileError('Tu cuenta no tiene un perfil válido. Solicita al administrador que revise tu acceso.')
        setProfile(null)
        return
      }
      setProfile({ name: data.nombre, role: data.rol })
    })

  return () => {
    active = false
    clearTimeout(timeout)
  }
}, [sessionUserId])

  async function handleSignIn(event) {
    event.preventDefault()
    if (!supabase) return
    setSubmitting(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage({ type: 'error', text: getAuthErrorMessage(error.message) })
    setSubmitting(false)
  }

  async function handlePasswordReset() {
    if (!supabase || !email) {
      setMessage({ type: 'error', text: 'Escribe tu correo para enviarte el enlace de recuperación.' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    setMessage(error
      ? { type: 'error', text: 'No se pudo enviar el enlace. Verifica el correo e inténtalo de nuevo.' }
      : { type: 'success', text: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' })
    setSubmitting(false)
  }

  async function handleSignOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setMessage({ type: 'error', text: 'No fue posible cerrar la sesión. Inténtalo de nuevo.' })
  }

  if (authLoading || (session && profileLoading)) {
    return <main className="loading-screen" aria-live="polite">Cargando tu espacio de trabajo…</main>
  }

  if (session && profile) return <Workspace profile={profile} onSignOut={handleSignOut} />
  if (session && profileError) return <AccessError message={profileError} onSignOut={handleSignOut} />

  return (
    <main className="auth-layout">
      <section className="brand-panel" aria-label="Estética Integral Melisa Peralta">
        <img className="brand-panel__photo" src="https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1800&q=85" alt="" />
        <div className="brand-panel__shade" />
        <img className="brand-panel__logo" src={logo} alt="Estética Integral Melisa Peralta" />
        <div className="brand-panel__identity">
          <h1>ESTÉTICA INTEGRAL</h1>
          <p>MELISA PERALTA</p>
        </div>
        <div className="brand-message">
          <h2>Un espacio diseñado<br /><em className="text-dorado-claro">para cuidar tu apariencia y consentirte</em></h2>
        </div>
      </section>

      <section className="auth-panel bg-crema">
        <div className="auth-panel__topline">
          <span className="secure-label"><ShieldCheck size={16} aria-hidden="true" /> ACCESO SEGURO</span>
          <span className="auth-panel__location">Melisa Peralta</span>
        </div>
        <div className="auth-content">
          <div className="auth-heading">
            <span className="eyebrow auth-heading__eyebrow text-dorado-oscuro">BIENVENIDA DE NUEVO</span>
            <h2>Inicia sesión</h2>
            <p>Ingresa con la cuenta que te asignó la administración.</p>
          </div>

          <form className="login-form" onSubmit={handleSignIn}>
            <label className="field-label" htmlFor="email">Correo electrónico</label>
            <div className="input-wrap">
              <Mail size={17} aria-hidden="true" />
              <Input id="email" type="email" autoComplete="username" placeholder="nombre@correo.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="password-label-row">
              <label className="field-label" htmlFor="password">Contraseña</label>
              <button className="text-button" type="button" onClick={handlePasswordReset} disabled={!supabaseConfigured || submitting}>¿La olvidaste?</button>
            </div>
            <div className="input-wrap">
              <LockKeyhole size={17} aria-hidden="true" />
              <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Tu contraseña" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button className="visibility-button" type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword((visible) => !visible)}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            {message && <p className={`form-message form-message--${message.type}`} role="status">{message.text}</p>}
            {!supabaseConfigured && (
              <p className="config-notice" role="status">Conexión pendiente. Configura las variables de Supabase en <code>.env.local</code> para habilitar el acceso.</p>
            )}
            <Button className="login-button" type="submit" disabled={!supabaseConfigured || submitting}>
              <span>{submitting ? 'Conectando…' : 'Entrar a mi espacio'}</span>
              {!submitting && <ArrowRight size={17} aria-hidden="true" />}
            </Button>
          </form>

          <div className="auth-divider"><span>USO EXCLUSIVO DEL EQUIPO</span></div>
          <p className="privacy-note">Tus datos de acceso son personales. No los compartas con otras personas.</p>
        </div>
        <footer className="auth-footer">
          <span>© {currentYear} Estética Integral Melisa Peralta</span>
          <span>Privacidad y cuidado</span>
        </footer>
      </section>
    </main>
  )
}

function Workspace({ profile, onSignOut }) {
  const isAdmin = profile.role === 'administrador'
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [showQuickClientForm, setShowQuickClientForm] = useState(false)
  const [theme, setTheme] = useState({ id: DEFAULT_APP_THEME, saving: false, error: '', notice: '' })
  const [themeSettingsAvailable, setThemeSettingsAvailable] = useState(true)
  const createActionLabel = pathname === '/clientes'
    ? 'Agregar un cliente'
    : ''
  const navigationItems = [
    { label: 'Citas', path: '/citas', icon: CalendarDays },
    { label: 'Clientes', path: '/clientes', icon: UsersRound },
    { label: 'Servicios', path: '/servicios', icon: BriefcaseBusiness },
    ...(isAdmin ? [{ label: 'Configuración', path: '/configuracion', icon: Settings, iconOnly: true }] : []),
  ]
  const activeNavigationIndex = navigationItems.findIndex(({ path }) => (
    pathname === path || pathname.startsWith(`${path}/`)
  ))
  const touchStartRef = useRef(null)

  function handleNavigationTouchStart(event) {
    if (!window.matchMedia('(max-width: 1024px)').matches) return
    const target = event.target
    if (!(target instanceof Element) || target.closest(
      'input, textarea, select, [role="slider"], [contenteditable="true"], [data-swipe-ignore], [role="dialog"], [aria-modal="true"], .bottom-nav',
    )) {
      touchStartRef.current = null
      return
    }

    const touch = event.touches[0]
    if (!touch || touch.clientX < 24 || touch.clientX > window.innerWidth - 24) {
      touchStartRef.current = null
      return
    }
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleNavigationTouchEnd(event) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || activeNavigationIndex < 0) return

    const touch = event.changedTouches[0]
    if (!touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    const swipeThreshold = Math.max(42, Math.min(56, window.innerWidth * 0.12))
    if (Math.abs(deltaX) < swipeThreshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return

    const nextIndex = activeNavigationIndex + (deltaX < 0 ? 1 : -1)
    const nextItem = navigationItems[nextIndex]
    if (nextItem) navigate(nextItem.path)
  }

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    supabase.from('configuracion_app').select('valor').eq('clave', 'tema_visual').maybeSingle().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setThemeSettingsAvailable(false)
        return
      }
      if (isAppTheme(data?.valor)) setTheme((current) => ({ ...current, id: data.valor }))
    }).catch(() => {
      if (active) setThemeSettingsAvailable(false)
    })

    const channel = supabase.channel('configuracion-tema-global')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'configuracion_app', filter: 'clave=eq.tema_visual' }, ({ new: row }) => {
        if (isAppTheme(row?.valor)) setTheme((current) => ({ ...current, id: row.valor }))
      })
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.appTheme = theme.id
  }, [theme.id])

  return (
    <main
      className="workspace"
      onTouchStart={handleNavigationTouchStart}
      onTouchEnd={handleNavigationTouchEnd}
      onTouchCancel={() => { touchStartRef.current = null }}
    >
      <BirthdayNotifications />
      <aside className="workspace-sidebar">
        <img className="workspace-sidebar__logo" src={logo} alt="Estética Integral Melisa Peralta" />
        <nav className="workspace-sidebar__nav" aria-label="Navegación principal">
          {navigationItems.map(({ label, path, icon: Icon }) => (
            <NavLink
              className={({ isActive }) => `workspace-sidebar__link${isActive ? ' workspace-sidebar__link--active' : ''}`}
              key={label}
              to={path}
              aria-current={undefined}
            >
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <Button className="workspace-sidebar__signout" variant="outline" onClick={onSignOut}>
          <LogOut size={17} aria-hidden="true" /> Cerrar sesión
        </Button>
      </aside>
      <Header onSignOut={onSignOut} />
      <Routes>
        <Route path="/" element={<Navigate to="/citas" replace />} />
        <Route path="/citas" element={<Citas />} />
        <Route path="/clientes" element={<Clientes onAddClient={() => setShowQuickClientForm(true)} />} />
        <Route path="/clientes/:id" element={<ClienteDetalle isAdmin={isAdmin} />} />
        <Route path="/servicios" element={<Servicios isAdmin={isAdmin} />} />
        <Route path="/configuracion" element={<ConfiguracionTema isAdmin={isAdmin} theme={theme} themeSettingsAvailable={themeSettingsAvailable} onThemeChange={setTheme} />} />
        <Route path="*" element={<Navigate to="/citas" replace />} />
      </Routes>
      <nav className={`bottom-nav${isAdmin ? '' : ' bottom-nav--employee'}`} aria-label="Navegación principal">
        {navigationItems.map(({ label, path, icon: Icon, iconOnly }) => (
          <NavLink
            className={({ isActive }) => `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}${iconOnly ? ' bottom-nav__item--icon-only' : ''}`}
            key={label}
            to={path}
            aria-label={label}
            title={label}
          >
            <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
            {!iconOnly && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
      {createActionLabel && (
        <button
          className="floating-action"
          type="button"
          aria-label={createActionLabel}
          title={createActionLabel}
          onClick={() => setShowQuickClientForm(true)}
        >
          <Plus size={25} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
      {showQuickClientForm && (
        <ClienteForm
          quick
          onClose={() => setShowQuickClientForm(false)}
          onSaved={(client) => {
            setShowQuickClientForm(false)
            navigate(`/clientes/${client.id}`)
          }}
        />
      )}
    </main>
  )
}

function AccessError({ message, onSignOut }) {
  return (
    <main className="access-error">
      <div className="brand-mark">MP</div>
      <ShieldCheck className="access-error__icon" size={28} aria-hidden="true" />
      <h1>No pudimos validar tu perfil</h1>
      <p>{message}</p>
      <Button variant="outline" onClick={onSignOut}><LogOut size={16} /> Cerrar sesión</Button>
    </main>
  )
}

function getAuthErrorMessage(error) {
  if (error.toLowerCase().includes('invalid login credentials')) {
    return 'El correo o la contraseña no coinciden. Revísalos e inténtalo de nuevo.'
  }
  if (error.toLowerCase().includes('email not confirmed')) {
    return 'Confirma tu correo electrónico antes de iniciar sesión.'
  }
  if (error.toLowerCase().includes('too many requests')) {
    return 'Hubo demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
  }
  return 'No fue posible iniciar sesión. Inténtalo de nuevo más tarde.'
}

export default App
