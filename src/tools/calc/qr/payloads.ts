import { t } from '../../../lib/i18n-core';

/**
 * What goes into the QR code for each kind of content: the text formats phones' camera apps
 * understand (Wi-Fi, vCard, iCalendar, mailto, QR Platba, EPC…). Plain functions, so they're tested.
 */

export type Kind = 'link' | 'text' | 'wifi' | 'contact' | 'email' | 'sms' | 'phone' | 'whatsapp' | 'location' | 'event' | 'payment' | 'crypto';

export const KINDS: { id: Kind; label: string }[] = [
  { id: 'link', label: t('Link') },
  { id: 'text', label: t('Text') },
  { id: 'wifi', label: t('Wi-Fi') },
  { id: 'contact', label: t('Contact') },
  { id: 'email', label: t('E-mail') },
  { id: 'sms', label: t('SMS') },
  { id: 'phone', label: t('Phone') },
  { id: 'whatsapp', label: t('WhatsApp') },
  { id: 'location', label: t('Location') },
  { id: 'event', label: t('Event') },
  { id: 'payment', label: t('Payment') },
  { id: 'crypto', label: t('Crypto') },
];

export type Content = {
  kind: Kind;
  link: { url: string };
  text: { text: string }; // i18n-ignore (the code's data)
  wifi: { ssid: string; password: string; security: 'WPA' | 'WEP' | 'nopass'; hidden: boolean };
  contact: { first: string; last: string; mobile: string; work: string; email: string; org: string; title: string; web: string; street: string; city: string; zip: string; region: string; country: string; note: string };
  email: { to: string; subject: string; body: string };
  sms: { number: string; message: string };
  phone: { number: string };
  whatsapp: { number: string; message: string };
  location: { lat: string; lng: string; as: 'maps' | 'geo' };
  event: { title: string; place: string; allDay: boolean; start: string; end: string; notes: string };
  payment: { scheme: 'spayd' | 'epc'; account: string; bic: string; name: string; amount: string; vs: string; message: string };
  crypto: { coin: 'bitcoin' | 'ethereum' | 'litecoin'; address: string; amount: string; label: string };
};

export const EMPTY: Content = {
  kind: 'link',
  link: { url: '' },
  text: { text: '' }, // i18n-ignore (the code's data)
  wifi: { ssid: '', password: '', security: 'WPA', hidden: false },
  contact: { first: '', last: '', mobile: '', work: '', email: '', org: '', title: '', web: '', street: '', city: '', zip: '', region: '', country: '', note: '' },
  email: { to: '', subject: '', body: '' },
  sms: { number: '', message: '' },
  phone: { number: '' },
  whatsapp: { number: '', message: '' },
  location: { lat: '', lng: '', as: 'maps' },
  event: { title: '', place: '', allDay: false, start: '', end: '', notes: '' },
  payment: { scheme: 'spayd', account: '', bic: '', name: '', amount: '', vs: '', message: '' },
  crypto: { coin: 'bitcoin', address: '', amount: '', label: '' },
};

/** The text to encode, or an error to show instead. `empty` = nothing filled in yet. */
export type Payload = { text: string } | { error: string } | { empty: true }; // i18n-ignore (the code's data)

const trim = (s: string) => s.trim();
const phoneOf = (s: string) => s.replace(/[^\d+]/g, '');

/** Wi-Fi fields: backslash before \ ; , : and ". */
export const wifiEscape = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
/** vCard and iCalendar text values: \ ; , and new lines. */
export const cardEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function link(url: string): Payload {
  const u = trim(url);
  if (!u) return { empty: true };
  // A scheme (https:, mailto:, spotify:…) stays; a bare address gets https://.
  return { text: /^[a-z][a-z\d+.-]*:/i.test(u) ? u : `https://${u}` }; // i18n-ignore (the code's data)
}

