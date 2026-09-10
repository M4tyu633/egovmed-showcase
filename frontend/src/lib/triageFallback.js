const ROUTES = [
  { specialty: 'Cardiology', keywords: ['palpitation', 'kabog'], reason: { en: 'Heartbeat symptoms are commonly assessed by heart and circulation care.', tl: 'Karaniwang sinusuri ng heart and circulation care ang sintomas sa tibok ng puso.' } },
  { specialty: 'Pulmonology', keywords: ['ubo', 'cough', 'hika', 'asthma', 'breathing'], reason: { en: 'Breathing and lung symptoms are commonly assessed by Pulmonology.', tl: 'Karaniwang sinusuri ng Pulmonology ang sintomas sa paghinga at baga.' } },
  { specialty: 'Neurology', keywords: ['sakit ng ulo', 'headache', 'dizz', 'hilo', 'numbness', 'manhid'], reason: { en: 'Headache, dizziness, or nerve symptoms are commonly assessed by Neurology.', tl: 'Karaniwang sinusuri ng Neurology ang sakit ng ulo, hilo, o sintomas sa nerves.' } },
  { specialty: 'Gastroenterology', keywords: ['tiyan', 'abdomen', 'stomach', 'suka', 'vomit', 'diarrhea', 'lbm'], reason: { en: 'Digestive and abdominal symptoms are commonly assessed by Gastroenterology.', tl: 'Karaniwang sinusuri ng Gastroenterology ang sintomas sa tiyan at digestion.' } },
  { specialty: 'Orthopedics', keywords: ['buto', 'bone', 'fracture', 'bali', 'joint', 'kasukasuan'], reason: { en: 'Bone and joint symptoms are commonly assessed by Orthopedics.', tl: 'Karaniwang sinusuri ng Orthopedics ang sintomas sa buto at kasukasuan.' } },
  { specialty: 'Pediatrics', keywords: ['bata', 'child', 'anak', 'infant', 'sanggol'], reason: { en: 'Symptoms involving a child are commonly assessed by Pediatrics.', tl: 'Karaniwang sinusuri ng Pediatrics ang mga sintomas ng bata.' } },
  { specialty: 'OB-GYN', keywords: ['buntis', 'pregnan', 'regla', 'menstru'], reason: { en: 'Pregnancy and reproductive-health symptoms are commonly assessed by OB-GYN.', tl: 'Karaniwang sinusuri ng OB-GYN ang sintomas sa pagbubuntis at reproductive health.' } },
  { specialty: 'Dermatology', keywords: ['balat', 'skin', 'rash', 'pantal', 'itch'], reason: { en: 'Skin irritation and rashes are commonly assessed by Dermatology.', tl: 'Karaniwang sinusuri ng Dermatology ang pangangati at pantal sa balat.' } },
  { specialty: 'Ophthalmology', keywords: ['mata', 'eye', 'vision', 'malabo'], reason: { en: 'Eye and vision symptoms are commonly assessed by Ophthalmology.', tl: 'Karaniwang sinusuri ng Ophthalmology ang sintomas sa mata at paningin.' } },
  { specialty: 'Psychiatry', keywords: ['malungkot', 'depress', 'anxiety', 'balisa'], reason: { en: 'Mood and anxiety concerns are commonly assessed by mental-health care.', tl: 'Karaniwang sinusuri ng mental-health care ang matinding lungkot at pagkabalisa.' } },
];

// Kept in sync with the `emergency` keyword set in backend/src/integrations/egovAi.js's
// ruleBasedTriage() — this is the offline safety floor when the backend is unreachable, so a term
// missing here (but present there) means an emergency silently downgrades to 'routine' in exactly
// the degraded case the floor exists to protect. If you change the backend list, mirror it here.
const EMERGENCY_TERMS = [
  'chest pain', 'sakit ng dibdib', 'heart attack', 'atake sa puso',
  'hindi makahinga', 'difficulty breathing', 'shortness of breath', 'not breathing', 'hindi humihinga',
  'choking', 'nasasamid', 'hindi makalunok',
  'unconscious', 'nawalan ng malay', 'unresponsive', 'blue lips', 'nangingitim',
  'seizure', 'convulsion', 'kombulsyon', 'stroke', 'paralysis', 'paralisado',
  'bleeding', 'dugo', 'hemorrhage', 'dumudugo',
  'anaphylaxis', 'allergic reaction', 'namamaga ang lalamunan',
  'overdose', 'poison', 'lason', 'nalason',
  'labor', 'manganganak', 'nanganganak', 'putok ng panubigan',
  'suicidal', 'severe', 'grabe', 'matindi',
];

export function fallbackTriage(input, lang = 'en') {
  const text = String(input || '').toLowerCase();
  const emergency = EMERGENCY_TERMS.some((term) => text.includes(term));
  const route = ROUTES.find((candidate) => candidate.keywords.some((term) => text.includes(term)));
  const specialty = emergency ? 'Emergency Medicine' : route?.specialty || 'General Medicine';
  const reasoning = route?.reason?.[lang] || (lang === 'tl'
    ? 'Mas ligtas na magsimula sa General Medicine para sa paunang pagsusuri.'
    : 'General Medicine is the safest starting point for an initial assessment.');

  return {
    inputSymptoms: input,
    specialty,
    urgency: emergency ? 'emergency' : 'routine',
    redFlags: emergency ? [lang === 'tl' ? 'May sintomas na kailangang matingnan agad' : 'A symptom needs immediate assessment'] : [],
    reasoning,
    recommendedAction: emergency ? 'Proceed to ER immediately' : `Book ${specialty}`,
    confidence: 0.4,
    engine: 'on-device-fallback',
  };
}
