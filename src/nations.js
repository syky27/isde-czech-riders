// Nation codes as used by the timing feeds (a mix of IOC and ISO 3166-1 alpha-3 codes),
// mapped to ISO 3166-1 alpha-2 so the browser can name them and show a flag.

const ISO2 = {
  ALB: 'AL', ALG: 'DZ', DZA: 'DZ', AND: 'AD', ARG: 'AR', AUS: 'AU', AUT: 'AT',
  BEL: 'BE', BIH: 'BA', BOL: 'BO', BRA: 'BR', BUL: 'BG', BGR: 'BG',
  CAN: 'CA', CHE: 'CH', SUI: 'CH', CHI: 'CL', CHL: 'CL', CHN: 'CN', COL: 'CO', CRC: 'CR', CRI: 'CR',
  CRO: 'HR', HRV: 'HR', CYP: 'CY', CZE: 'CZ',
  DEN: 'DK', DNK: 'DK', DEU: 'DE', GER: 'DE', DOM: 'DO',
  ECU: 'EC', ESP: 'ES', EST: 'EE',
  FIN: 'FI', FRA: 'FR',
  GBR: 'GB', GRE: 'GR', GRC: 'GR', GUA: 'GT', GTM: 'GT',
  HON: 'HN', HND: 'HN', HUN: 'HU',
  IMN: 'IM', IND: 'IN', IRL: 'IE', ISL: 'IS', ISR: 'IL', ITA: 'IT',
  JPN: 'JP',
  KAZ: 'KZ', KOR: 'KR',
  LAT: 'LV', LVA: 'LV', LIE: 'LI', LTU: 'LT', LUX: 'LU',
  MAR: 'MA', MEX: 'MX', MKD: 'MK', MLT: 'MT', MNE: 'ME', MON: 'MC', MCO: 'MC',
  NED: 'NL', NLD: 'NL', NOR: 'NO', NZL: 'NZ',
  PAN: 'PA', PAR: 'PY', PRY: 'PY', PER: 'PE', PHI: 'PH', PHL: 'PH', POL: 'PL', POR: 'PT', PRT: 'PT',
  ROU: 'RO', RSA: 'ZA', ZAF: 'ZA', RUS: 'RU',
  SMR: 'SM', SRB: 'RS', SLO: 'SI', SVN: 'SI', SVK: 'SK', SWE: 'SE',
  THA: 'TH', TUN: 'TN', TUR: 'TR',
  UKR: 'UA', URU: 'UY', URY: 'UY', USA: 'US',
  VEN: 'VE',
};

/** Timing-feed nation code → ISO 3166-1 alpha-2, or null when unknown. */
export function isoCode(code) {
  return ISO2[String(code ?? '').toUpperCase()] ?? null;
}

/** Country name in the given language, falling back to the raw code. */
export function nationName(code, lang = 'en') {
  const iso = isoCode(code);
  if (!iso) return String(code ?? '');
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(iso) ?? String(code);
  } catch {
    return String(code);
  }
}

/** Flag emoji for the nation, or '' when unknown. */
export function nationFlag(code) {
  const iso = isoCode(code);
  if (!iso) return '';
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