export function wifi(w: Content['wifi']): Payload {
  if (!w.ssid) return { empty: true };
  if (w.security !== 'nopass' && !w.password) return { error: t('Type the password, or pick "no password".') };
  if (w.security === 'WPA' && w.password.length < 8) return { error: t('A WPA password has at least 8 characters.') };
  const parts = [`T:${w.security}`, `S:${wifiEscape(w.ssid)}`];
  if (w.security !== 'nopass') parts.push(`P:${wifiEscape(w.password)}`);
  if (w.hidden) parts.push('H:true');
  return { text: `WIFI:${parts.join(';')};;` }; // i18n-ignore (the code's data)
}

export function contact(c: Content['contact']): Payload {
  const name = [trim(c.first), trim(c.last)].filter(Boolean).join(' ');
  if (!name && !trim(c.org) && !trim(c.mobile) && !trim(c.email)) return { empty: true };
  const e = (s: string) => cardEscape(trim(s));
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(c.last)};${e(c.first)};;;`, `FN:${cardEscape(name || trim(c.org))}`];
  if (trim(c.org)) lines.push(`ORG:${e(c.org)}`);
  if (trim(c.title)) lines.push(`TITLE:${e(c.title)}`);
  if (trim(c.mobile)) lines.push(`TEL;TYPE=CELL:${phoneOf(c.mobile)}`);
  if (trim(c.work)) lines.push(`TEL;TYPE=WORK:${phoneOf(c.work)}`);
  if (trim(c.email)) lines.push(`EMAIL:${trim(c.email)}`);
  if (trim(c.web)) lines.push(`URL:${(link(c.web) as { text: string }).text}`); // i18n-ignore (the code's data)
  if ([c.street, c.city, c.zip, c.region, c.country].some((s) => trim(s))) lines.push(`ADR:;;${e(c.street)};${e(c.city)};${e(c.region)};${e(c.zip)};${e(c.country)}`);
  if (trim(c.note)) lines.push(`NOTE:${e(c.note)}`);
  lines.push('END:VCARD');
  return { text: lines.join('\r\n') }; // i18n-ignore (the code's data)
}

export function email(m: Content['email']): Payload {
  if (!trim(m.to) && !trim(m.subject) && !trim(m.body)) return { empty: true };
  const q = [m.subject && `subject=${encodeURIComponent(m.subject)}`, m.body && `body=${encodeURIComponent(m.body)}`].filter(Boolean);
  return { text: `mailto:${trim(m.to)}${q.length ? `?${q.join('&')}` : ''}` }; // i18n-ignore (the code's data)
}

export function sms(s: Content['sms']): Payload {
  if (!trim(s.number)) return trim(s.message) ? { error: t('Type the phone number.') } : { empty: true };
  return { text: `SMSTO:${phoneOf(s.number)}:${s.message}` }; // i18n-ignore (the code's data)
}

export function phone(p: Content['phone']): Payload {
  return trim(p.number) ? { text: `tel:${phoneOf(p.number)}` } : { empty: true }; // i18n-ignore (the code's data)
}

export function whatsapp(w: Content['whatsapp']): Payload {
  const n = w.number.replace(/\D/g, '');
  if (!n) return trim(w.message) ? { error: t('Type the phone number with its country code (420…).') } : { empty: true };
  return { text: `https://wa.me/${n}${trim(w.message) ? `?text=${encodeURIComponent(w.message)}` : ''}` }; // i18n-ignore (the code's data)
}

