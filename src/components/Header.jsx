import { LogOut } from 'lucide-react'
import logo from '../assets/logo-melisa.png'
import { Button } from '@/components/ui/button'

function Header({ onSignOut }) {
  return (
    <header className="workspace-header">
      <img
        src={logo}
        alt="Estética Integral Melisa Peralta"
        className="h-16 w-auto"
      />
      <Button variant="outline" className="signout-button" onClick={onSignOut}>
        <LogOut size={16} aria-hidden="true" /> Cerrar sesión
      </Button>
    </header>
  )
}

export default Header