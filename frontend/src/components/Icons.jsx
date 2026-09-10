// Icons sourced from reicon-react (https://reicon.dev). Re-exported under stable semantic
// names so screens don't depend on the upstream catalog naming. Outline weight, currentColor,
// size/strokeWidth overridable per the reicon IconProps API.
export {
  ChevronLeft,
  ChevronRight,
  Heart,
  HeartPulse,
  Bell,
  Microphone as Mic,
  Check,
  CheckCircle,
  Shield,
  ShieldCheck,
  ShieldTick,
  Fingerprint,
  Settings as Gear,
  DocumentText as FileText,
  DocumentUpload as FileUp,
  FileCheck,
  Card,
  Money,
  Flag,
  ChatRoundDots as Chat,
  Home,
  Profile as User,
  AlertTriangle as Warning,
  Clock,
  Camera,
  FaceScanCircle,
  Add as Plus,
  Call as Phone,
  Location as Pin,
  Hospital,
  Trash,
} from 'reicon-react';

// reicon has no plain filled "stop" glyph — render one (mic recording state).
export function Stop({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  );
}

export function Dot({ color = 'currentColor', size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block', flex: 'none' }} />;
}
