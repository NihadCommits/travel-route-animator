import { de } from './i18n/de';

export function App() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeContent: 'center',
        gap: 8,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: '#16181d',
        color: '#e6e8ee',
      }}
    >
      <h1 style={{ margin: 0 }}>{de.app.title}</h1>
      <p style={{ margin: 0, color: '#9aa1b2' }}>{de.app.placeholder}</p>
    </main>
  );
}
