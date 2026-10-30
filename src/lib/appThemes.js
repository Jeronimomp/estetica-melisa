export const DEFAULT_APP_THEME = 'verde'

export const APP_THEMES = [
  {
    id: 'verde',
    nombre: 'Verde actual',
    color: '#708238',
    hover: '#58692d',
    deep: '#4a5e2a',
    soft: '#f0f2e7',
    border: '#dbe0d1',
    ring: '#8d9b61',
  },
  {
    id: 'grafito',
    nombre: 'Grafito',
    color: '#484750',
    hover: '#38373f',
    deep: '#333238',
    soft: '#f0eff2',
    border: '#d5d3db',
    ring: '#777580',
  },
  {
    id: 'oliva',
    nombre: 'Oliva',
    color: '#696d47',
    hover: '#565a39',
    deep: '#474a30',
    soft: '#f2f2e9',
    border: '#dcddca',
    ring: '#858a60',
  },
  {
    id: 'malva',
    nombre: 'Malva',
    color: '#a46188',
    hover: '#884d70',
    deep: '#713f5e',
    soft: '#f6edf2',
    border: '#e5d1dd',
    ring: '#bd83a5',
  },
]

export function isAppTheme(value) {
  return APP_THEMES.some((theme) => theme.id === value)
}