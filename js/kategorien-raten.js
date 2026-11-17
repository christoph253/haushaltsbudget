// Kategorie anhand von Händlernamen/Text raten. Zuerst zählt, was Diana früher gewählt hat.

const AUSGABE_REGELN = [
  ['Lebensmittel', /rewe|edeka|aldi|lidl|penny|netto|kaufland|norma|globus|tegut|real\b|marktkauf|famila|nahkauf|bäcker|baecker|metzger|backwerk|supermarkt|hit markt|denns|alnatura|bio company/i],
  ['Drogerie', /\bdm\b|dm-drogerie|dm drogerie|rossmann|m[uü]ller drog|budni|drogerie/i],
  ['Tanken/Mobilität', /aral|shell|esso|\bjet\b|total ?energies|tankstelle|agip|avia|star tank|\bomv\b|db vertrieb|deutsche bahn|bahn\.de|\bdb\b|flixbus|\bmvv\b|\bhvv\b|\bbvg\b|\bvrr\b|parken|parkhaus|uber|tier |lime |bolt/i],
  ['Kleidung', /h&m|h & m|c&a|c & a|primark|deichmann|zara|kik\b|takko|ernsting|tk maxx|peek|snipes|about you|bonprix|esprit|s\.oliver|new yorker/i],
  ['Gesundheit', /apotheke|arzt|praxis|optik|fielmann|apollo|sanit|physio|zahn/i],
  ['Online-Käufe', /amazon|amzn|zalando|otto\b|ebay|temu|shein|aliexpress|paypal|klarna|galaxus|mediamarkt\.de|lieferando/i],
  ['Freizeit', /kino|cinema|restaurant|caf[eé]|pizz|burger|mcdonald|kfc|starbucks|theater|museum|schwimm|bad\b|freizeit|spotify|netflix|thalia|hugendubel|ikea/i],
];

const FIX_REGELN = [
  ['Wohnen', /miete|wohnungs|hausverwaltung|nebenkosten|wohnbau|immobil|vermiet|grundsteuer|hausgeld/i],
  ['Energie', /stadtwerke|strom|\bgas\b|energie|e\.on|eon\b|vattenfall|enbw|yello|naturstrom|lichtblick|wasser|fernw[äa]rme|rwe/i],
  ['Versicherungen', /versicherung|allianz|huk|ergo|\baxa\b|devk|debeka|generali|\blvm\b|r\+v|signal iduna|provinzial|gothaer|barmenia|wgv|cosmos|haftpflicht|hausrat/i],
  ['Mobilität', /kfz-steuer|kfz steuer|bundeskasse|deutschlandticket|db vertrieb|leasing|autohaus|adac|\bmvv\b|\bhvv\b|\bbvg\b/i],
  ['Verträge & Abos', /telekom|vodafone|\bo2\b|telef[oó]nica|1&1|congstar|netflix|spotify|prime|disney|apple\.com|google|rundfunk|beitragsservice|fitness|mcfit|urban sports|zeitung|abo\b|dazn|sky\b|audible|icloud/i],
  ['Kinder', /kita|kindergarten|schule|hort|musikschule|verein|nachhilfe|taschengeld/i],
  ['Kredite', /kredit|darlehen|finanzierung|ratenkauf|santander|targobank|easycredit|tilgung/i],
];

export function rateKategorie(text, erlaubte, { fix = false, verlauf = null } = {}) {
  const t = (text || '').toLowerCase();
  if (verlauf && t) {
    const schluessel = haendlerSchluessel(text);
    if (schluessel && verlauf.has(schluessel) && erlaubte.includes(verlauf.get(schluessel))) return verlauf.get(schluessel);
  }
  for (const [kat, re] of fix ? FIX_REGELN : AUSGABE_REGELN) {
    if (re.test(t) && erlaubte.includes(kat)) return kat;
  }
  return erlaubte.includes('Sonstiges') ? 'Sonstiges' : erlaubte[0];
}

/** Vereinfacht Händlernamen für Vergleiche: "REWE Markt GmbH 1234" -> "rewe markt" */
export function haendlerSchluessel(name) {
  return (name || '').toLowerCase()
    .replace(/\b(gmbh|ag|se|kg|co|ohg|e\.?k|e\.?v|mbh|ug|inc|ltd|sagt danke|filiale|markt\b)\b\.?/g, ' ')
    .replace(/[^a-zäöüß&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ').slice(0, 2).join(' ');
}

/** Aus früheren Buchungen: Händler -> zuletzt gewählte Kategorie */
export function kategorieVerlauf(buchungen) {
  const m = new Map();
  for (const b of [...buchungen].sort((a, b) => a.erfasstAm - b.erfasstAm)) {
    const k = haendlerSchluessel(b.haendler);
    if (k && b.kategorie) m.set(k, b.kategorie);
  }
  return m;
}