/** Coordinates from a pasted map link (Google, Mapy.cz, OpenStreetMap) or plain "50.08, 14.42". */
export function coordsFrom(s: string): { lat: number; lng: number } | null {
  const tries = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, // google …/@50.08,14.42,15z
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // google place data
    /[?&](?:q|ll|query|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /[?&]y=(-?\d+(?:\.\d+)?)&x=(-?\d+(?:\.\d+)?)/, // mapy.cz has x = longitude
    /mlat=(-?\d+(?:\.\d+)?)&mlon=(-?\d+(?:\.\d+)?)/, // openstreetmap
    /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/, // openstreetmap
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/,
  ];
  for (const re of tries) {
    const m = s.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  // mapy.cz: …?x=14.42&y=50.08
  const x = s.match(/[?&]x=(-?\d+(?:\.\d+)?)/);
  const y = s.match(/[?&]y=(-?\d+(?:\.\d+)?)/);
  if (x && y && Math.abs(Number(y[1])) <= 90 && Math.abs(Number(x[1])) <= 180) return { lat: Number(y[1]), lng: Number(x[1]) };
  return null;
}

export function location(l: Content['location']): Payload {
  if (!trim(l.lat) && !trim(l.lng)) return { empty: true };
  const lat = Number(l.lat.replace(',', '.'));
  const lng = Number(l.lng.replace(',', '.'));
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return { error: t('The latitude is a number from -90 to 90.') };
  if (!Number.isFinite(lng) || Math.abs(lng) > 180) return { error: t('The longitude is a number from -180 to 180.') };
  return { text: l.as === 'geo' ? `geo:${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` }; // i18n-ignore (the code's data)
}

/** '2026-10-20T18:30' → '20261020T183000'; '2026-10-20' → '20261020'. */
const icalTime = (s: string, allDay: boolean) => {
  const d = s.replace(/[-:]/g, '');
  return allDay ? d.slice(0, 8) : `${d.slice(0, 13)}00`;
};
const nextDay = (date: string) => {
  const d = new Date(`${date.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

export function event(ev: Content['event']): Payload {
  if (!trim(ev.title) && !ev.start) return { empty: true };
  if (!trim(ev.title)) return { error: t('Give the event a name.') };
  if (!ev.start) return { error: t('Pick when it starts.') };
  if (ev.end && ev.end < ev.start) return { error: t('It ends before it starts.') };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `SUMMARY:${cardEscape(trim(ev.title))}`];
  if (trim(ev.place)) lines.push(`LOCATION:${cardEscape(trim(ev.place))}`);
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icalTime(ev.start, true)}`);
    // The end of an all-day event is the day after its last day.
    lines.push(`DTEND;VALUE=DATE:${nextDay(ev.end || ev.start)}`);
  } else {
    lines.push(`DTSTART:${icalTime(ev.start, false)}`);
    if (ev.end) lines.push(`DTEND:${icalTime(ev.end, false)}`);
  }
  if (trim(ev.notes)) lines.push(`DESCRIPTION:${cardEscape(trim(ev.notes))}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return { text: lines.join('\r\n') }; // i18n-ignore (the code's data)
}

/** Big-number remainder of a string of digits (IBAN check). */
const mod97 = (digits: string) => {
  let r = 0;
  for (const ch of digits) r = (r * 10 + Number(ch)) % 97;
  return r;
};
const ibanDigits = (s: string) => s.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

export function validIban(iban: string) {
  const s = iban.replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z\d]{10,30}$/.test(s) && mod97(ibanDigits(s.slice(4) + s.slice(0, 4))) === 1;
}

/** Czech bank account weights: the prefix and the number each add up to a multiple of 11. */
const czWeights = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];
const czOk = (digits: string) => [...digits.padStart(10, '0')].reduce((s, d, i) => s + Number(d) * czWeights[i], 0) % 11 === 0;

/**
 * A Czech account number ("19-2000145399/0800", "2000145399/0800") as an IBAN, or an IBAN typed in
 * (spaces allowed) cleaned up. Returns an error text when it can't be right.
 */
export function toIban(account: string): { iban: string } | { error: string } {
  const s = account.replace(/\s/g, '').toUpperCase();
  if (/^[A-Z]{2}/.test(s)) return validIban(s) ? { iban: s } : { error: t('That IBAN isn’t right (its check digits don’t match).') };
  const m = s.match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!m) return { error: t('Type the account as number/bank code (e.g. 19-2000145399/0800) or as an IBAN.') };
  const [, prefix = '', number, bank] = m;
  if ((prefix && !czOk(prefix)) || !czOk(number)) return { error: t('That account number isn’t right (its check doesn’t add up).') };
  const bban = bank + prefix.padStart(6, '0') + number.padStart(10, '0');
  const check = 98 - mod97(ibanDigits(`${bban}CZ00`));
  return { iban: `CZ${String(check).padStart(2, '0')}${bban}` };
}

/** Amount as "1234.50", or null when it isn't a positive number. */
const amountOf = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1e10 ? n.toFixed(2) : null;
};

export function payment(p: Content['payment']): Payload {
  if (!trim(p.account) && !trim(p.amount)) return { empty: true };
  if (!trim(p.account)) return { error: p.scheme === 'epc' ? t('Type the IBAN.') : t('Type the account number.') };
  const acc = toIban(p.account);
  if ('error' in acc) return acc;
  const amount = trim(p.amount) ? amountOf(p.amount) : '';
  if (amount === null) return { error: t('The amount is a number, like 250 or 99.90.') };
  if (p.scheme === 'epc') {
    if (!trim(p.name)) return { error: t('Type who the money goes to (EPC needs the name).') };
    const bic = trim(p.bic).toUpperCase();
    if (bic && !/^[A-Z]{6}[A-Z\d]{2}([A-Z\d]{3})?$/.test(bic)) return { error: t('A BIC has 8 or 11 letters and digits.') };
    if (amount && Number(amount) > 999999999.99) return { error: t('EPC takes at most 999 999 999.99 EUR.') };
    // EPC069-12: service tag, version 002, UTF-8, SEPA credit transfer, then the fields one per line.
    const lines = ['BCD', '002', '1', 'SCT', bic, trim(p.name).slice(0, 70), acc.iban, amount ? `EUR${amount}` : '', '', '', trim(p.message).slice(0, 140)];
    while (lines[lines.length - 1] === '') lines.pop();
    return { text: lines.join('\n') }; // i18n-ignore (the code's data)
  }
  if (trim(p.vs) && !/^\d{1,10}$/.test(trim(p.vs))) return { error: t('The variable symbol is up to 10 digits.') };
  // Short payment descriptor (QR Platba). "*" separates the fields, so it can't be in them.
  const clean = (s: string, n: number) => trim(s).replace(/\*/g, '').slice(0, n);
  const parts = ['SPD', '1.0', `ACC:${acc.iban}`];
  if (amount) parts.push(`AM:${amount}`, 'CC:CZK');
  if (trim(p.vs)) parts.push(`X-VS:${trim(p.vs)}`);
  if (trim(p.name)) parts.push(`RN:${clean(p.name, 35)}`);
  if (trim(p.message)) parts.push(`MSG:${clean(p.message, 60)}`);
  return { text: parts.join('*') }; // i18n-ignore (the code's data)
}

/** "0.5" ETH → "500000000000000000" wei, without rounding errors. */
const toWei = (amount: string) => {
  const [whole, frac = ''] = amount.split('.');
  return (BigInt(whole || '0') * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18))).toString();
};

export function crypto(c: Content['crypto']): Payload {
  const a = trim(c.address);
  if (!a) return trim(c.amount) ? { error: t('Type the wallet address.') } : { empty: true };
  if (/\s/.test(a)) return { error: t('A wallet address has no spaces.') };
  const amount = trim(c.amount).replace(',', '.');
  if (amount && !/^\d+(\.\d+)?$/.test(amount)) return { error: t('The amount is a number, like 0.005.') };
  if (c.coin === 'ethereum') return { text: `ethereum:${a}${amount ? `?value=${toWei(amount)}` : ''}` }; // i18n-ignore (the code's data)
  const q = [amount && `amount=${amount}`, trim(c.label) && `label=${encodeURIComponent(trim(c.label))}`].filter(Boolean);
  return { text: `${c.coin}:${a}${q.length ? `?${q.join('&')}` : ''}` }; // i18n-ignore (the code's data)
}

export function payloadOf(c: Content): Payload {
  switch (c.kind) {
    case 'link':
      return link(c.link.url);
    case 'text':
      return c.text.text ? { text: c.text.text } : { empty: true }; // i18n-ignore (the code's data)
    case 'wifi':
      return wifi(c.wifi);
    case 'contact':
      return contact(c.contact);
    case 'email':
      return email(c.email);
    case 'sms':
      return sms(c.sms);
    case 'phone':
      return phone(c.phone);
    case 'whatsapp':
      return whatsapp(c.whatsapp);
    case 'location':
      return location(c.location);
    case 'event':
      return event(c.event);
    case 'payment':
      return payment(c.payment);
    case 'crypto':
      return crypto(c.crypto);
  }
}
