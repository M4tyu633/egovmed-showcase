'use strict';
const { env } = require('../config/env');
const http = require('../lib/http');
const logger = require('../lib/logger');

const cfg = env.egovAi;

const SPECIALTIES = [
  'General Medicine', 'Cardiology', 'Pulmonology', 'Neurology', 'Gastroenterology',
  'Orthopedics', 'Pediatrics', 'OB-GYN', 'Dermatology', 'ENT', 'Ophthalmology',
  'Psychiatry', 'Emergency Medicine', 'Surgery',
];

const SYSTEM_PROMPT = `You are the triage engine for eGovMed, a Philippine public-hospital front door.
Input may be in Tagalog, English, or Taglish. Translate internally as needed.
You are DECISION SUPPORT, not a diagnosis. A nurse confirms every result.
Classify the patient's symptoms and respond with STRICT JSON only, no prose:
{
  "specialty": one of ${JSON.stringify(SPECIALTIES)},
  "urgency": "emergency" | "urgent" | "routine",
  "red_flags": string[],           // concrete danger signs found, [] if none
  "summary_en": string,            // 1-2 sentence English summary for the doctor
  "reasoning": string,             // short rationale
  "recommended_action": string,    // e.g. "Proceed to ER immediately", "Book Cardiology"
  "confidence": number             // 0..1
}
Always include an urgency flag. If any life-threatening sign is present, set urgency "emergency".`;

// eGov AI auth: mint a Bearer token from the team access code (per docs/integrations.md).
let aiTokenCache = null;
const isAiLive = () => cfg.mode === 'live' && !!cfg.accessCode && !!cfg.baseUrl;
async function egovAiToken() {
  if (aiTokenCache && aiTokenCache.expiresAt > Date.now() + 5000) return aiTokenCache.token;
  const res = await http.post(`${cfg.baseUrl}/api/v1/egov/integration/token`, { access_code: cfg.accessCode });
  const token = res && res.access_token;
  if (!token) throw new Error('eGov AI token endpoint returned no access_token');
  aiTokenCache = { token, expiresAt: Date.now() + (res.expires_in_seconds || 28800) * 1000 };
  return token;
}

// The AI endpoints return free text in `data`; pull the JSON object out of it.
function parseJsonFromText(s) {
  if (!s || typeof s !== 'string') return {};
  const t = s.replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  try { return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t); } catch { return {}; }
}

/**
 * Classify free-text symptoms → structured triage result.
 * live: eGov AI /ai_assistant/generate (prompt → free text, parsed to JSON). mock: deterministic rule-based fallback.
 */
async function classifySymptoms({ text, language = 'auto', patientContext = {} }) {
  if (isAiLive()) {
    try {
      const token = await egovAiToken();
      const prompt = `${SYSTEM_PROMPT}\n\nPatient context: ${JSON.stringify(patientContext)}\nInput language: ${language}\nSymptoms: ${text}\n\nReturn ONLY the JSON object described above, no prose.`;
      const res = await http.post(`${cfg.baseUrl}/api/v1/egov/integration/ai_assistant/generate`, {
        prompt, category: cfg.category,
      }, { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 25000 });
      const result = sanitize(parseJsonFromText(res?.data), text); // sanitize() applies the rule-based emergency floor
      // Surface silent degradation so a dead upstream shows up in Vercel logs instead of looking normal.
      if (result.engine === 'rule-based-fallback') {
        logger.warn('eGov AI returned unusable output — silently degraded to rule-based fallback', { integration: 'egovAi', fallback: 'sanitize' });
      }
      return result;
    } catch (err) {
      logger.warn('eGov AI live call failed — using rule-based fallback', { integration: 'egovAi', fallback: 'exception', err: err.message });
    }
  }
  return ruleBasedTriage(text);
}

