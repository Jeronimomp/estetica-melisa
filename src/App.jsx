import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Eye,
  EyeOff,
  LockKeyhole,
  LogOut,
  Mail,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Header from '@/components/Header'
import { Input } from '@/components/ui/input'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import logo from './assets/logo-melisa.png'
import './App.css'

const roleLabels = {
  administrador: 'Administradora',
  empleado: 'Equipo de atención',
}
const currentYear = new Date().getFullYear()

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(supabaseConfigured)
  const [profileError, setProfileError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const sessionUserId = session?.user?.id
  const profileLoading = Boolean(session && !profile && !profileError)

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setProfile(null)
      setProfileError('')
      setAuthLoading(false)
      setMessage(null)
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setMessage({ type: 'error', text: 'No fue posible recuperar tu sesión. Vuelve a iniciar sesión.' })
      setSession(data.session)
      setProfile(null)
      setProfileError('')
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

    supabase
      .from('usuarios')
      .select('nombre, rol')
      .eq('id', sessionUserId)
      .single()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data || !roleLabels[data.rol]) {
          setProfileError('Tu cuenta no tiene un perfil válido. Solicita al administrador que revise tu acceso.')
          setProfile(null)
          return
        }
        setProfile({ name: data.nombre, role: data.rol })
      })
    return () => {
      active = false
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
          <span className="eyebrow"><Sparkles size={14} aria-hidden="true" /> PORTAL DE EQUIPO</span>
          <h2>Un espacio diseñado<br /><em className="text-dorado-claro">para cuidar tu apariencia</em></h2>
          <p>Ciencia, cosmetología y bienestar en un solo lugar. Una atención cercana y profesional que empieza desde el primer contacto.</p>
        </div>
        <div className="brand-panel__footer"><span>ESTÉTICA · BIENESTAR · CUIDADO</span><span>01 / 01</span></div>
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
  const [pendingAction, setPendingAction] = useState('')
  const createActions = {
    '/citas': 'Agendar una cita',
    '/clientes': 'Agregar un cliente',
    '/servicios': 'Agregar un servicio',
  }
  const navigationItems = [
    { label: 'Citas', path: '/citas', icon: CalendarDays },
    { label: 'Clientes', path: '/clientes', icon: UsersRound },
    { label: 'Servicios', path: '/servicios', icon: BriefcaseBusiness },
    { label: 'Configuración', path: '/configuracion', icon: Settings, iconOnly: true },
  ]

  return (
    <main className="workspace">
      <Header onSignOut={onSignOut} />
      <Routes>
        <Route path="/" element={<Navigate to="/citas" replace />} />
        <Route path="/citas" element={<ModulePage title={`Hola, ${profile.name || 'bienvenida'}.`} description="Tu calendario de citas estará disponible aquí." role={roleLabels[profile.role]} />} />
        <Route path="/clientes" element={<ModulePage title="Clientes" description="Aquí podrás buscar clientes y consultar sus expedientes." role={roleLabels[profile.role]} />} />
        <Route path="/servicios" element={<ModulePage title="Servicios" description="Aquí podrás consultar los servicios de la estética." role={roleLabels[profile.role]} />} />
        <Route path="/configuracion" element={<ModulePage title="Configuración" description={isAdmin ? 'Administra las opciones del espacio de trabajo.' : 'Esta sección está disponible solo para la administradora.'} role={roleLabels[profile.role]} />} />
        <Route path="*" element={<Navigate to="/citas" replace />} />
      </Routes>
      <nav className="bottom-nav" aria-label="Navegación principal">
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
      {createActions[pathname] && (
        <button
          className="floating-action"
          type="button"
          aria-label={createActions[pathname]}
          title={createActions[pathname]}
          onClick={() => setPendingAction(createActions[pathname])}
        >
          <Plus size={25} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
      {pendingAction && (
        <div className="creation-overlay">
          <section className="creation-dialog" role="dialog" aria-modal="true" aria-labelledby="creation-dialog-title">
            <button className="creation-dialog__close" type="button" aria-label="Cerrar" onClick={() => setPendingAction('')}>
              <X size={19} aria-hidden="true" />
            </button>
            <span className="eyebrow text-dorado-oscuro">PRÓXIMAMENTE</span>
            <h2 id="creation-dialog-title">{pendingAction}</h2>
            <p>El formulario estará disponible cuando conectemos este módulo con Supabase.</p>
            <Button className="creation-dialog__confirm" onClick={() => setPendingAction('')}>Entendido</Button>
          </section>
        </div>
      )}
    </main>
  )
}

function ModulePage({ title, description, role }) {
  return (
    <section className="workspace-main" aria-live="polite">
      <span className="eyebrow text-dorado-oscuro">{role}</span>
      <h1>{title}</h1>
      <p className="workspace-intro">{description}</p>
      <p className="role-note"><ShieldCheck size={16} aria-hidden="true" /> Acceso asignado por administración</p>
    </section>
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
