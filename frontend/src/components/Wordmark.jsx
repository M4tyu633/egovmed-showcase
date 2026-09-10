import logo from '../assets/logo.png';

/* Render the logo asset at its original aspect ratio. */
export default function Wordmark({ height = 20, className = '' }) {
  return (
    <img
      src={logo}
      alt="eGovMed"
      className={className}
      style={{ height, width: 'auto', display: 'block', flexShrink: 0 }}
    />
  );
}
