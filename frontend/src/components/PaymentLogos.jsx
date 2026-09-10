import { Card } from './Icons.jsx';
import gcashLogo from '../assets/payment-gcash.png';
import mayaLogo from '../assets/payment-maya.png';

export function GCashLogo({ size = 38 }) {
  return <img src={gcashLogo} alt="" width={size} height={size} style={{ borderRadius: 10, display: 'block', flex: 'none' }} />;
}

export function MayaLogo({ size = 38 }) {
  return <img src={mayaLogo} alt="" width={size} height={size} style={{ borderRadius: 10, display: 'block', flex: 'none' }} />;
}

export function CardLogo({ size = 38 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 10, background: '#F1EEFB', color: '#5B3FD6', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <Card size={size * 0.55} />
    </span>
  );
}

const LOGOS = { GC: GCashLogo, MB: MayaLogo, CT: CardLogo };

// Renders the right badge for a channel abbreviation (GC/MB/CT).
export default function PaymentLogo({ abbr, size = 38 }) {
  const Logo = LOGOS[abbr] || CardLogo;
  return <Logo size={size} />;
}
