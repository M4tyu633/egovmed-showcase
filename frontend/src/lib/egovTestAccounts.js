// Keeps eGovPH's sandbox test accounts on screen for the whole widget flow.
//
// The widget renders that panel itself, but only on its first step:
//
//   aside: showTestAccounts && open && state.name === 'identifier' ? <TestAccounts/> : undefined
//
// so it unmounts the instant a mobile number is submitted — which is exactly when a tester needs
// it, because the one-time code and the PIN are on the two screens after that. There is no widget
// option for this (`showTestAccounts` is a plain boolean), so the panel is rebuilt here and kept
// in the modal for every step.
//
// Read off the pinned v1.0.0 bundle: the modal is a Preact portal into document.body under
// `.egov-modal`, with no iframe and no shadow root, so it is ordinary same-document DOM. The
// widget's own panel carries `data-egov-test-accounts`; ours carries `data-egovmed-test-accounts`
// so the two are told apart and never shown at once.

// The five sandbox accounts the widget itself ships (Array.from({length:5}) over +63909000000N).
// Not credentials: they are public fixtures served in the widget bundle, and they only exist on
// the sandbox gateway. `showTestAccounts` is off in a production build, and so is this.
const ACCOUNTS = [1, 2, 3, 4, 5].map((n) => ({ mobile: `+63909000000${n}`, otp: '123456', pin: '000000' }));

const OWN = '[data-egovmed-test-accounts]';
const WIDGETS = '[data-egov-test-accounts]';

// The widget resets its whole subtree from an `@layer egov-armor` block full of `!important`, so a
// plain style attribute loses to it. An inline `!important` outranks a layered one, which is the
// only way to style a node that lives inside that subtree.
const css = (el, styles) => {
  Object.entries(styles).forEach(([prop, value]) => el.style.setProperty(prop, String(value), 'important'));
  return el;
};

const el = (tag, styles, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return css(node, styles);
};

const CELL = { padding: '5px 8px', 'text-align': 'left', 'white-space': 'nowrap', 'font-size': '12px', 'border-bottom': '1px solid #f0f0f0' };

function buildPanel(copy) {
  const root = el('aside', {
    display: 'block',
    width: '100%',
    'box-sizing': 'border-box',
    margin: '4px 0 0',
    padding: '12px 14px',
    background: '#f8fafc',
    border: '1px solid #e5e5e5',
    'border-radius': '12px',
    color: '#171717',
    font: '400 13px/1.45 inherit',
  });
  root.setAttribute('data-egovmed-test-accounts', '');
  root.setAttribute('aria-label', copy.title);

  root.appendChild(el('h3', { margin: '0 0 2px', 'font-size': '14px', 'font-weight': '600', color: '#171717' }, copy.title));
  root.appendChild(el('p', { margin: '0 0 8px', 'font-size': '12px', color: '#737373' }, copy.desc));

  const table = el('table', { width: '100%', 'border-collapse': 'collapse', 'font-size': '12px' });
  const thead = el('thead', {});
  const hrow = el('tr', {});
  [copy.mobile, copy.otp, copy.pin].forEach((label) => {
    hrow.appendChild(el('th', { ...CELL, 'font-weight': '500', color: '#737373', 'border-bottom': '1px solid #e5e5e5' }, label));
  });
  thead.appendChild(hrow);
  table.appendChild(thead);

  const tbody = el('tbody', {});
  ACCOUNTS.forEach((a) => {
    const row = el('tr', {});
    row.appendChild(el('td', { ...CELL, 'font-weight': '600' }, a.mobile));
    row.appendChild(el('td', { ...CELL, color: '#525252' }, a.otp));
    row.appendChild(el('td', { ...CELL, color: '#525252' }, a.pin));
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  root.appendChild(table);

  // The sandbox accounts are mobile-only — the gateway has no email identity behind them — so the
  // Email tab silently rejects every one of these. Saying it here puts the warning on the same
  // card as the numbers it applies to.
  root.appendChild(el('p', { margin: '8px 0 0', 'font-size': '12px', color: '#737373' }, copy.mobileOnly));
  return root;
}

/**
 * Starts watching for the widget's modal and keeps a test-accounts panel inside it.
 * Returns a stop function; call it from the widget's own cleanup so the observer dies with the
 * mount rather than outliving the screen.
 */
export function keepTestAccountsVisible(copy) {
  if (typeof document === 'undefined') return () => {};
  let timer = 0;

  const sync = () => {
    timer = 0;
    const modal = document.querySelector('.egov-modal');
    const mine = document.querySelector(OWN);

    // Modal closed: nothing to attach to, and a leftover panel would be loose in the page.
    if (!modal) { mine?.remove(); return; }

    // On the first step the widget shows its own panel. Two identical tables is worse than none,
    // so ours stands down until that one unmounts.
    if (modal.querySelector(WIDGETS)) { mine?.remove(); return; }

    // The dialog's first child is the white panel that holds the step (a flex column with a gap),
    // so appending there puts the accounts under the field at every width. Falling back to the
    // dialog itself matters only if the widget's internals move in a future pinned version.
    const dialog = modal.querySelector('[role="dialog"]');
    const host = dialog?.firstElementChild || dialog;
    if (!host) return;

    // Preact re-diffs that panel on every step and drops DOM children it does not own, so this
    // re-appends rather than assuming the node survived the last render.
    if (mine && mine.parentElement === host && host.lastElementChild === mine) return;
    const panel = mine || buildPanel(copy);
    panel.remove(); // no-op when it was never attached; detaches it when the step moved it mid-list
    host.appendChild(panel);
  };

  // Coalesced to one DOM write per tick: the widget mutates heavily while an OTP is typed, and an
  // observer that re-inserted on every record would fight its own mutations.
  //
  // A timer, not requestAnimationFrame. rAF does not fire in a backgrounded tab, so a modal opened
  // (or stepped through) while the tab is hidden would come back to the foreground with no panel
  // until something else mutated the DOM. This has no animation to align to; it just needs to run.
  const schedule = () => { if (!timer) timer = setTimeout(sync, 0); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();

  return () => {
    observer.disconnect();
    if (timer) clearTimeout(timer);
    document.querySelector(OWN)?.remove();
  };
}
