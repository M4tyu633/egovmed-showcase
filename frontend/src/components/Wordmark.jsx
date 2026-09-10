import logo from '../assets/logo.png';

/**
 * The eGovMed wordmark.
 *
 * Previously this was CSS-styled text (`.wm` / `.med`) that approximated the logo with font
 * weights and colours. That drifts from the real asset — it cannot reproduce the multi-colour
 * ring in the O — so both places now render the actual file.
 *
 * Sized by height with `width: auto` so the 859x192 source keeps its aspect ratio at any scale.
 */
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
