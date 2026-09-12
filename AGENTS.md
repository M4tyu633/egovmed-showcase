# eGovMed public demo

The user likes the existing eGovMed design. Preserve its branding, original assets and screen layouts. The current task is to make the public demo work without expired hackathon APIs, with a persistent, accurate demo notice. Do not redesign TUMP or eGovMed as part of the broader portfolio redesign.

All work stays in the current conversation. No delegation, paid APIs or credit resets. Do not modify the original application at `C:/Users/matth/egovmed` or contact external services to simulate transactions.

The offline adapter belongs in `frontend/src/lib/demo.js`; `api.js` routes requests there in demo mode. It must handle the existing request contracts without any network calls. Preserve the original live adapter only as an explicit opt-in configuration. Never mark the offline simulation as real identity verification, payment, SMS delivery, medical inference or a real booking. Use sample data, deterministic behavior and a clear notice. Microphone/camera use is unnecessary in this mode.

Build with `npm run build` in `frontend`. Verify the entire sign-in → symptoms → simulated identity → booking → simulated payment journey, sample records, and navigation. Keep original-source provenance and ongoing status in `C:/Users/matth/portfolio/docs/REDESIGN-STATUS.md` and the research/art-direction document there.
