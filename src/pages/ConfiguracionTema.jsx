import { Check, LoaderCircle, Palette } from 'lucide-react'
import { APP_THEMES } from '@/lib/appThemes'
import { supabase } from '@/lib/supabase'

function getUpdatedAt() {
  return new Date().toISOString()
}

function ConfiguracionTema({ isAdmin, theme, themeSettingsAvailable, onThemeChange }) {
  async function selectTheme(option) {
    if (!isAdmin || !themeSettingsAvailable || !supabase || option.id === theme.id) return

    onThemeChange({ ...theme, saving: true, error: '', notice: '' })
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('No se pudo verificar la sesión. Inicia sesión de nuevo.')

      const { data, error } = await supabase.from('configuracion_app')
        .update({ valor: option.id, actualizado_por: user.id, updated_at: getUpdatedAt() })
        .eq('clave', 'tema_visual')
        .select('clave')
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('No se pudo guardar el tema. Ejecuta supabase/app_theme_settings.sql en Supabase y verifica tu rol administrador.')
      onThemeChange({ ...option, saving: false, error: '', notice: `Tema ${option.nombre} aplicado para el equipo.` })
    } catch (saveError) {
      onThemeChange({ ...theme, saving: false, error: saveError?.code === '42501' || saveError?.code === 'PGRST301'
        ? 'Solo un administrador puede cambiar el tema.'
        : saveError?.message || 'No se pudo guardar el tema. Revisa la migración y vuelve a intentar.', notice: '' })
    }
  }

  if (!isAdmin) {
    return <section className="workspace-main theme-settings-page"><p className="client-state client-state--error" role="alert">Solo una persona administradora puede cambiar el tema.</p></section>
  }

  return (
    <section className="workspace-main theme-settings-page">
      <header className="theme-settings-page__heading">
        <span className="eyebrow text-dorado-oscuro">PREFERENCIAS</span>
        <h1>Configuración</h1>
        <p>Elige el color principal de la aplicación para todo el equipo. Los fondos blancos y los colores de estado se conservan.</p>
      </header>
      <section className="theme-settings" aria-labelledby="theme-settings-title">
        <h2 id="theme-settings-title"><Palette size={18} aria-hidden="true" /> Tema de color</h2>
        <div className="theme-settings__options" role="radiogroup" aria-label="Temas de color">
          {APP_THEMES.map((option) => {
            const selected = theme.id === option.id
            return (
              <button
                className={`theme-option${selected ? ' theme-option--selected' : ''}`}
                type="button"
                role="radio"
                aria-checked={selected}
                key={option.id}
                disabled={!themeSettingsAvailable || theme.saving}
                onClick={() => selectTheme(option)}
              >
                <span className="theme-option__swatch" style={{ backgroundColor: option.color }} aria-hidden="true" />
                <span className="theme-option__details"><span>{option.nombre}</span><small>{option.color}</small></span>
                {selected && (theme.saving ? <LoaderCircle className="theme-option__spinner" size={17} aria-label="Guardando tema" /> : <Check size={17} aria-label="Tema seleccionado" />)}
              </button>
            )
          })}
        </div>
        {!themeSettingsAvailable && <p className="theme-settings__message" role="status">Ejecuta supabase/app_theme_settings.sql en Supabase para habilitar temas compartidos.</p>}
        {theme.error && <p className="form-message form-message--error" role="alert">{theme.error}</p>}
        {theme.notice && <p className="form-message form-message--success" role="status">{theme.notice}</p>}
      </section>
    </section>
  )
}

export default ConfiguracionTema