// English and Tagalog interface copy and demonstration data.
// TL is natural Filipino, not literal. Every UI string must resolve here in both languages.

export const DICT = {
  en: {
    textSize: 'Text size', appTagline: 'Your government health rail',
    signInTitle: 'Sign in to eGovMed', signInSub: 'Use your eGovPH account to continue.',
    signInBtn: 'Sign in with eGovPH', signInSecure: 'Secure single sign-on', signingIn: 'Signing you in…',
    signInError: "We couldn't reach eGovPH. Please try again.",
    ssoCodeExpired: 'This eGovPH sign-in link has already been used or has expired. Generate a new code in the eGovPH portal, then open the link again.',
    ssoCodeReady: 'Your eGovPH sign-in code is ready. Tap Continue with eGovPH to finish signing in.',
    welcomeBack: 'Welcome back!', mpinPrompt: 'Sign in with your eGovPH account', mpinLabel: 'Enter your 6-digit MPIN', clearLabel: 'Clear', forgotMpin: 'Forgot MPIN?', notYou: 'Not you?', switchAccount: 'Switch account', navPay: 'Payments', navMessages: 'Messages', navReport: 'Report', fingerprint: 'Scan your fingerprint', quickAdd: 'Common symptoms, tap to add', featured: 'Featured', featuredTitle: 'Verified labs across hospitals', featuredSub: 'No repeat tests. Your results follow you.',
    featuredTitle2: 'Benefits applied automatically', featuredSub2: 'PhilHealth, White Card, and SSS coverage are deducted before you pay.',
    featuredTitle3: 'SMS updates you can reply to', featuredSub3: 'Booking confirmations text you instantly. Reply right here in the app.',
    greeting: 'Hi', homeSignedInAs: 'Signed in with eGovPH', notifications: 'Notifications',
    startVisit: 'Start a visit', startVisitSub: "Tell us how you feel. We'll guide you.",
    upcoming: 'Upcoming appointment', noAppts: 'No upcoming appointments', noApptsSub: "Start a visit and we'll book one for you.",
    navHome: 'Home', navRecords: 'Records', navHelp: 'Help', navAccount: 'Account',
    stepIntake: 'Step 1 · Symptoms', stepTriage: 'Step 2 · Routing', stepVerify: 'Step 3 · Verify you', stepBook: 'Step 4 · Book', stepPay: 'Payment',
    symptomTitle: 'Describe how you feel', symptomHint: 'You can type or speak, in Tagalog or English.',
    symptomPlaceholder: 'e.g. chest pain and shortness of breath since this morning…',
    micTap: 'Tap to speak', micStop: 'Listening… tap to stop', analyze: 'Analyze symptoms', thinking: 'Finding the right department…',
    symptomSafety: 'In an emergency, call 911 or go to the nearest ER right away.',
    triageTitle: 'Suggested next step', deptLabel: 'Suggested department', triageWhy: 'Why this suggestion',
    reportedSymptoms: 'You reported', specialtyMatch: 'Best matched with',
    triageDisclaimer: 'A nurse will confirm this. This is not a diagnosis.',
    uRoutine: 'Routine', uUrgent: 'Urgent', uEmergency: 'Emergency', continue: 'Continue',
    emergencyTitle: 'Seek help now', emergencyBanner: 'This may be urgent. Please go to the nearest emergency room or call for help now.',
    callER: 'Call 911', findER: 'Find nearest ER', emgDemoContinue: 'This is a demo, continue the flow',
    consentTitle: "Verify it's you", consentSub: (hospital) => `To book with ${hospital}, we'll verify your identity with your National ID (PhilSys).`,
    consentDecline: 'Not now', consentAccept: 'I agree, verify me',
    livenessLook: 'Look at the camera', livenessHold: 'Hold still…', livenessVerifying: 'Verifying your identity…',
    livenessSubLook: 'Keep your face inside the circle.',
    // Shown when the patient closes the eVerify face-check window themselves — a choice, not a failure.
    livenessCancelled: 'Face check closed', livenessCancelledSub: 'You closed the face check before it finished. Nothing was verified yet.',
    livenessTryAgain: 'Try again',
    // Shown when the page is open inside a chat app's built-in browser, which blocks the camera.
    livenessBlocked: 'Open this in your browser',
    livenessBlockedSub: (app) => `${app} opens links in its own browser, and that browser can't use the camera. Open eGovMed in Safari or Chrome to finish the face check.`,
    livenessBlockedHow: 'Tap the ••• menu at the top, then "Open in browser".',
    livenessCopyLink: 'Copy link', livenessLinkCopied: 'Link copied', livenessTryAnyway: 'Try anyway',
    livenessCopyFailed: "This browser won't let us copy. Press and hold the link above to copy it.",
    verified: 'Identity verified', verifiedSub: "You're all set. Let's book your appointment.",
    bookTitle: 'Book your appointment', deptPre: 'Department', pickSlot: 'Choose a time',
    loadingSlots: 'Finding available slots…', confirmBook: 'Confirm booking', booking: 'Booking your slot…',
    confirmTitle: "You're booked", refLabel: 'Reference number', prep: 'Before your visit',
    texted: "We've texted this to you", goPay: 'Continue to payment', backHome: 'Back to home',
    addAnotherDept: '+ Add another department', pickDeptTitle: 'Which other department?',
    removeDept: 'Remove', confirmBookN: (n) => (n > 1 ? `Confirm ${n} bookings` : 'Confirm booking'),
    bookingN: (n) => (n > 1 ? `Booking your ${n} slots…` : 'Booking your slot…'),
    multiApptNote: "You're booking more than one appointment. Each gets its own queue number and reference.",
    payTitle: 'Payment', billFor: 'Consultation, Cardiology', benefits: 'Benefits applied', mockTag: 'demo · pending integration',
    balance: 'Amount to pay', payChannelTitle: 'Pay with', payNow: 'Pay now', processing: 'Processing payment…',
    payHostedNote: "You'll finish paying on eGovPay's secure page next. Tap your payment method there (e.g. Cash Payments), then Pay Now.",
    payRedirecting: 'Taking you to eGovPay…',
    settled: 'Payment settled', settledSub: 'A receipt has been texted to you.',
    paymentsTitle: 'Payments', paymentsUnpaidSection: 'Needs payment', paymentsHistorySection: 'Payment history',
    paymentsNoUnpaid: 'Nothing due right now', paymentsNoHistory: 'No payments yet',
    paymentsHistorySub: "Past payments made through eGovPay.", paymentsRef: 'Ref',
    recordsTitle: 'Records & lab results', recordsSub: 'Results shared and verified across hospitals, no repeat labs.',
    verifiedBadge: 'Verified', notVerifiedBadge: 'Not verified', verifiedFrom: 'Verified from', paidBadge: 'Paid',
    uploadRecord: 'Upload record', uploadRecordFile: 'File', uploadRecordChoose: 'Choose file', uploadRecordChosen: 'file selected',
    uploadRecordTitle: 'Record name', uploadRecordTitlePh: 'e.g. Chest X-ray', uploadRecordType: 'Type',
    uploadRecordSource: 'Where is this from?', uploadRecordSourcePh: 'e.g. St. Luke’s Medical Center',
    uploadRecordSave: 'Save record', uploadRecordSaving: 'Saving…', uploadRecordCancel: 'Cancel',
    uploadRecordNeedFile: 'Choose a file first', uploadRecordNeedTitle: 'Give the record a name',
    uploadRecordTitleTooShort: 'Record name must be at least 2 characters', uploadRecordSourceTooShort: 'Facility name must be at least 2 characters',
    uploadRecordError: 'Could not save this record', uploadRecordDone: 'Record added',
    recordsLockedTitle: 'Verify your identity to see your records',
    recordsLockedBody: 'Your lab results and hospital records stay locked until eGovPH confirms it is you. The check takes about a minute.',
    recordsLockedAction: 'Verify my identity',
    recordsLockedBackToRecords: 'Back to records',
    recordsLockedDeclined: 'Your records stay locked until you verify your identity',
    recordTypeLab: 'Lab result', recordTypeImaging: 'Imaging', recordTypePrescription: 'Prescription', recordTypeOther: 'Other',
    messagesTitle: 'Messages', messagesSub: 'Confirmations, reminders, and results from eGovMed.',
    messagesIntro: 'Your health updates in one place', messagesIntroSub: 'We keep only delivery history here, never the private text sent to you.',
    messagesLoading: 'Loading messages…', messagesError: 'We could not load your messages.', messagesEmpty: 'No messages yet', messagesEmptySub: 'Booking confirmations and reminders will appear here.',
    messageConfirmation: 'Appointment confirmed', messageReminder: 'Appointment reminder', messageResultsReady: 'Results ready', messageGeneric: 'eGovMed update',
    messageReplySent: 'Message sent', messageStaffAck: 'PGH replied',
    notificationsTitle: 'Notifications', notificationsSub: 'In-app updates from eGovMed: uploads, benefits, payments, and reports.',
    notificationsLoading: 'Loading notifications…', notificationsEmpty: 'No notifications yet', notificationsEmptySub: 'Uploads, benefit changes, payments, and reports will appear here.',
    notifRecordUploaded: 'Record uploaded', notifBenefitAdded: 'Benefit added', notifPaymentConfirmed: 'Payment confirmed', notifReportFiled: 'Report filed', notifAppointmentUpcoming: 'Appointment coming up',
    replyPlaceholder: 'Type a message…', replySend: 'Send', replySending: 'PGH Patient Services is replying…', replySyncing: 'Still syncing this message, try again in a moment.',
    replyDemoBanner: 'Demo · replies do not reach hospital staff yet. Do not use for urgent medical concerns. Call 911 for emergencies.',
    channelSms: 'SMS', channelEmail: 'Email', channelInApp: 'In-app',
    accountTitle: 'Account', accountSub: 'Your verified profile, benefits, and preferences.', accountProfile: 'Profile', accountBenefits: 'Benefits', accountPreferences: 'Preferences',
    accountLoading: 'Loading your account…', accountError: 'We could not load your account.', accountSignInAgain: 'Sign in again',
    benefitOn: 'Active', benefitOff: 'Not active', benefitAdd: 'Add', benefitAdding: 'Adding…', benefitComingSoon: 'Coming soon', benefitAddCta: 'Add a benefit', benefitsNone: 'No benefits added yet.', benefitCatalogEmpty: 'You’ve added every available benefit.', benefitCovered: 'Already covered', benefitRemove: 'Remove', languageLabel: 'Language', textSizeLabel: 'Text size', notAvailable: 'Not provided',
    contactEdit: 'Edit', contactSave: 'Save', contactSaving: 'Saving…', contactCancel: 'Cancel',
    fullNameLabel: 'Full name', fullNamePlaceholder: 'Juan Santos Dela Cruz',
    // Shown for a one-word entry too, which is why it asks for both parts rather than just
    // saying the field is required.
    fullNameInvalid: 'Enter a first and last name using letters only.',
    birthDateLabel: 'Date of birth', birthDateInvalid: 'Use YYYY-MM-DD', phoneLabel: 'Phone', phonePlaceholder: '+63 917 000 0000',
    phoneInvalid: 'Enter a Philippine mobile like 09171234567 or +639171234567.',
    phoneMissingHint: 'Add your mobile number so we can text you booking confirmations and reminders.',
    emailLabel: 'Email', emailPlaceholder: 'you@example.com',
    emailInvalid: 'Enter a valid email address.',
    contactSaved: 'Contact updated', contactSaveError: "We couldn't save that, please try again.",
    // First-run splash + the "Not you?" profile setup it hands over to on the sign-in screen.
    splashLoading: 'Loading eGovMed…',
    switchAccountTitle: 'Set your details',
    switchAccountSub: 'Change the name and mobile number on this profile to your own. You can edit them again later in Account.',
    fullNameLabel: 'Full name', fullNamePlaceholder: 'Juan Dela Cruz',
    fullNameInvalid: 'Enter a first name and a last name.',
    profileSetupLoading: 'Getting this profile…',
    profileSetupOffline: "We couldn't load the current details. You can still type your own.",
    accountAbout: 'eGovMed is a government health rail built on eGovPH. Pilot: Philippine General Hospital.',
    reportTitle: 'Report an issue', reportSub: "Tell us what went wrong. You'll get a case number to track it.",
    reportCatLabel: 'What is this about?', descLabel: 'What happened?', descPlaceholder: 'Describe the issue in your own words…',
    // {phone} is filled from the mask the server derives from the patient's own number on file.
    // It used to be a hardcoded "•••• 4567" that belonged to nobody.
    submitReport: 'Submit report', reportCategoryRequired: 'Choose a category first.', reportDescriptionTooShort: 'Describe the issue in at least a few words.', otpTitle: 'Enter the code', otpSub: 'We texted a 6-digit code to {phone}.',
    otpSending: 'Texting you a 6-digit code…', otpVerifying: 'Verifying…',
    // Mock mode only — no SMS actually left the server, so the code is shown instead.
    otpMockHint: 'Mock SMS mode — your code is {code}',
    resendPrefix: 'Resend code in', resendReady: 'Resend code', resendSent: 'We texted you a new code',
    verifyOtp: 'Verify', caseTitle: 'Report filed', caseLabel: 'Case number',
    escalation: 'If unresolved in 48 hours, it escalates automatically.',
    reportTrackLink: 'Check an existing report',
    trackTitle: 'Your reports', trackSub: 'Pick one of your reports, or enter a case number.',
    myReportsLabel: 'Your reports', myReportsLoadingText: 'Loading your reports…',
    myReportsEmpty: 'You have not filed any reports yet.',
    trackManualLabel: 'Or enter a case number',
    caseNumberLabel: 'Case number', caseNumberPlaceholder: 'e.g. PFM-073026-0014',
    trackButton: 'Find report', trackChecking: 'Checking…',
    trackInvalid: 'Enter a valid case number, e.g. PFM-073026-0014.',
    trackNotFound: "We couldn't find a report with that case number.",
    trackAnother: 'Check another case',
    filedOnLabel: 'Filed',
    // We hold a case number, not the government's queue — say exactly that. eReport only releases
    // case status to the complainant after its own email OTP, so eGovMed cannot mirror it here.
    trackUpstreamNote: 'This is your eGovMed record. Updates from the government are sent to your email by eReport — use your case number there to see the latest status.',
    statusOpen: 'Filed', statusEscalated: 'Escalated',
    chooseHospital: 'Choose a hospital', changeHospital: 'Change', hospitalPickerTitle: 'Choose a hospital',
    timeoutTitle: 'Still there?', timeoutSub: "For your privacy, we'll sign you out soon.", stayIn: 'Stay signed in', logout: 'Log out',
  },
  tl: {
    textSize: 'Laki ng teksto', appTagline: 'Ang inyong serbisyong pangkalusugan ng gobyerno',
    signInTitle: 'Mag-sign in sa eGovMed', signInSub: 'Gamitin ang iyong eGovPH account para magpatuloy.',
    signInBtn: 'Mag-sign in gamit ang eGovPH', signInSecure: 'Ligtas na single sign-on', signingIn: 'Sini-sign in ka…',
    signInError: 'Hindi ma-abot ang eGovPH. Pakisubukang muli.',
    ssoCodeExpired: 'Nagamit na o nag-expire na ang eGovPH sign-in link na ito. Kumuha ng bagong code sa eGovPH portal, tapos buksan ulit ang link.',
    ssoCodeReady: 'Handa na ang iyong eGovPH sign-in code. I-tap ang Continue with eGovPH para makumpleto ang pag-sign in.',
    welcomeBack: 'Maligayang pagbabalik!', mpinPrompt: 'Mag-sign in gamit ang iyong eGovPH account', mpinLabel: 'Ilagay ang 6-digit MPIN', clearLabel: 'I-clear', forgotMpin: 'Nakalimutan ang MPIN?', notYou: 'Hindi ikaw?', switchAccount: 'Palitan ang account', navPay: 'Bayad', navMessages: 'Mensahe', navReport: 'Ulat', fingerprint: 'I-scan ang fingerprint', quickAdd: 'Karaniwang sintomas, pindutin para idagdag', featured: 'Featured', featuredTitle: 'Verified labs sa mga ospital', featuredSub: 'Walang paulit-ulit na test. Kasama mo ang resulta.',
    featuredTitle2: 'Awtomatikong nailalapat ang benepisyo', featuredSub2: 'Ibinabawas na ang saklaw ng PhilHealth, White Card, at SSS bago ka magbayad.',
    featuredTitle3: 'SMS updates na masasagot mo', featuredSub3: 'Agad kang ma-tetext pag kumpirmado ang booking. Sumagot dito mismo sa app.',
    greeting: 'Kumusta', homeSignedInAs: 'Naka-sign in gamit ang eGovPH', notifications: 'Mga abiso',
    startVisit: 'Magsimula ng konsulta', startVisitSub: 'Sabihin ang nararamdaman. Gagabayan ka namin.',
    upcoming: 'Nakatakdang appointment', noAppts: 'Walang nakatakdang appointment', noApptsSub: 'Magsimula ng konsulta at ibo-book namin ito.',
    navHome: 'Home', navRecords: 'Rekord', navHelp: 'Tulong', navAccount: 'Account',
    stepIntake: 'Hakbang 1 · Sintomas', stepTriage: 'Hakbang 2 · Routing', stepVerify: 'Hakbang 3 · I-verify', stepBook: 'Hakbang 4 · Book', stepPay: 'Bayad',
    symptomTitle: 'Ilarawan ang nararamdaman', symptomHint: 'Maaari kang mag-type o magsalita, sa Tagalog o Ingles.',
    symptomPlaceholder: 'hal. sumasakit ang dibdib at hirap huminga mula kaninang umaga…',
    micTap: 'Pindutin para magsalita', micStop: 'Nakikinig… pindutin para itigil', analyze: 'Suriin ang sintomas', thinking: 'Hinahanap ang tamang departamento…',
    symptomSafety: 'Sa emergency, tumawag sa 911 o pumunta agad sa pinakamalapit na ER.',
    triageTitle: 'Iminungkahing hakbang', deptLabel: 'Iminungkahing departamento', triageWhy: 'Bakit ito iminungkahi',
    reportedSymptoms: 'Iniulat mo', specialtyMatch: 'Pinakabagay sa',
    triageDisclaimer: 'Ico-confirm ito ng isang nurse. Hindi ito diagnosis.',
    uRoutine: 'Rutinaryo', uUrgent: 'Kagyat', uEmergency: 'Emergency', continue: 'Magpatuloy',
    emergencyTitle: 'Humingi ng tulong ngayon', emergencyBanner: 'Maaaring kagyat ito. Pumunta agad sa pinakamalapit na emergency room o tumawag ng tulong ngayon.',
    callER: 'Tumawag sa 911', findER: 'Hanapin ang pinakamalapit na ER', emgDemoContinue: 'Demo ito, ituloy ang flow',
    consentTitle: 'Patunayan na ikaw nga', consentSub: (hospital) => `Para mag-book sa ${hospital}, ipapatunay namin ang iyong pagkakakilanlan gamit ang National ID (PhilSys).`,
    consentDecline: 'Hindi muna', consentAccept: 'Sang-ayon ako, i-verify ako',
    livenessLook: 'Tumingin sa camera', livenessHold: 'Wag gagalaw…', livenessVerifying: 'Vine-verify ang pagkakakilanlan…',
    livenessSubLook: 'Panatilihin ang mukha sa loob ng bilog.',
    livenessCancelled: 'Isinara ang face check', livenessCancelledSub: 'Isinara mo ang face check bago ito matapos. Wala pang na-verify.',
    livenessTryAgain: 'Subukan ulit',
    livenessBlocked: 'Buksan ito sa iyong browser',
    livenessBlockedSub: (app) => `Sa sariling browser ng ${app} binubuksan ang mga link, at hindi magamit ng browser na iyon ang camera. Buksan ang eGovMed sa Safari o Chrome para matapos ang face check.`,
    livenessBlockedHow: 'I-tap ang ••• sa itaas, tapos "Open in browser".',
    livenessCopyLink: 'Kopyahin ang link', livenessLinkCopied: 'Nakopya ang link', livenessTryAnyway: 'Subukan pa rin',
    livenessCopyFailed: 'Hindi pinapayagan ng browser na ito ang pagkopya. Pindutin nang matagal ang link sa itaas para makopya.',
    verified: 'Napatunayan ang pagkakakilanlan', verifiedSub: 'Handa ka na. I-book na natin ang appointment mo.',
    bookTitle: 'I-book ang appointment', deptPre: 'Departamento', pickSlot: 'Pumili ng oras',
    loadingSlots: 'Naghahanap ng bakanteng oras…', confirmBook: 'Kumpirmahin ang booking', booking: 'Bino-book ang iyong oras…',
    confirmTitle: 'Naka-book ka na', refLabel: 'Reference number', prep: 'Bago ang iyong konsulta',
    texted: 'Ipinadala namin ito sa iyong SMS', goPay: 'Magpatuloy sa bayad', backHome: 'Bumalik sa home',
    addAnotherDept: '+ Magdagdag ng ibang departamento', pickDeptTitle: 'Aling ibang departamento?',
    removeDept: 'Alisin', confirmBookN: (n) => (n > 1 ? `Kumpirmahin ang ${n} bookings` : 'Kumpirmahin ang booking'),
    bookingN: (n) => (n > 1 ? `Bino-book ang iyong ${n} na oras…` : 'Bino-book ang iyong oras…'),
    multiApptNote: 'Mag-book ka ng higit sa isang appointment. May sariling queue number at reference number ang bawat isa.',
    payTitle: 'Bayad', billFor: 'Konsulta, Cardiology', benefits: 'Mga benepisyong inilapat', mockTag: 'demo · nakabinbing integration',
    balance: 'Halagang babayaran', payChannelTitle: 'Magbayad gamit ang', payNow: 'Magbayad', processing: 'Pinoproseso ang bayad…',
    payHostedNote: 'Tatapusin mo ang bayad sa secure na page ng eGovPay. Pindutin doon ang paraan ng bayad (hal. Cash Payments), tapos Pay Now.',
    payRedirecting: 'Dinadala ka sa eGovPay…',
    settled: 'Nabayaran na', settledSub: 'Ipinadala ang resibo sa iyong SMS.',
    paymentsTitle: 'Mga Bayad', paymentsUnpaidSection: 'Kailangang bayaran', paymentsHistorySection: 'Kasaysayan ng bayad',
    paymentsNoUnpaid: 'Wala pang dapat bayaran', paymentsNoHistory: 'Wala pang bayad',
    paymentsHistorySub: 'Mga nakaraang bayad gamit ang eGovPay.', paymentsRef: 'Ref',
    recordsTitle: 'Rekord at resulta ng lab', recordsSub: 'Ibinabahagi at ni-verify sa iba’t ibang ospital, walang paulit-ulit na lab.',
    verifiedBadge: 'Verified', notVerifiedBadge: 'Hindi pa verified', verifiedFrom: 'Verified mula sa', paidBadge: 'Bayad na',
    uploadRecord: 'Mag-upload ng rekord', uploadRecordFile: 'File', uploadRecordChoose: 'Pumili ng file', uploadRecordChosen: 'file ang napili',
    uploadRecordTitle: 'Pangalan ng rekord', uploadRecordTitlePh: 'hal. Chest X-ray', uploadRecordType: 'Uri',
    uploadRecordSource: 'Saan ito galing?', uploadRecordSourcePh: 'hal. St. Luke’s Medical Center',
    uploadRecordSave: 'I-save ang rekord', uploadRecordSaving: 'Sine-save…', uploadRecordCancel: 'Kanselahin',
    uploadRecordNeedFile: 'Pumili muna ng file', uploadRecordNeedTitle: 'Bigyan ng pangalan ang rekord',
    uploadRecordTitleTooShort: 'Dapat hindi bababa sa 2 characters ang pangalan ng rekord', uploadRecordSourceTooShort: 'Dapat hindi bababa sa 2 characters ang pangalan ng facility',
    uploadRecordError: 'Hindi ma-save ang rekord na ito', uploadRecordDone: 'Naidagdag ang rekord',
    recordsLockedTitle: 'I-verify ang iyong pagkakakilanlan para makita ang rekord',
    recordsLockedBody: 'Naka-lock ang iyong lab results at rekord sa ospital hangga’t hindi kinukumpirma ng eGovPH na ikaw nga. Mga isang minuto lang ang pagsusuri.',
    recordsLockedAction: 'I-verify ang aking pagkakakilanlan',
    recordsLockedBackToRecords: 'Bumalik sa mga rekord',
    recordsLockedDeclined: 'Mananatiling naka-lock ang iyong rekord hangga’t hindi ka nagpa-verify',
    recordTypeLab: 'Resulta ng lab', recordTypeImaging: 'Imaging', recordTypePrescription: 'Reseta', recordTypeOther: 'Iba pa',
    messagesTitle: 'Mga mensahe', messagesSub: 'Mga kumpirmasyon, paalala, at resulta mula sa eGovMed.',
    messagesIntro: 'Lahat ng health update, nasa iisang lugar', messagesIntroSub: 'History ng pagpapadala lang ang naka-save dito, hindi ang pribadong mensaheng ipinadala sa iyo.',
    messagesLoading: 'Kinukuha ang mga mensahe…', messagesError: 'Hindi ma-load ang iyong mga mensahe.', messagesEmpty: 'Wala pang mensahe', messagesEmptySub: 'Dito lalabas ang kumpirmasyon ng booking at mga paalala.',
    messageConfirmation: 'Kumpirmado ang appointment', messageReminder: 'Paalala sa appointment', messageResultsReady: 'Handa na ang resulta', messageGeneric: 'Update mula sa eGovMed',
    messageReplySent: 'Naipadala ang mensahe', messageStaffAck: 'Sumagot ang PGH',
    notificationsTitle: 'Mga Abiso', notificationsSub: 'Mga in-app update mula sa eGovMed: pag-upload, benepisyo, bayad, at report.',
    notificationsLoading: 'Kinukuha ang mga abiso…', notificationsEmpty: 'Wala pang abiso', notificationsEmptySub: 'Dito lalabas ang pag-upload, pagbabago sa benepisyo, bayad, at report.',
    notifRecordUploaded: 'Na-upload ang rekord', notifBenefitAdded: 'Idinagdag ang benepisyo', notifPaymentConfirmed: 'Nakumpirma ang bayad', notifReportFiled: 'Naisumite ang report', notifAppointmentUpcoming: 'Paparating na ang appointment',
    replyPlaceholder: 'Mag-type ng mensahe…', replySend: 'Ipadala', replySending: 'Sumasagot ang PGH Patient Services…', replySyncing: 'Sini-sync pa ang mensaheng ito, subukang muli sandali.',
    replyDemoBanner: 'Demo · hindi pa umaabot sa staff ng ospital ang mga sagot. Huwag gamitin para sa mga urgent na medikal na alalahanin. Tumawag ng 911 kung emergency.',
    channelSms: 'SMS', channelEmail: 'Email', channelInApp: 'Sa app',
    accountTitle: 'Account', accountSub: 'Iyong verified profile, mga benepisyo, at preferences.', accountProfile: 'Profile', accountBenefits: 'Mga benepisyo', accountPreferences: 'Preferences',
    accountLoading: 'Kinukuha ang iyong account…', accountError: 'Hindi ma-load ang iyong account.', accountSignInAgain: 'Mag-sign in muli',
    benefitOn: 'Aktibo', benefitOff: 'Hindi aktibo', benefitAdd: 'Idagdag', benefitAdding: 'Idinaragdag…', benefitComingSoon: 'Malapit na', benefitAddCta: 'Magdagdag ng benepisyo', benefitsNone: 'Wala pang naidagdag na benepisyo.', benefitCatalogEmpty: 'Naidagdag mo na ang lahat ng available na benepisyo.', benefitCovered: 'Nasakop na', benefitRemove: 'Alisin', languageLabel: 'Wika', textSizeLabel: 'Laki ng teksto', notAvailable: 'Walang inilagay',
    contactEdit: 'I-edit', contactSave: 'I-save', contactSaving: 'Sine-save…', contactCancel: 'Kanselahin',
    fullNameLabel: 'Buong pangalan', fullNamePlaceholder: 'Juan Santos Dela Cruz',
    fullNameInvalid: 'Maglagay ng pangalan at apelyido, mga letra lamang.',
    birthDateLabel: 'Petsa ng kapanganakan', birthDateInvalid: 'Gamitin ang YYYY-MM-DD', phoneLabel: 'Numero ng telepono', phonePlaceholder: '+63 917 000 0000',
    phoneInvalid: 'Maglagay ng PH mobile katulad ng 09171234567 o +639171234567.',
    phoneMissingHint: 'Ilagay ang iyong mobile number para makatanggap ng SMS confirmations at paalala.',
    emailLabel: 'Email', emailPlaceholder: 'ikaw@halimbawa.com',
    emailInvalid: 'Maglagay ng wastong email address.',
    contactSaved: 'Nai-update ang contact', contactSaveError: 'Hindi na-save, pakisubukang muli.',
    splashLoading: 'Binubuksan ang eGovMed…',
    switchAccountTitle: 'Itakda ang iyong detalye',
    switchAccountSub: 'Palitan ang pangalan at mobile number sa profile na ito para maging sa iyo. Puwede mo pa itong baguhin sa Account.',
    fullNameLabel: 'Buong pangalan', fullNamePlaceholder: 'Juan Dela Cruz',
    fullNameInvalid: 'Maglagay ng pangalan at apelyido.',
    profileSetupLoading: 'Kinukuha ang profile na ito…',
    profileSetupOffline: 'Hindi ma-load ang kasalukuyang detalye. Puwede mo pa ring i-type ang sa iyo.',
    accountAbout: 'Ang eGovMed ay serbisyong pangkalusugan ng gobyerno na binuo sa eGovPH. Pilot: Philippine General Hospital.',
    reportTitle: 'Mag-ulat ng problema', reportSub: 'Sabihin kung ano ang nangyari. Bibigyan ka ng case number para masubaybayan.',
    reportCatLabel: 'Tungkol saan ito?', descLabel: 'Ano ang nangyari?', descPlaceholder: 'Ilarawan ang problema sa iyong sariling salita…',
    submitReport: 'Isumite ang ulat', reportCategoryRequired: 'Pumili muna ng kategorya.', reportDescriptionTooShort: 'Ilarawan ang isyu sa ilang salita man lang.', otpTitle: 'Ilagay ang code', otpSub: 'Nagpadala kami ng 6-digit code sa {phone}.',
    otpSending: 'Ipinapadala ang 6-digit code…', otpVerifying: 'Bini-verify…',
    otpMockHint: 'Mock SMS mode — ang code mo ay {code}',
    resendPrefix: 'Magpadala muli sa', resendReady: 'Magpadala muli', resendSent: 'May bago kaming ipinadalang code',
    verifyOtp: 'I-verify', caseTitle: 'Naisumite ang ulat', caseLabel: 'Case number',
    escalation: 'Kung hindi maresolba sa loob ng 48 oras, awtomatikong ie-escalate.',
    reportTrackLink: 'Tingnan ang naisumiteng ulat',
    trackTitle: 'Mga ulat mo', trackSub: 'Pumili sa mga ulat mo, o maglagay ng case number.',
    myReportsLabel: 'Mga ulat mo', myReportsLoadingText: 'Kinukuha ang mga ulat mo…',
    myReportsEmpty: 'Wala ka pang naisumiteng ulat.',
    trackManualLabel: 'O maglagay ng case number',
    caseNumberLabel: 'Case number', caseNumberPlaceholder: 'hal. PFM-073026-0014',
    trackButton: 'Hanapin ang ulat', trackChecking: 'Tinitingnan…',
    trackInvalid: 'Maglagay ng wastong case number, hal. PFM-073026-0014.',
    trackNotFound: 'Walang nahanap na ulat sa case number na iyan.',
    trackAnother: 'Tingnan ang ibang case',
    filedOnLabel: 'Naisumite',
    trackUpstreamNote: 'Ito ang tala ng eGovMed. Ang mga update mula sa gobyerno ay ipinapadala ng eReport sa email mo — gamitin ang case number mo doon para makita ang pinakabagong status.',
    statusOpen: 'Naisumite', statusEscalated: 'Na-escalate',
    chooseHospital: 'Pumili ng ospital', changeHospital: 'Palitan', hospitalPickerTitle: 'Pumili ng ospital',
    timeoutTitle: 'Nandiyan ka pa ba?', timeoutSub: 'Para sa iyong privacy, mala-log out ka na sa ilang sandali.', stayIn: 'Manatiling naka-sign in', logout: 'Mag-log out',
  },
};