function sanitize(parsed, text) {
  // Model output is untrusted: it may be null, an array, a string, or an adversarially
  // crafted object (prompt injection via the symptom text). Coerce to a safe object first.
  const p = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const floor = ruleBasedTriage(text);
  const validSpecialty = SPECIALTIES.includes(p.specialty);
  const validUrgency = ['emergency', 'urgent', 'routine'].includes(p.urgency);
  let usedFallback = !validSpecialty || !validUrgency;

  let specialty = validSpecialty ? p.specialty : floor.specialty;
  let urgency = validUrgency ? p.urgency : floor.urgency;
  let redFlags = Array.isArray(p.red_flags) ? p.red_flags.filter((s) => typeof s === 'string') : floor.redFlags;
  let reasoning = typeof p.reasoning === 'string' ? p.reasoning.trim() : '';
  let recommendedAction = typeof p.recommended_action === 'string' && p.recommended_action ? p.recommended_action : null;

  // A structurally valid but empty/default AI answer should not erase an obvious input-based
  // specialty match. Keep General Medicine when the model explains it; otherwise use the
  // deterministic bilingual keyword classifier as the reliable routing fallback.
  if (specialty === 'General Medicine' && floor.specialty !== 'General Medicine' && !reasoning) {
    specialty = floor.specialty;
    recommendedAction = null;
    usedFallback = true;
  }

  // Merge in the floor's red flags unconditionally — not just on the emergency escalation below.
  // A structurally VALID model response with an empty red_flags array (e.g. it answered the
  // urgency/specialty fields correctly but omitted flags) would otherwise silently erase signals
  // the deterministic rules already found, even when urgency doesn't need to be escalated.
  redFlags = Array.from(new Set([...redFlags, ...floor.redFlags]));

  // SAFETY FLOOR: never let the live model under-triage below the deterministic rule check.
  // If the offline rules see an emergency, the result is forced to emergency regardless of
  // what the model returned (malformed JSON, injection, or a genuine miss).
  if (floor.urgency === 'emergency' && urgency !== 'emergency') {
    urgency = 'emergency';
    specialty = 'Emergency Medicine';
    recommendedAction = 'Proceed to ER immediately: seek immediate human medical assessment';
  } else if (floor.urgency === 'urgent' && urgency === 'routine') {
    // Same floor, one tier down: the rules found a non-emergency red flag (e.g. persistent fever,
    // a moderate injury) that the model's 'routine' classification missed or dismissed.
    urgency = 'urgent';
  }

  const confidence = Number.isFinite(p.confidence) ? Math.min(1, Math.max(0, p.confidence)) : 0.6;
  return {
    specialty,
    urgency,
    redFlags,
    summaryEn: typeof p.summary_en === 'string' && p.summary_en ? p.summary_en : text.slice(0, 200),
    reasoning: reasoning || floor.reasoning,
    recommendedAction: recommendedAction || (urgency === 'emergency' ? 'Proceed to ER immediately' : `Book ${specialty}`),
    confidence,
    engine: usedFallback ? 'rule-based-fallback' : 'egov-ai',
  };
}

