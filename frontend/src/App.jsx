import { useCallback, useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { DICT, CONST, CHANNELS, HOSPITALS, randomSlots } from './i18n/dict.js';
import { api, getToken, setToken, demoExchangeCode } from './lib/api.js';
import { fallbackTriage } from './lib/triageFallback.js';
import { runEverifyLivenessCapture, usesEverifySdk, EVERIFY_CANCELLED } from './lib/everifySdk.js';
import { cameraLikelyBlocked, detectInAppBrowser } from './lib/inAppBrowser.js';
import { makeRefNo } from './lib/refNo.js';
import { Gear, Bell, Check } from './components/Icons.jsx';

import SignIn from './screens/SignIn.jsx';
import Home from './screens/Home.jsx';
import Symptom from './screens/Symptom.jsx';
import Triage from './screens/Triage.jsx';
import Consent from './screens/Consent.jsx';
import Liveness from './screens/Liveness.jsx';
import Book from './screens/Book.jsx';
import Confirm from './screens/Confirm.jsx';
import Payment from './screens/Payment.jsx';
import Payments from './screens/Payments.jsx';
import Records from './screens/Records.jsx';
import Messages from './screens/Messages.jsx';
import Notifications from './screens/Notifications.jsx';
import Account from './screens/Account.jsx';
import Report from './screens/Report.jsx';
import Tokens from './screens/Tokens.jsx';
import BottomNav from './components/BottomNav.jsx';
import Wordmark from './components/Wordmark.jsx';
import { DemoSheet, TimeoutModal, Toast, HospitalSheet } from './components/Overlays.jsx';
import Splash, { shouldShowSplash } from './screens/Splash.jsx';

const FONT = { 0: 17, 1: 19, 2: 21 };
const initial = () => ({
  lang: 'en', screen: 'signin', stack: [], textScale: 0,
  signingIn: false, signinErr: false,
  authMode: 'loading', authLaunchUrl: null, authCallbackUrl: null, everifyPubKey: null, flowError: null,
  // "Login as eGov" widget config, served by GET /auth/config. partnerCode is the only credential
  // the browser is allowed to hold; both are null unless the backend is in live SSO mode.
  ssoPartnerCode: null, ssoHost: null,
  // An eGovPH exchange code lifted off the landing URL, held until the citizen taps sign-in.
  // In memory on purpose: see the mount effect for why it must never reach storage.
  pendingExchangeCode: null,
  // Names the dict entry behind flowError when there is one, so the message can be re-read in the
  // other language after the fact. null means flowError is already the only wording we have.
  flowErrorKey: null,
  patientName: null, patientPhone: null, sandboxAccount: false, verificationMethod: 'face-liveness',
  symptom: '', recording: false, recSec: 0, thinking: false,
  emergency: false, liveness: 'idle', livenessSessionId: null,
  // Names the chat app whose embedded browser is showing this page, when the face check is about
  // to be run somewhere the camera cannot work. null in a real browser.
  livenessBrowserName: null,
  // The server's own identityVerified, not the local capture state. null while /patients/me
  // has not answered yet, so a screen that gates on it can tell "unverified" from "don't know".
  // verifyReturnTo names the screen to land on once verification passes; null means booking.
  identityVerified: null, verifyReturnTo: null,
  // False until syncPatientState has come back once. Screens use it to avoid asserting a fact
  // they cannot know yet — "no upcoming appointments" is a claim, and rendering it before the
  // server has answered means the page contradicts itself a second later. Same class of bug as
  // the one Records had.
  patientSynced: false,
  triage: null,
  booking: false, booked: false, slotLabel: '', refNo: makeRefNo(CONST.hospital),
  // One entry per department being booked this session. Starts with just the triaged
  // specialty; addBookingDept() lets the patient queue up additional departments
  // (e.g. General Medicine + Cardiology) before confirming them together.
  bookings: [], lastBooked: [],
  appointments: [], payingApptId: null, remindedApptIds: [],
  hospital: CONST.hospital, showHospitalPicker: false,
  channel: null, paying: false, paid: false, paymentStatus: null,
  messages: [], unreadMessages: 0,
  notifications: [], unreadNotifications: 0,
  reportStage: 'form', reportCat: null, reportDesc: '', caseNo: CONST.caseNo,
  // Real SMS OTP state. otpChallengeId is the server's handle for the code it texted; without one
  // the Verify button has nothing to spend, which is the point — there is no client-side "correct".
  otpChallengeId: null, otpMasked: null, otpMockCode: null, otpSending: false, otpVerifying: false, otpError: null,
  trackCaseNo: '', trackLoading: false, trackError: null, trackResult: null,
  myReports: [], myReportsLoading: false,
  showDemo: false, showTimeout: false, toast: null,
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const tryApi = async (p) => { try { return await p; } catch { return null; } };

const SCREENS = { signin: SignIn, home: Home, symptom: Symptom, triage: Triage, consent: Consent, liveness: Liveness, book: Book, confirm: Confirm, payment: Payment, payments: Payments, records: Records, messages: Messages, notifications: Notifications, account: Account, report: Report, tokens: Tokens };
// Notifications isn't a BottomNav destination itself (it's reached via the bell), but it's a
// peer to Messages/Records/Account, so keep the nav visible while it's open too.
const NAV_SCREENS = new Set(['home', 'records', 'messages', 'account', 'notifications']);

export default function App() {
  const [S, setS] = useState(initial);
  // Splash plays on every app load, before sign-in. Held outside `screen` so it can't race the
  // resume effect's own navigation, and outside `initial()` so a state reset doesn't retrigger it
  // mid-session — only a fresh load or an explicit logout replays it.
  const [splashDone, setSplashDone] = useState(() => !shouldShowSplash());
  const timers = useRef([]);
  const recTimer = useRef(null);
  const recognizer = useRef(null); // Web Speech API instance
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const resumeStarted = useRef(false);

  const set = useCallback((patch) => setS((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) })), []);
  const after = useCallback((ms, fn) => { const id = setTimeout(fn, ms); timers.current.push(id); return id; }, []);
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; } }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const c = DICT[S.lang];
  const toast = (m) => { set({ toast: m }); after(2600, () => set({ toast: null })); };

  // Every fresh /patients/me shape lands here — Account/SignIn contact edits, and the refresh
  // after a liveness pass. Declared as a callback rather than inline in `A` because the resume
  // effect below needs it too, and `A` is rebuilt on every render so the effect can't close over it.
  const onPatientUpdated = useCallback((p) => set((prev) => ({
    patientName: p?.firstName || null,
    patientPhone: p?.phone || null,
    sandboxAccount: typeof p?.sandboxAccount === 'boolean' ? p.sandboxAccount : prev.sandboxAccount,
    // A caller that doesn't carry the flag must not be read as "unverified".
    identityVerified: typeof p?.identityVerified === 'boolean' ? p.identityVerified : prev.identityVerified,
    ...(p?.identityVerified ? { liveness: 'verified' } : {}),
  })), [set]);

  // Screen transition (GSAP): fade/slide the content in, then stagger [data-stagger] cards.
  useGSAP(() => {
    const el = contentRef.current;
    if (!el) return;
    gsap.fromTo(el, { autoAlpha: 0.35, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power3.out' });
    const cards = el.querySelectorAll('[data-stagger]');
    if (cards.length) gsap.fromTo(cards, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, stagger: 0.06, ease: 'power2.out', delay: 0.04 });
  }, { dependencies: [S.screen], scope: contentRef });

  // Keep the document language in sync so screen readers use the right pronunciation for EN/TL.
  useEffect(() => { document.documentElement.lang = S.lang === 'tl' ? 'fil' : 'en'; }, [S.lang]);

  // Primary screens share one scroll container; always open a newly selected screen at its top.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [S.screen]);

  // Reminders normally arrive server-side over SMS on a schedule, which doesn't fire in this
  // demo. Synthesize an in-app "appointment coming up" notification the first time we see an
  // active appointment land inside the reminder window. This is a local-only stand-in — kept
  // out of `messages` (real eMessage/SMS delivery history) and in `notifications` instead, so
  // it's never confused with an actual server-sent 'reminder' SMS.
  useEffect(() => {
    const REMINDER_WINDOW_DAYS = 3;
    const due = S.appointments.filter((a) => {
      if (!a.scheduledFor || S.remindedApptIds.includes(a.id)) return false;
      const daysUntil = Math.floor((new Date(a.scheduledFor).getTime() - Date.now()) / 86400000);
      return daysUntil >= 0 && daysUntil <= REMINDER_WINDOW_DAYS;
    });
    if (!due.length) return;
    const notes = due.map((a) => ({
      id: 'local_reminder_' + a.id, kind: 'appointment_upcoming', status: 'delivered', channel: 'in_app', provider: 'local',
      createdAt: new Date().toISOString(),
      meta: { specialty: a.specialty, hospital: a.hospital, queueNumber: a.queueNumber, daysUntil: Math.floor((new Date(a.scheduledFor).getTime() - Date.now()) / 86400000) },
    }));
    set((p) => ({
      notifications: [...notes, ...p.notifications],
      unreadNotifications: p.unreadNotifications + notes.length,
      remindedApptIds: [...p.remindedApptIds, ...due.map((a) => a.id)],
    }));
  }, [S.appointments, S.remindedApptIds, set]);

  // Resume eGovPH, hosted-liveness, and eGovPay redirects. Session JWTs live in
  // sessionStorage so they survive same-tab provider redirects but disappear when the tab closes.
  useEffect(() => {
    if (resumeStarted.current) return;
    resumeStarted.current = true;
    const cleanUrl = () => window.history.replaceState({}, '', '/');
    const finishPayment = async (billId) => {
      let latest = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        latest = await api.paymentStatus(billId);
        const status = String(latest?.status || '').toLowerCase();
        if (['paid', 'settled', 'success', 'successful', 'completed', 'failed', 'voided'].includes(status)) break;
        await delay(1500);
      }
      return latest;
    };

    // Re-derive the appointment/payment/message state from the backend. This is what keeps the
    // Home "upcoming appointment" card (and its paid state) alive across full-page navigations —
    // e.g. the eGovPay hosted-checkout redirect reloads the app and wipes in-memory React state,
    // so without this the card would silently vanish even though the booking still exists server-side.
    const SETTLED = ['paid', 'settled', 'success', 'successful', 'completed'];
    const formatSlot = (scheduledFor, lang) => (scheduledFor
      ? new Date(scheduledFor).toLocaleString(lang === 'tl' ? 'fil-PH' : 'en-PH', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : null);
    // Every active (non-cancelled) appointment gets its own card — not just the most recent one —
    // so booking a 2nd, 3rd, etc. appointment doesn't silently push earlier ones out of view.
    // Payments are matched back to their appointment via `appointmentId` so each card shows its
    // own paid/unpaid state independently.
    const syncPatientState = async () => {
      // `me` is fetched here rather than read from state: on a fresh page load (including the
      // return from the hosted Face Liveness redirect) S.liveness is still 'idle', so stamping
      // appointments from it marked a verified patient's card "Not verified". identityVerified is
      // the server's persisted truth and is correct at every call site.
      const [appts, pays, msgs, me] = await Promise.all([
        tryApi(api.appointments()), tryApi(api.payments()), tryApi(api.messages()), tryApi(api.me()),
      ]);
      const identityVerified = !!me?.identityVerified;
      // Home greeted a hardcoded "Rosa" from the dictionary regardless of who was signed in.
      if (me) onPatientUpdated(me);
      // Records gates on this server-side. The mirrored liveness flag can't stand in for it:
      // it stays 'idle' for an unverified patient, which is indistinguishable from "not asked yet".
      if (me) set({ identityVerified });
      // Set regardless of whether `me` came back: on a backend outage the screens still have to
      // stop waiting and show their empty states rather than spinning forever.
      set({ patientSynced: true });
      if (identityVerified) set({ liveness: 'verified' });
      if (Array.isArray(msgs)) set({ messages: msgs });
      if (Array.isArray(appts) && appts.length) {
        const activeAppts = [...appts]
          .filter((a) => a.status !== 'cancelled')
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        if (activeAppts.length) {
          set((p) => {
            const appointments = activeAppts.map((a) => ({
              id: a.id,
              specialty: a.specialty,
              hospital: a.hospital || 'PGH',
              slotLabel: formatSlot(a.scheduledFor, p.lang) || p.slotLabel,
              scheduledFor: a.scheduledFor || null,
              refNo: makeRefNo(a.hospital || 'PGH', a.queueNumber, a.id || a.queueNumber, a.specialty),
              queueNumber: a.queueNumber,
              paid: Array.isArray(pays) && pays.some((pay) => pay.appointmentId === a.id && SETTLED.includes(String(pay.status || '').toLowerCase())),
              verified: identityVerified,
            }));
            const active = activeAppts[0];
            // Legacy/unlinked payments (made before appointmentId existed) still settle the
            // singular flow used right after booking (Confirm screen, etc.).
            const legacyPaid = Array.isArray(pays) && pays.some((pay) => !pay.appointmentId && SETTLED.includes(String(pay.status || '').toLowerCase()));
            return {
              appointments,
              booked: true,
              triage: { ...(p.triage || {}), specialty: active.specialty },
              slotLabel: appointments[0]?.slotLabel || p.slotLabel,
              refNo: appointments[0]?.refNo || p.refNo,
              hospital: active.hospital && active.hospital !== 'PGH' ? active.hospital : p.hospital,
              paid: p.paid || appointments[0]?.paid || legacyPaid,
            };
          });
        }
      }
    };

    (async () => {
      try {
        const auth = await api.authConfig();
        set({
          authMode: auth?.mode || 'mock',
          authLaunchUrl: auth?.launchUrl || null,
          authCallbackUrl: auth?.callbackUrl || null,
          // eVerify's browser-safe "Public API Key", served by the backend so the one already set
          // as EVERIFY_PUBKEY there is the single source of truth (see acceptConsent below).
          everifyPubKey: auth?.everifyPubKey || null,
          verificationMethod: auth?.verificationMethod || 'face-liveness',
          ssoPartnerCode: auth?.ssoPartnerCode || null,
          ssoHost: auth?.ssoHost || null,
        });

        const current = new URL(window.location.href);
        const exchangeCode = current.searchParams.get('exchange_code') || current.searchParams.get('exchangeCode');
        if (exchangeCode) {
          // Park the code and wait for a tap. eGovPH codes are single-use, and merely fetching
          // this URL used to spend one — link-preview crawlers and the mail security scanners
          // that prefetch every link in an incoming email (Defender Safe Links, Proofpoint) would
          // burn the code before the citizen ever opened it, and they'd be told it expired.
          // A fetch must not be able to spend the code; only a click can. Memory only, never
          // storage: persisting it just moves the spent-code-on-reload problem somewhere else.
          cleanUrl();
          set({ pendingExchangeCode: exchangeCode, signingIn: false, signinErr: false, flowError: null, flowErrorKey: null, screen: 'signin', stack: [] });
          return;
        }

        if (current.pathname.endsWith('/liveness/callback')) {
          cleanUrl();
          const sessionId = window.sessionStorage.getItem('egovmed.livenessSessionId');
          // The hosted capture navigates the tab away and back, so React state is gone by the
          // time we land here. Where to return to afterwards rides in sessionStorage next to the
          // session id for exactly that reason.
          const returnTo = window.sessionStorage.getItem('egovmed.verifyReturnTo') === 'records' ? 'records' : null;
          if (!getToken() || !sessionId) throw new Error('The liveness session could not be resumed');
          set({ screen: 'liveness', stack: [returnTo || 'consent'], liveness: 'verifying', livenessSessionId: sessionId, verifyReturnTo: returnTo, flowError: null });
          const result = await api.verifyIdentity(sessionId);
          window.sessionStorage.removeItem('egovmed.livenessSessionId');
          if (!result?.verified) {
            // eVerify's own words when it gives any, so a failure is diagnosable from the screen.
            throw new Error(result?.reason ? `eVerify: ${result.reason}` : 'Identity verification did not pass');
          }
          set({ liveness: 'verified' });
          // Records reads identityVerified, so re-read the patient before handing the screen back.
          const verifiedMe = await tryApi(api.me());
          if (verifiedMe) onPatientUpdated(verifiedMe);
          return;
        }

        if (current.pathname.endsWith('/payment/return')) {
          // The bill id can arrive two ways: on the URL, which is what the mock gateway sends and
          // what survives a return that lands outside the original tab; or in sessionStorage,
          // where doPay() parks it before handing the tab to the hosted checkout. Read the URL
          // before cleanUrl() wipes it, and only trust an id shaped like one of ours.
          const fromUrl = current.searchParams.get('bill');
          const billId = (/^bill_[A-Za-z0-9_-]{1,100}$/.test(fromUrl || '') ? fromUrl : null)
            || window.sessionStorage.getItem('egovmed.pendingBillId');
          const pendingApptId = window.sessionStorage.getItem('egovmed.pendingApptId');
          cleanUrl();
          if (!getToken() || !billId) throw new Error('The payment session could not be resumed');
          set({ screen: 'payment', stack: ['home'], paying: true, channel: 0, payingApptId: pendingApptId || null, flowError: null });
          let payment;
          try {
            payment = await finishPayment(billId);
          } catch (err) {
            // The backend's "Bill not found" says nothing a citizen can act on. Translate it, and
            // let the finally below drop the id so a dead bill isn't retried on every return.
            throw err?.status === 404
              ? new Error('We could not find that bill any more. Nothing was charged twice — open Payments to check before paying again.')
              : err;
          } finally {
            // Fail closed: whatever happened, this id has had its one chance. Keeping it would
            // leave the app pointing at a bill it can no longer resolve for the rest of the session.
            window.sessionStorage.removeItem('egovmed.pendingBillId');
            window.sessionStorage.removeItem('egovmed.pendingApptId');
          }
          const status = String(payment?.status || '').toLowerCase();
          const paid = ['paid', 'settled', 'success', 'successful', 'completed'].includes(status);
          set({ paying: false, paid, paymentStatus: status, flowError: paid ? null : `Payment status: ${status || 'pending'}` });
          if (paid) {
            set((p) => ({
              notifications: [{ id: `local_payment_confirmed_${Date.now()}`, kind: 'payment_confirmed', status: 'delivered', channel: 'in_app', provider: 'local', createdAt: new Date().toISOString(), meta: { apptId: pendingApptId || null } }, ...p.notifications],
              unreadNotifications: p.unreadNotifications + 1,
            }));
          }
          await syncPatientState();
          return;
        }

        if (getToken()) {
          const me = await api.me();
          if (me?.identityVerified) set({ liveness: 'verified' });
          await syncPatientState();
          set({ screen: 'home', stack: [] });
        }
      } catch (err) {
        // A spent or expired eGovPH exchange code is the one failure on this path the citizen can
        // actually fix, so it gets said in their language. The backend tags it with its own error
        // code; flowErrorKey names the dict entry so the message follows the EN/TL toggle instead
        // of freezing in whatever language it was in when it was thrown. Everything else keeps
        // showing the server's own words, which is the only description we have of it.
        const flowErrorKey = err?.data?.error?.code === 'egov_exchange_code_invalid' ? 'ssoCodeExpired' : null;
        set((p) => ({
          authMode: p.authMode === 'loading' ? 'mock' : p.authMode,
          signingIn: false,
          signinErr: true,
          liveness: 'failed',
          paying: false,
          flowErrorKey,
          flowError: (flowErrorKey && DICT[p.lang]?.[flowErrorKey]) || err.message || 'The live flow failed',
        }));
      }
    })();
  }, [set, onPatientUpdated]);

  // Spends an eGovPH exchange code for an eGovMed session. Shared by the two ways a code can
  // arrive: parked off the landing URL by the mount effect (in-app launch), and handed over by the
  // "Login as eGov" widget (browser sign-in). Both are single-use and short-lived, so the only
  // difference between them is who supplies the string.
  const redeemExchangeCode = useCallback(async (code) => {
    if (!code) {
      set({ signinErr: true, flowError: 'eGovPH did not return a sign-in code' });
      return;
    }
    set({ signingIn: true, signinErr: false, flowError: null, flowErrorKey: null });
    try {
      const res = await api.login(code);
      if (!res?.token) throw new Error('eGovPH returned no session token');
      setToken(res.token);
      const me = res.patient || await tryApi(api.me());
      if (me) onPatientUpdated(me);
      set({ pendingExchangeCode: null, signingIn: false, screen: 'home', stack: [], flowError: null });
    } catch (err) {
      const flowErrorKey = err?.data?.error?.code === 'egov_exchange_code_invalid' ? 'ssoCodeExpired' : null;
      set((p) => ({
        // Only a code eGovPH itself rejected gets dropped, so the button falls back to its
        // normal job instead of re-spending something already dead. A network blip keeps it.
        pendingExchangeCode: flowErrorKey ? null : p.pendingExchangeCode,
        signingIn: false,
        signinErr: true,
        flowErrorKey,
        flowError: (flowErrorKey && DICT[p.lang]?.[flowErrorKey]) || err.message || 'The eGovPH sign-in failed',
      }));
    }
  }, [set, onPatientUpdated]);

  const A = {
    setLang: (l) => set({ lang: l }),
    cycleText: () => set((p) => ({ textScale: (p.textScale + 1) % 3 })),
    go: (screen) => set((p) => ({
      screen, stack: [...p.stack, p.screen],
      ...(screen === 'messages' ? { unreadMessages: 0 } : {}),
      ...(screen === 'notifications' ? { unreadNotifications: 0 } : {}),
    })),
    back: () => set((p) => { const k = [...p.stack]; const prev = k.pop() || 'home'; return { screen: prev, stack: k }; }),
    toast,

    // Mock mode exchanges this device's own demo code, so two people demoing at once get two
    // patients instead of fighting over one. Live mode starts the partner-provided eGovPH launch URL;
    // eGovPH returns to /egovph/sso?exchange_code=... and the mount effect above parks that code
    // for this button to spend.
    doSignIn: async () => {
      // A code already in hand outranks the launch redirect: sending the citizen back to eGovPH
      // for a second code would strand the one they arrived with.
      if (S.pendingExchangeCode) {
        await redeemExchangeCode(S.pendingExchangeCode);
        return;
      }

      if (S.authMode === 'live') {
        // An explicit partner launch URL still wins when one is configured — that is the in-app
        // path, and it costs the citizen no OTP. Otherwise the sign-in screen renders the widget
        // itself, so this button is not the way in and there is nothing to do here.
        if (S.authLaunchUrl && /^https:\/\//i.test(S.authLaunchUrl)) {
          window.location.assign(S.authLaunchUrl);
        } else if (!S.ssoPartnerCode) {
          set({ signinErr: true, flowError: 'eGovPH sign-in is not configured on the server.' });
        }
        return;
      }
      set({ signingIn: true, signinErr: false, flowErrorKey: null });
      const [res] = await Promise.all([tryApi(api.login(demoExchangeCode())), delay(900)]);
      if (res?.token) {
        setToken(res.token);
        // Load the patient before showing Home. syncPatientState() lives inside the resume effect
        // and isn't reachable from here, so signing in normally left patientName/patientPhone null
        // — Home greeted a bare "Hi" and fell back to a placeholder phone. It only looked right
        // after a reload, because that path goes through the resume effect instead.
        const me = res.patient || await tryApi(api.me());
        if (me) onPatientUpdated(me);
        set({ signingIn: false, screen: 'home', stack: [], flowError: null });
      } else if (S.authMode === 'mock') {
        // Keep the hackathon demo usable during a backend outage without minting a
        // fake session: protected API calls remain unauthenticated and use UI fallbacks.
        set({ signingIn: false, screen: 'home', stack: [], flowError: null });
      } else {
        set({ signingIn: false, signinErr: true, flowError: 'Unable to sign in.' });
      }
    },

    // Symptom intake
    setSymptom: (v) => set({ symptom: v }),
    addChip: (t) => set((p) => { const s = p.symptom.trim(); return { symptom: s ? s.replace(/[.,]$/, '') + ', ' + t.toLowerCase() : t }; }),
    toggleRec: () => {
      if (S.recording) {
        if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
        if (recognizer.current) { try { recognizer.current.stop(); } catch { /* already stopped */ } recognizer.current = null; }
        set({ recording: false });
        // Only inject the scripted sample if the real recognizer produced nothing (offline / permission denied / no SR support).
        after(400, () => set((p) => {
          if (p.symptom.trim()) return {};
          const sample = p.lang === 'tl'
            ? 'Sumasakit ang dibdib ko at medyo hirap huminga mula kaninang umaga.'
            : 'I’ve had chest pain and a bit of shortness of breath since this morning.';
          return { symptom: sample };
        }));
      } else {
        set({ recording: true, recSec: 0 });
        recTimer.current = setInterval(() => set((p) => ({ recSec: p.recSec + 1 })), 1000);
        // Real Web Speech API when the browser supports it (Chrome/Edge on desktop, most modern mobiles).
        const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
        if (SR) {
          try {
            const rec = new SR();
            rec.lang = S.lang === 'tl' ? 'fil-PH' : 'en-PH';
            rec.interimResults = true;
            rec.continuous = true;
            const baseText = S.symptom.trim();
            rec.onresult = (e) => {
              let transcript = '';
              for (let i = 0; i < e.results.length; i += 1) transcript += e.results[i][0].transcript;
              set({ symptom: (baseText ? baseText + ' ' : '') + transcript.trim() });
            };
            rec.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') console.warn('speech recognition error:', e.error); };
            rec.onend = () => { recognizer.current = null; };
            rec.start();
            recognizer.current = rec;
          } catch { /* fall through — sample injection on stop will cover it */ }
        }
      }
    },
    // eGovAI triage
    doAnalyze: async () => {
      if (!S.symptom.trim() || S.thinking) return;
      set({ thinking: true });
      const [apiResult] = await Promise.all([tryApi(api.triage(S.symptom, S.lang)), delay(1900)]);
      const localFallback = fallbackTriage(S.symptom, S.lang);
      const res = apiResult || localFallback;
      const emergency = S.emergency || res?.urgency === 'emergency';
      const triage = {
        specialty: res?.specialty || CONST.dept,
        urgency: emergency ? 'emergency' : res?.urgency || 'urgent',
        redFlags: Array.isArray(res?.redFlags) ? res.redFlags : [],
        inputSymptoms: res?.inputSymptoms || S.symptom,
        reasoning: ['rule-based-fallback', 'on-device-fallback'].includes(res?.engine) ? localFallback.reasoning : res?.reasoning || null,
        recommendedAction: res?.recommendedAction || null,
        confidence: res?.confidence ?? null,
        engine: res?.engine || null,
        id: res?.id || null,
      };
      set({ thinking: false, emergency, triage, screen: 'triage', stack: [...S.stack, 'symptom'] });
    },
    // Clearing the return target matters here: a verification abandoned on the Records path
    // would otherwise still be pending, and send this booking run back to Records instead of Book.
    continueTriage: () => { A.clearVerifyReturn(); A.go('consent'); },
    // Records sits on the bottom nav, so a patient can land there having never been through
    // triage. Consent and Liveness are identical either way, so send them through the same two
    // screens and remember where to come back to instead of forking the flow.
    startVerificationFromRecords: () => {
      window.sessionStorage.setItem('egovmed.verifyReturnTo', 'records');
      set({ verifyReturnTo: 'records' });
      A.go('consent');
    },
    clearVerifyReturn: () => { window.sessionStorage.removeItem('egovmed.verifyReturnTo'); set({ verifyReturnTo: null }); },
    // Where the Liveness screen's Continue leads. Booking stays the default, so the
    // triage → consent → liveness → book path is untouched.
    continueAfterVerify: () => {
      if (S.verifyReturnTo !== 'records') { A.goBook(); return; }
      A.clearVerifyReturn();
      set({ screen: 'records', stack: ['home'] });
    },

    // Consent + Face Liveness (National ID eVerify)
    // "Not now" means declining verification altogether — you can't book without it, so
    // stepping back to Triage would just loop you right back into this same screen.
    // Exit the flow entirely instead.
    declineConsent: () => {
      const fromRecords = S.verifyReturnTo === 'records';
      A.clearVerifyReturn();
      A.resetToHome();
      toast(fromRecords
        ? c.recordsLockedDeclined
        : (S.lang === 'tl' ? 'Kailangan ang pag-verify para makapag-book ng appointment' : "You'll need to verify your identity to book an appointment"));
    },
    // `force` skips the in-app-browser gate below — the patient chose "try anyway".
    acceptConsent: async ({ force = false } = {}) => {
      // retryLiveness() re-enters here from the Liveness screen itself — only push 'consent' onto
      // the back stack when we're actually arriving from it, or repeated retries pile up duplicate
      // entries and Back takes as many presses as the patient made attempts.
      set((p) => ({
        screen: 'liveness',
        stack: p.screen === 'liveness' ? p.stack : [...p.stack, 'consent'],
        liveness: 'capturing',
        flowError: null,
      }));
      // Most citizens arrive from a link in Messenger or Facebook, which opens the app inside the
      // chat app's own webview. That webview has no usable camera grant, so the eVerify iframe
      // dead-ends on "Camera is not accessible" with no permission prompt to accept and nothing
      // on screen to do about it. Say it up front, while there is still a screen to say it on —
      // once the SDK's full-screen overlay is up, the only way out is its X button.
      // The check is UA-based, so it can be wrong: 'try anyway' has to stay one tap away.
      if (!force && usesEverifySdk(S) && cameraLikelyBlocked()) {
        set({ liveness: 'blocked', livenessBrowserName: detectInAppBrowser(), flowError: null });
        return;
      }
      // Records gates on the server's identityVerified, not on this local flag, so pull the
      // patient back down before the screen offers to continue — otherwise verification passes
      // and the list we return to is still locked.
      const markVerified = async () => {
        set({ liveness: 'verified' });
        const me = await tryApi(api.me());
        if (me) onPatientUpdated(me);
      };
      try {
        // Opt-in path: the eVerify Web SDK runs its own in-browser liveness capture and returns a
        // session_id that (unlike our own Face Liveness hosted flow) is actually accepted by
        // eVerify's /api/query. Off by default — see docs on VITE_EVERIFY_SDK_ENABLED.
        // The backend owns this switch (VERIFICATION_METHOD) so flipping providers is one env var
        // in one place rather than two kept in sync across two Vercel projects. The build-time flag
        // remains an override for local development. Shared with the Liveness screen, which has to
        // reach the same answer to know whether the camera is ours or the SDK's.
        if (usesEverifySdk(S)) {
          // Backend /auth/config first (one place to set and rotate the key, no frontend rebuild);
          // VITE_EVERIFY_PUBKEY stays as a local/offline override when the backend has none.
          const sid = await runEverifyLivenessCapture(S.everifyPubKey || import.meta.env.VITE_EVERIFY_PUBKEY);
          set({ livenessSessionId: sid, liveness: 'verifying' });
          await api.registerEverifySdkLiveness(sid);
          const result = await api.verifyIdentity(sid);
          if (!result?.verified) throw new Error('Identity verification did not pass');
          await markVerified();
          return;
        }
        const sess = await api.startLiveness();
        const sid = sess?.sessionId || sess?.session_id || null;
        if (!sid) throw new Error('Face Liveness returned no session ID');
        set({ livenessSessionId: sid });
        if (sess?.url) {
          const hosted = new URL(sess.url);
          if (hosted.protocol !== 'https:') throw new Error('Face Liveness returned an insecure URL');
          window.sessionStorage.setItem('egovmed.livenessSessionId', sid);
          window.location.assign(hosted.href);
          return;
        }
        await delay(900);
        set({ liveness: 'verifying' });
        const result = await api.verifyIdentity(sid);
        if (!result?.verified) throw new Error('Identity verification did not pass');
        await markVerified();
      } catch (err) {
        // Closing the SDK's X button is a deliberate "not right now", not a rejected identity.
        // Its own state keeps the red "Verification was not completed" alert off the screen.
        if (err?.code === EVERIFY_CANCELLED) {
          set({ liveness: 'cancelled', flowError: null });
          return;
        }
        set({ liveness: 'failed', flowError: err.message || 'Identity verification failed' });
      }
    },
    // Account edits patient fields through its own local state, so without this the header
    // greeting and phone kept showing the pre-edit values until a full reload.
    onPatientUpdated,
    redeemExchangeCode,
    retryLiveness: () => A.acceptConsent(),
    // "Try anyway" from the in-app-browser card: run the capture despite the UA check.
    forceLiveness: () => A.acceptConsent({ force: true }),

    // Booking + eMessage
    goBook: () => {
      A.go('book');
      const primary = S.triage?.specialty || CONST.dept;
      set({ bookings: [{ specialty: primary, slots: null, slotsLoading: true, selectedSlot: null }] });
      after(1100, () => set((p) => ({
        bookings: p.bookings.map((b) => (b.specialty === primary ? { ...b, slotsLoading: false, slots: randomSlots(p.lang, b.specialty) } : b)),
      })));
    },
    selectBookingSlot: (specialty, i) => set((p) => ({
      bookings: p.bookings.map((b) => (b.specialty === specialty ? { ...b, selectedSlot: i } : b)),
    })),
    // Lets a patient add a 2nd (or 3rd+) department to this same visit — e.g. General Medicine
    // for a routine checkup plus Cardiology for a heart concern — so both get booked together.
    addBookingDept: (specialty) => {
      if (!specialty || S.bookings.some((b) => b.specialty === specialty)) return;
      set((p) => ({ bookings: [...p.bookings, { specialty, slots: null, slotsLoading: true, selectedSlot: null }] }));
      after(900, () => set((p) => ({
        bookings: p.bookings.map((b) => (b.specialty === specialty ? { ...b, slotsLoading: false, slots: randomSlots(p.lang, specialty) } : b)),
      })));
    },
    removeBookingDept: (specialty) => set((p) => ({
      bookings: p.bookings.length > 1 ? p.bookings.filter((b) => b.specialty !== specialty) : p.bookings,
    })),
    toggleHospitalPicker: () => set((p) => ({ showHospitalPicker: !p.showHospitalPicker })),
    // Switching hospitals re-queries slots for that facility (mocked with the same short delay as goBook),
    // and rolls a brand new randomized batch of times for every queued department so the list
    // doesn't look static/demo-y.
    setHospital: (name) => {
      set((p) => ({
        hospital: name, showHospitalPicker: false,
        bookings: p.bookings.map((b) => ({ ...b, selectedSlot: null, slotsLoading: true })),
      }));
      after(900, () => set((p) => ({
        bookings: p.bookings.map((b) => ({ ...b, slotsLoading: false, slots: randomSlots(p.lang, b.specialty) })),
      })));
    },
    // Books every queued department that has a slot picked, in one pass, so a patient who needs
    // e.g. General Medicine + Cardiology gets both appointments (each its own queue number,
    // reference number, and Home card) instead of only ever booking one at a time.
    doBook: async () => {
      const ready = S.bookings.filter((b) => b.selectedSlot != null && b.slots?.[b.selectedSlot]);
      if (!ready.length || S.booking) return;
      set({ booking: true });
      const bookOne = async (b) => {
        const slot = b.slots[b.selectedSlot];
        const slotLabel = slot[0];
        const scheduledFor = slot[3] || undefined;
        const triageId = S.triage?.specialty === b.specialty ? S.triage?.id : undefined;
        const [res] = await Promise.all([tryApi(api.book(b.specialty, S.hospital, scheduledFor, triageId)), delay(1200)]);
        const appt = res?.appointment;
        const refNo = appt ? makeRefNo(appt.hospital || 'PGH', appt.queueNumber, appt.id || appt.queueNumber, b.specialty) : null;
        return { specialty: b.specialty, slotLabel, appt, refNo };
      };
      const settled = await Promise.all(ready.map(bookOne));
      const newCards = settled.filter((r) => r.appt).map((r) => ({
        id: r.appt.id, specialty: r.specialty, hospital: r.appt.hospital || S.hospital,
        slotLabel: r.slotLabel, scheduledFor: r.appt.scheduledFor || null,
        refNo: r.refNo || makeRefNo(r.appt.hospital || S.hospital, r.appt.queueNumber, r.appt.id, r.specialty),
        queueNumber: r.appt.queueNumber, paid: false, verified: S.liveness === 'verified',
      }));
      // Optimistic confirmation bubbles so Messages feels instant; A.loadMessages() below
      // reconciles them with the real, server-persisted rows (with real msg_… ids) a moment later.
      const optimistic = newCards.map((card) => ({
        id: 'local_' + card.id, kind: 'confirmation', status: 'sent', channel: 'sms', provider: 'mock',
        createdAt: new Date().toISOString(), meta: { specialty: card.specialty, hospital: card.hospital, queueNumber: card.queueNumber },
      }));
      set((p) => ({
        booking: false, booked: true,
        lastBooked: settled,
        slotLabel: newCards[0]?.slotLabel || p.slotLabel, refNo: newCards[0]?.refNo || p.refNo,
        appointments: [...newCards, ...p.appointments.filter((a) => !newCards.some((n) => n.id === a.id))],
        messages: [...optimistic, ...p.messages], unreadMessages: p.unreadMessages + optimistic.length,
        screen: 'confirm', stack: ['home'],
      }));
      toast(S.lang === 'tl'
        ? (newCards.length > 1 ? 'Ipinadala ang mga kumpirmasyon sa SMS' : 'Ipinadala ang kumpirmasyon sa SMS')
        : (newCards.length > 1 ? 'Confirmations texted to you' : 'Confirmation texted to you'));
      after(1200, A.loadMessages);
    },

    // Payment (eGovPay)
    // apptId identifies which appointment card this payment is for, so multiple bookings can
    // each be paid independently instead of sharing one global paid flag.
    goPayment: (apptId) => { set({ payingApptId: apptId || null }); A.go('payment'); },
    // Payments tab: history + what's still unpaid, instead of dropping straight into checkout.
    goPayments: () => A.go('payments'),
    setChannel: (i) => set({ channel: i }),
    doPay: async (amount = 300) => {
      if (S.channel == null || S.paying) return;
      set({ paying: true, flowError: null });
      try {
        const payment = await api.pay(amount, CHANNELS[S.channel]?.[0] || 'card', S.payingApptId);
        if (payment?.provider !== 'mock' && payment?.checkoutUrl) {
          const checkout = new URL(payment.checkoutUrl);
          if (checkout.protocol !== 'https:') throw new Error('Payment provider returned an insecure checkout URL');
          // Fail closed: the bill id is the only thing that survives the trip to the gateway, so
          // never leave for a hosted checkout we'd have no way to resume from.
          if (!payment.id) throw new Error('Payment provider returned no bill reference');
          window.sessionStorage.setItem('egovmed.pendingBillId', payment.id);
          if (S.payingApptId) window.sessionStorage.setItem('egovmed.pendingApptId', S.payingApptId);
          window.location.assign(checkout.href);
          return;
        }
        const refreshed = payment?.id ? await api.paymentStatus(payment.id) : payment;
        const status = String(refreshed?.status || '').toLowerCase();
        const paid = ['paid', 'settled', 'success', 'successful', 'completed'].includes(status);
        set((p) => ({
          paying: false, paid, paymentStatus: status, flowError: paid ? null : `Payment status: ${status || 'pending'}`,
          appointments: paid && p.payingApptId
            ? p.appointments.map((a) => (a.id === p.payingApptId ? { ...a, paid: true } : a))
            : p.appointments,
        }));
        if (paid) {
          toast(S.lang === 'tl' ? 'Ipinadala ang resibo sa SMS' : 'Receipt texted to you');
          A.pushNotification('payment_confirmed', { amount, apptId: S.payingApptId });
        }
      } catch (err) {
        set({ paying: false, flowError: err.message || 'Payment failed' });
      }
    },

    // Messages (eMessage) — list refresh + reply thread
    loadMessages: async () => {
      const rows = await tryApi(api.messages());
      if (Array.isArray(rows)) set({ messages: rows });
      return rows;
    },
    sendMessageReply: async (id, text) => {
      const res = await tryApi(api.replyToMessage(id, text));
      if (res?.reply) set((p) => ({ messages: [res.reply, ...p.messages] }));
      if (res?.ack) after(1000, () => set((p) => ({ messages: [res.ack, ...p.messages] })));
      return res;
    },
    // Record uploads, benefit activation, payment receipts, and report filing don't hit
    // eMessage/SMS — they're in-app-only pings, so they live in `notifications`, a separate
    // feed from `messages` (which stays a pure mirror of real eMessage/SMS delivery history).
    pushNotification: (kind, meta) => {
      const note = {
        id: `local_${kind}_${Date.now()}`, kind, status: 'delivered', channel: 'in_app', provider: 'local',
        createdAt: new Date().toISOString(), meta,
      };
      set((p) => ({ notifications: [note, ...p.notifications], unreadNotifications: p.unreadNotifications + 1 }));
    },
    notifyRecordUploaded: (saved) => A.pushNotification('record_uploaded', { title: saved?.title || saved?.name }),
    notifyBenefitAdded: (label) => A.pushNotification('benefit_added', { title: label }),

    // Records + Report
    goRecords: () => A.go('records'),
    openReport: () => { set({ reportStage: 'form', reportCat: null, reportDesc: '', trackCaseNo: '', trackError: null, trackResult: null, otpChallengeId: null, otpMasked: null, otpMockCode: null, otpError: null }); A.go('report'); },
    setCat: (i) => set({ reportCat: i }),
    setDesc: (v) => set({ reportDesc: v }),
    submitReport: () => {
      if (S.reportCat == null || !S.reportDesc.trim()) return;
      set({ reportStage: 'otp', otpChallengeId: null, otpMasked: null, otpMockCode: null, otpError: null });
      A.sendReportOtp();
    },
    // Mints a code server-side and texts it to the number on the patient's record. Errors are
    // surfaced rather than swallowed: "no phone on file" and "SMS failed" both mean the report
    // cannot be filed, and a silent failure here would look identical to a code in flight.
    sendReportOtp: async () => {
      // Check what POST /reports will check, BEFORE spending an SMS. Without this a too-short
      // description sent a real text, took the patient to the code screen, and only then failed
      // validation — burning a message and a challenge on input we could reject for free.
      const description = String(S.reportDesc || '').trim();
      if (S.reportCat === null || S.reportCat === undefined) { set({ otpError: c.reportCategoryRequired }); return false; }
      if (description.length < 3) { set({ otpError: c.reportDescriptionTooShort }); return false; }
      set({ otpSending: true, otpError: null });
      try {
        const res = await api.requestReportOtp();
        set({
          otpSending: false, otpChallengeId: res?.challengeId || null,
          otpMasked: res?.maskedPhone || null, otpMockCode: res?.mockCode || null,
        });
        return true;
      } catch (err) {
        set({ otpSending: false, otpChallengeId: null, otpError: err.message || 'We could not text you a code.' });
        return false;
      }
    },
    // The report is filed by the same call that spends the code, so a bad code leaves the patient
    // on this screen with a reason — it never advances to a case number that does not exist.
    verifyOtp: async (catLabel, code) => {
      if (!S.otpChallengeId || !/^\d{6}$/.test(code || '')) return;
      set({ otpVerifying: true, otpError: null });
      try {
        const res = await api.fileReport(catLabel, S.reportDesc, S.otpChallengeId, code);
        set({
          otpVerifying: false, reportStage: 'filed', otpChallengeId: null, otpMockCode: null,
          caseNo: res?.caseNumber || S.caseNo,
        });
        A.pushNotification('report_filed', { caseNo: res?.caseNumber || S.caseNo, category: catLabel });
      } catch (err) {
        set({ otpVerifying: false, otpError: err.message || 'That code did not work.' });
      }
    },

    // Check the status of a previously filed report (GET /reports/:caseNumber)
    openTrackReport: () => { set({ reportStage: 'track', trackCaseNo: '', trackError: null, trackResult: null }); A.loadMyReports(); },
    // The patient's own filed reports (GET /reports), so tracking a case doesn't require having
    // written the case number down somewhere. Failure is non-fatal: the manual entry field
    // stays usable, the list just doesn't render.
    loadMyReports: async () => {
      set({ myReportsLoading: true });
      const res = await tryApi(api.myReports());
      set({ myReportsLoading: false, myReports: res?.reports || [] });
    },
    // Tapping a row fills the field and runs the same lookup as manual entry, so the result
    // always reflects fresh upstream status rather than the summary row's cached one.
    trackMyReport: (caseNumber) => { set({ trackCaseNo: caseNumber, trackError: null }); A.submitTrackCase(caseNumber); },
    setTrackCaseNo: (v) => set({ trackCaseNo: v.toUpperCase(), trackError: null }),
    // caseNumber is passed explicitly when this comes from a tapped list row, since the set()
    // that fills the field hasn't necessarily landed in S yet.
    submitTrackCase: async (caseNumber) => {
      const caseNo = (typeof caseNumber === 'string' ? caseNumber : S.trackCaseNo).trim();
      // EGM-YYYY-###### = self-generated (mock); PFM-MMDDYY-#### = live eReport format.
      // Backend accepts both, keep this in sync so live case numbers don't fail client-side.
      if (!/^(EGM-\d{4}-\d{6}|PFM-\d{6}-\d{4})$/.test(caseNo)) { set({ trackError: 'invalid' }); return; }
      set({ trackLoading: true, trackError: null, trackResult: null });
      try {
        const res = await api.trackCase(caseNo);
        set({ trackLoading: false, trackResult: res || null, trackError: res ? null : 'notfound' });
      } catch {
        set({ trackLoading: false, trackError: 'notfound' });
      }
    },

    // Overlays / demo controls
    resetToHome: () => set({ screen: 'home', stack: [], bookings: [], channel: null, paid: false, paying: false, reportStage: 'form', reportCat: null, reportDesc: '', trackCaseNo: '', trackResult: null, trackError: null, otpChallengeId: null, otpMasked: null, otpMockCode: null, otpError: null }),
    toggleDemo: () => set((p) => ({ showDemo: !p.showDemo })),
    toggleEmergency: () => set((p) => ({ emergency: !p.emergency })),
    triggerTimeout: () => set({ showDemo: false, showTimeout: true }),
    stayIn: () => set({ showTimeout: false }),
    // Log out returns to sign-in, and the splash plays before sign-in, so replay it here too.
    logout: () => { clearTimers(); setToken(null); window.sessionStorage.removeItem('egovmed.livenessSessionId'); window.sessionStorage.removeItem('egovmed.verifyReturnTo'); window.sessionStorage.removeItem('egovmed.pendingBillId'); setSplashDone(false); setS((p) => ({ ...initial(), lang: p.lang, textScale: p.textScale })); },
    openTokens: () => { set({ showDemo: false }); A.go('tokens'); },
    resetFlow: () => { clearTimers(); setS((p) => ({ ...initial(), lang: p.lang, textScale: p.textScale })); },
  };

  const Screen = SCREENS[S.screen] || Home;
  const showNav = NAV_SCREENS.has(S.screen);

  return (
    <div className="device" style={{ fontSize: FONT[S.textScale] }}>
      {/* utility strip */}
      <header className="util">
        <Wordmark height={20} />
        <div className="util-right">
          <div className="seg" role="group" aria-label="Language">
            <SegBtn on={S.lang === 'en'} onClick={() => A.setLang('en')}>EN</SegBtn>
            <SegBtn on={S.lang === 'tl'} onClick={() => A.setLang('tl')}>TL</SegBtn>
          </div>
          <button className={'iconbtn' + (S.textScale ? ' active' : '')} onClick={A.cycleText} aria-label={c.textSize} title={c.textSize}>AA</button>
          <button className="iconbtn" onClick={A.toggleDemo} aria-label="Demo controls"><Gear size={17} /></button>
          {S.screen === 'home' && (
            <button className="iconbtn" onClick={() => A.go('notifications')} aria-label={c.notifications} style={{ position: 'relative' }}>
              <Bell size={17} />
              {S.unreadNotifications > 0 && (
                <span style={{ position: 'absolute', top: 6, right: 7, width: 7, height: 7, borderRadius: 999, background: 'var(--red)' }} />
              )}
            </button>
          )}
        </div>
      </header>

      {/* active screen */}
      <main className="scroll" ref={scrollRef}>
        <div className="screen-wrap" ref={contentRef}>
          <Screen c={c} lang={S.lang} S={S} set={set} A={A} />
        </div>
      </main>

      {showNav && <BottomNav c={c} S={S} A={A} />}

      {/* overlays */}
      {!splashDone && <Splash c={c} onDone={() => setSplashDone(true)} />}
      {S.toast && <Toast msg={S.toast} icon={<Check size={16} />} />}
      {S.showTimeout && <TimeoutModal c={c} A={A} />}
      {S.showDemo && <DemoSheet c={c} S={S} A={A} />}
      {S.showHospitalPicker && <HospitalSheet c={c} S={S} A={A} hospitals={HOSPITALS} />}
    </div>
  );
}

function SegBtn({ on, children, ...p }) {
  const style = on
    ? { border: 'none', background: 'var(--blue)', color: '#fff', fontWeight: 800, borderRadius: 999, padding: '5px 13px', fontSize: 13 }
    : { border: 'none', background: 'transparent', color: 'var(--muted)', fontWeight: 700, borderRadius: 999, padding: '5px 13px', fontSize: 13 };
  return <button aria-pressed={on} style={style} {...p}>{children}</button>;
}