export const WHY = {
  en: ['Symptoms mention chest pain', 'Best matched to heart & circulation care'],
  tl: ['Binanggit ang pananakit ng dibdib', 'Pinakabagay sa pangangalaga ng puso'],
};
export const PREP = {
  en: ['Bring your National ID', 'Arrive 15 minutes early', 'No fasting required for this visit'],
  tl: ['Dalhin ang iyong National ID', 'Dumating 15 minuto nang maaga', 'Hindi kailangang mag-fasting'],
};
export const CATS = {
  en: ['Wrong routing', 'Billing', 'Access', 'Misconduct', 'Technical'],
  tl: ['Maling routing', 'Singil', 'Access', 'Maling asal', 'Teknikal'],
};
export const SLOTS = {
  en: [['Today · 2:30 PM', 'Cardiology', false], ['Tomorrow · 9:00 AM', 'Cardiology', false], ['Tomorrow · 11:15 AM', 'Cardiology', true], ['Fri · 3:45 PM', 'Cardiology', false]],
  tl: [['Ngayon · 2:30 PM', 'Cardiology', false], ['Bukas · 9:00 AM', 'Cardiology', false], ['Bukas · 11:15 AM', 'Cardiology', true], ['Biyernes · 3:45 PM', 'Cardiology', false]],
};
// Day labels used when generating a fresh, randomized batch of slots (index 0/1 stay
// "Today"/"Tomorrow", further-out days cycle through short weekday names).
const SLOT_DAYS = {
  en: ['Today', 'Tomorrow', 'Wed', 'Thu', 'Fri', 'Sat'],
  tl: ['Ngayon', 'Bukas', 'Miy', 'Huw', 'Biy', 'Sab'],
};
function randomTime() {
  const hour = 8 + Math.floor(Math.random() * 9); // 8am – 4pm start hours
  const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)];
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const period = hour < 12 ? 'AM' : 'PM';
  return { minutesFromMidnight: hour * 60 + minute, label: `${h12}:${String(minute).padStart(2, '0')} ${period}` };
}
// Generates a fresh set of plausible-looking appointment slots (used so the
// "Choose a time" list doesn't show the exact same demo data on every visit).
// Each slot is [label, dept, disabled, scheduledForISO] — the 4th element is a real
// date/time (today + dayIdx, at the picked hour/minute) so a booking can actually tell
// the backend when it's for, which is what makes the "appointment upcoming" reminder
// notification (see App.jsx's reminder effect) fire correctly instead of never firing.
export function randomSlots(lang, dept) {
  const days = SLOT_DAYS[lang] || SLOT_DAYS.en;
  const seen = new Set();
  const picks = [];
  while (picks.length < 4) {
    const dayIdx = Math.floor(Math.random() * 4); // keep within "Today" .. 4 days out
    const t = randomTime();
    const key = `${dayIdx}-${t.minutesFromMidnight}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push({ dayIdx, ...t });
  }
  picks.sort((a, b) => (a.dayIdx - b.dayIdx) || (a.minutesFromMidnight - b.minutesFromMidnight));
  const disabledAt = Math.floor(Math.random() * picks.length);
  return picks.map((p, i) => {
    const when = new Date();
    when.setDate(when.getDate() + p.dayIdx);
    when.setHours(Math.floor(p.minutesFromMidnight / 60), p.minutesFromMidnight % 60, 0, 0);
    return [`${days[p.dayIdx]} · ${p.label}`, dept, i === disabledAt, when.toISOString()];
  });
}
export const RECORDS = {
  en: [['Complete Blood Count', '12 Jun 2026', 'St. Luke’s Medical Center'], ['Lipid Panel', '03 May 2026', 'Makati Medical Center'], ['ECG Report', '21 Apr 2026', 'Philippine Heart Center']],
  tl: [['Complete Blood Count', '12 Hun 2026', 'St. Luke’s Medical Center'], ['Lipid Panel', '03 Mayo 2026', 'Makati Medical Center'], ['ECG Report', '21 Abr 2026', 'Philippine Heart Center']],
};
// Pilot + a handful of major PH hospitals patients can route a booking to.
export const HOSPITALS = [
  'Philippine General Hospital',
  "St. Luke's Medical Center",
  'Makati Medical Center',
  'Philippine Heart Center',
  'East Avenue Medical Center',
  'Vicente Sotto Memorial Medical Center',
  'Davao Regional Medical Center',
  'Baguio General Hospital',
];
// (TRACK / TRACKNOTE removed: the 4-step "Received → Under review → Assigned → Resolved" tracker
// showed progress eGovMed never learns. eReport releases case status only to the complainant,
// behind its own email OTP, so those steps were animation rather than fact.)
// Kept in sync with SPECIALTIES in backend/src/integrations/egovAi.js. Used when a patient
// wants to book more than one department in the same visit (e.g. General Medicine + Cardiology).
export const SPECIALTIES = [
  'General Medicine', 'Cardiology', 'Pulmonology', 'Neurology', 'Gastroenterology',
  'Orthopedics', 'Pediatrics', 'OB-GYN', 'Dermatology', 'ENT', 'Ophthalmology',
  'Psychiatry', 'Emergency Medicine', 'Surgery',
];
export const CHIPS = {
  en: ['Fever', 'Cough', 'Chest pain', 'Headache', 'Dizziness', 'Stomach pain', 'Skin rash'],
  tl: ['Lagnat', 'Ubo', 'Sakit ng dibdib', 'Sakit ng ulo', 'Hilo', 'Sakit ng tiyan', 'Pantal sa balat'],
};
export const CONSENT_POINTS = {
  en: ['We check your National ID with PhilSys eVerify.', 'Only your name and ID status are shared with PGH.', 'Your symptoms stay private to your care team.'],
  tl: ['Sinusuri ang National ID mo sa PhilSys eVerify.', 'Pangalan at status lang ang ibabahagi sa PGH.', 'Pribado sa iyong care team ang iyong sintomas.'],
};
export const PAY_ITEMS = {
  en: [{ label: 'Consultation, Cardiology', amount: '₱600' }, { label: 'Facility fee', amount: '₱150' }],
  tl: [{ label: 'Konsulta, Cardiology', amount: '₱600' }, { label: 'Facility fee', amount: '₱150' }],
};
export const BENEFIT_LINES = {
  en: [{ label: 'PhilHealth', amount: '−₱300' }, { label: 'PWD / Senior 20%', amount: '−₱150' }],
  tl: [{ label: 'PhilHealth', amount: '−₱300' }, { label: 'PWD / Senior 20%', amount: '−₱150' }],
};
// [abbr, name, iconBg, iconColor]
export const CHANNELS = [
  ['GC', 'GCash', '#eaf1fe', '#0f52d9'],
  ['MB', 'Maya', '#e2f4f2', '#0e8c86'],
  ['CT', 'Debit / Credit card', '#f1eefb', '#5b3fd6'],
];

// Fixed demo constants from the prototype.
export const CONST = {
  balance: '₱300',
  refNo: 'PGH-4821-QK',
  hospital: 'Philippine General Hospital',
  dept: 'Cardiology',
  caseNo: 'EGM-2026-000417',
};