/** Transparent keyword heuristic. Bilingual (EN/TL). Good enough to demo offline. */
function ruleBasedTriage(text = '') {
  const t = text.toLowerCase();
  const has = (...ks) => ks.some((k) => t.includes(k));

  const emergency = has(
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
  );
  let specialty = 'General Medicine';
  const redFlags = [];

  if (has('chest pain', 'sakit ng dibdib', 'palpitation', 'kabog')) specialty = 'Cardiology';
  else if (has('hindi makahinga', 'ubo', 'cough', 'hika', 'asthma', 'breathing')) specialty = 'Pulmonology';
  else if (has('sakit ng ulo', 'headache', 'dizz', 'hilo', 'seizure', 'numbness', 'manhid')) specialty = 'Neurology';
  else if (has('tiyan', 'abdomen', 'stomach', 'suka', 'vomit', 'diarrhea', 'lbm')) specialty = 'Gastroenterology';
  else if (has('buto', 'bone', 'fracture', 'bali', 'joint', 'kasukasuan')) specialty = 'Orthopedics';
  else if (has('bata', 'child', 'anak', 'infant', 'sanggol')) specialty = 'Pediatrics';
  else if (has('buntis', 'pregnan', 'regla', 'menstru')) specialty = 'OB-GYN';
  else if (has('balat', 'skin', 'rash', 'pantal', 'itch')) specialty = 'Dermatology';
  else if (has('mata', 'eye', 'vision', 'malabo')) specialty = 'Ophthalmology';
  else if (has('malungkot', 'depress', 'anxiety', 'balisa', 'suicidal')) specialty = 'Psychiatry';

  if (has('chest pain', 'sakit ng dibdib', 'heart attack', 'atake sa puso')) redFlags.push('Chest pain / possible cardiac event');
  if (has('hindi makahinga', 'difficulty breathing', 'shortness of breath', 'not breathing', 'hindi humihinga')) redFlags.push('Breathing difficulty');
  if (has('choking', 'nasasamid', 'hindi makalunok')) redFlags.push('Choking / airway obstruction');
  if (has('bleeding', 'dugo', 'hemorrhage', 'dumudugo')) redFlags.push('Active bleeding');
  if (has('nawalan ng malay', 'unconscious', 'unresponsive')) redFlags.push('Loss of consciousness');
  if (has('stroke', 'paralysis', 'paralisado')) redFlags.push('Possible stroke');
  if (has('seizure', 'convulsion', 'kombulsyon')) redFlags.push('Seizure');
  if (has('anaphylaxis', 'allergic reaction', 'namamaga ang lalamunan')) redFlags.push('Possible anaphylaxis');
  if (has('overdose', 'poison', 'lason', 'nalason')) redFlags.push('Poisoning / overdose');
  if (has('labor', 'manganganak', 'nanganganak', 'putok ng panubigan')) redFlags.push('Obstetric emergency (labor)');
  if (has('suicidal')) redFlags.push('Suicidal ideation');

  // Urgent (not emergency) red flags — worth same-day attention but not an ER trip. Distinct
  // wording from the `emergency` keyword set above so these never also trip the emergency branch.
  if (has('high fever', 'persistent fever', 'mataas na lagnat', 'lagnat na hindi bumababa')) redFlags.push('Persistent or high fever');
  if (has('persistent vomiting', 'walang tigil na pagsusuka', 'persistent diarrhea', 'matagal na pagtatae')) redFlags.push('Persistent vomiting or diarrhea (dehydration risk)');
  if (has('deep cut', 'malalim na sugat', 'sprain', 'pilay')) redFlags.push('Wound or injury needing same-day evaluation');
  if (has('swollen and warm', 'namamaga at mainit', 'infected wound', 'nagnanaknak')) redFlags.push('Possible infection (swelling, warmth)');
  if (has('blurred vision', 'malabong paningin')) redFlags.push('Vision change needing prompt evaluation');

  const urgency = emergency ? 'emergency' : redFlags.length ? 'urgent' : 'routine';
  const routedSpecialty = emergency ? 'Emergency Medicine' : specialty;
  const reasonBySpecialty = {
    'General Medicine': 'The symptoms are best suited to an initial General Medicine assessment.',
    Cardiology: 'The symptoms involve the heart or circulation.',
    Pulmonology: 'The symptoms involve breathing or the lungs.',
    Neurology: 'The symptoms involve headaches, dizziness, or the nervous system.',
    Gastroenterology: 'The symptoms involve the abdomen or digestive system.',
    Orthopedics: 'The symptoms involve bones or joints.',
    Pediatrics: 'The symptoms concern a child or infant.',
    'OB-GYN': 'The symptoms involve pregnancy or reproductive health.',
    Dermatology: 'The symptoms involve the skin, irritation, or a rash.',
    Ophthalmology: 'The symptoms involve the eyes or vision.',
    Psychiatry: 'The symptoms involve mood, anxiety, or mental health.',
    'Emergency Medicine': 'The symptoms include a sign that needs immediate emergency assessment.',
  };
  return {
    specialty: routedSpecialty,
    urgency,
    redFlags,
    summaryEn: text.slice(0, 200),
    reasoning: reasonBySpecialty[routedSpecialty],
    recommendedAction: urgency === 'emergency' ? 'Proceed to ER immediately' : `Book ${specialty}`,
    confidence: 0.4,
    engine: 'rule-based-fallback',
  };
}

/** Summarize a patient's history for the doctor (used at the visit step). */
async function summarizeHistory({ records = [], triage = [] }) {
  if (isAiLive()) {
    try {
      const token = await egovAiToken();
      // eGovAI expects natural-language prompts, not raw JSON (rejects with 422). Build a compact
      // human-readable brief with only titles/dates/facility/summary — NO raw PHI values.
      const labLines = records.filter((r) => r.type === 'lab').slice(-8).map((r) => {
        const date = r.createdAt ? String(r.createdAt).slice(0, 10) : 'unknown date';
        const src = r.sourceFacility || 'unknown facility';
        const note = r.summary ? `: ${String(r.summary).slice(0, 160)}` : '';
        return `- ${r.title} at ${src} on ${date}${note}`;
      });
      const triageLines = triage.slice(-5).map((t) => {
        const when = t.createdAt ? String(t.createdAt).slice(0, 10) : 'recent';
        return `- ${when}: routed to ${t.specialty || 'General Medicine'} (${t.urgency || 'routine'})`;
      });
      const prompt = [
        'Summarize this Filipino patient\'s medical history for a clinician in 4-6 concise English bullet points.',
        'Note trends, risk flags, and follow-up items. Do not invent data.',
        '',
        labLines.length ? `Labs on file (${records.filter((r) => r.type === 'lab').length}):` : 'No labs on file.',
        ...labLines,
        '',
        triageLines.length ? `Recent triage results (${triage.length}):` : 'No prior triage.',
        ...triageLines,
      ].join('\n');
      const res = await http.post(`${cfg.baseUrl}/api/v1/egov/integration/ai_assistant/generate`, {
        prompt, category: cfg.category,
      }, { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 20000 });
      const text = res && res.data;
      // eGovAI's safety filter refuses medical prompts with variants of "I cannot provide medical…"
      // Detect those and fall back to the clinician-authored summaries instead of surfacing the refusal.
      const refused = typeof text === 'string' && /^(i\s*(cannot|can'?t|am\s+not\s+able)|as\s+an\s+ai)|consult\s+(a|your)\s+(qualified\s+)?(medical|health)/i.test(text.trim());
      if (typeof text === 'string' && text.trim() && !refused) return text;
      if (refused) logger.info('eGovAI declined medical summary — using clinician-authored fallback');
    } catch (err) {
      logger.warn('history summary live call failed', { err: err.message });
    }
  }
  return fallbackSummary(records, triage);
}

/**
 * Deterministic, non-AI history brief that leans on each record's clinician-authored `summary`
 * field. Used when eGovAI is unavailable OR refuses the prompt (its safety filter declines
 * medical summarization). Better than a raw record count — it surfaces the actual clinical notes.
 */
function fallbackSummary(records, triage) {
  const labs = records.filter((r) => r.type === 'lab');
  const bullets = [];

  // Per-lab clinical notes (up to 5 most recent). Uses each record's own summary field which
  // was written by the source facility's clinician when the lab was created.
  const sortedLabs = labs.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  sortedLabs.slice(0, 5).forEach((r) => {
    const when = r.createdAt ? String(r.createdAt).slice(0, 10) : '';
    const note = r.summary ? `: ${r.summary}` : '';
    bullets.push(`${r.title} (${r.sourceFacility}${when ? ', ' + when : ''})${note}`);
  });
  if (labs.length > 5) bullets.push(`…and ${labs.length - 5} older lab${labs.length - 5 === 1 ? '' : 's'} on file.`);

  // Triage: latest specialty/urgency + a note if the trend keeps hitting the same specialty
  if (triage.length) {
    const last = triage[triage.length - 1];
    const specialties = triage.map((t) => t.specialty).filter(Boolean);
    const mostCommon = specialties.reduce((acc, s) => (acc[s] = (acc[s] || 0) + 1, acc), {});
    const [topSpec, topCount] = Object.entries(mostCommon).sort((a, b) => b[1] - a[1])[0] || [];
    bullets.push(`Latest triage on ${String(last.createdAt || '').slice(0, 10)}: ${last.specialty || 'General Medicine'} / ${last.urgency || 'routine'}.`);
    if (topCount >= 3 && topSpec) bullets.push(`Recurring routing to ${topSpec} (${topCount} of ${triage.length} triage visits), worth a focused follow-up.`);
  } else {
    bullets.push('No prior triage.');
  }

  if (!bullets.length) return 'No records on file.';
  return bullets.join('\n• ');
}

module.exports = { classifySymptoms, summarizeHistory, SPECIALTIES };
