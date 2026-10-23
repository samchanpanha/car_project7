// Directory of all supported Cambodian commercial banks, MFIs, and NBC Bakong network.
// Pure metadata & heuristics — client and server safe (no DB dependencies).

export interface BankMetadata {
  code: string;
  name: string;
  nameKm: string;
  swiftPrefix: string;
  refLabel: string;
  refPattern: RegExp;
  color: string;
}

export const KNOWN_BANKS: Record<string, BankMetadata> = {
  ABA: {
    code: "ABA",
    name: "ABA Bank",
    nameKm: "ធនាគារ អេប៊ីអេ",
    swiftPrefix: "ABAAKHPP",
    refLabel: "Trx. ID / APV",
    refPattern: /^(?:17\d{13}|\d{15}|\d{6})$/,
    color: "#005f73",
  },
  ACLB: {
    code: "ACLB",
    name: "ACLEDA Bank",
    nameKm: "ធនាគារ អេស៊ីលីដា",
    swiftPrefix: "ACLBKHPP",
    refLabel: "Reference No. / External Txn Ref",
    refPattern: /^(?:\d{10,12}|[0-9a-f]{8})$/i,
    color: "#0c3b6d",
  },
  WING: {
    code: "WING",
    name: "Wing Bank",
    nameKm: "ធនាគារ វីង",
    swiftPrefix: "WINGKHPP",
    refLabel: "Transaction ID",
    refPattern: /^(?:WING\d{8,14}|\d{9,13})$/i,
    color: "#8dc63f",
  },
  CAND: {
    code: "CAND",
    name: "Canadia Bank",
    nameKm: "ធនាគារ កាណាឌីយ៉ា",
    swiftPrefix: "CANDKHPP",
    refLabel: "Transaction No. / Reference",
    refPattern: /^(?:FT\d{10,14}|\d{10,14})$/i,
    color: "#c8102e",
  },
  UCB: {
    code: "UCB",
    name: "Union Commercial Bank (UCB)",
    nameKm: "ធនាគារ សហពាណិជ្ជ ភ.អ",
    swiftPrefix: "UCBLKHPP",
    refLabel: "Reference No. / External Txn Ref",
    refPattern: /^(?:FT\d{6,14}[A-Za-z0-9]*|[0-9a-f]{8}|\d{8,16})$/i,
    color: "#00479d",
  },
  SPHN: {
    code: "SPHN",
    name: "Sathapana Bank",
    nameKm: "ធនាគារ សាថាពនា",
    swiftPrefix: "SPHNKHPP",
    refLabel: "Ref No.",
    refPattern: /^\d{8,14}$/,
    color: "#005596",
  },
  AMRT: {
    code: "AMRT",
    name: "Amret MFI",
    nameKm: "អម្រឹត",
    swiftPrefix: "AMRTKHPP",
    refLabel: "Transaction ID",
    refPattern: /^\d{8,14}$/,
    color: "#ed1c24",
  },
  CPBK: {
    code: "CPBK",
    name: "Chip Mong Bank",
    nameKm: "ធនាគារ ជីប ម៉ុង",
    swiftPrefix: "CPBKKHPP",
    refLabel: "Reference No.",
    refPattern: /^\d{8,14}$/,
    color: "#f58220",
  },
  FTBK: {
    code: "FTBK",
    name: "Foreign Trade Bank (FTB)",
    nameKm: "ធនាគារ វិនិយោគបរទេស",
    swiftPrefix: "FTBKKHPP",
    refLabel: "Ref No.",
    refPattern: /^\d{8,14}$/,
    color: "#1c3f94",
  },
  PRAS: {
    code: "PRAS",
    name: "KB PRASAC Bank",
    nameKm: "ខេប៊ី ប្រាសាក់",
    swiftPrefix: "PRASKHPP",
    refLabel: "Transaction ID",
    refPattern: /^\d{8,14}$/,
    color: "#fdb913",
  },
  PRIN: {
    code: "PRIN",
    name: "Prince Bank",
    nameKm: "ធនាគារ ព្រីនស៍",
    swiftPrefix: "PRINCKHP",
    refLabel: "Transaction ID / Ref",
    refPattern: /^(?:PR\d{8,14}|\d{8,16})$/i,
    color: "#1a4480",
  },
  PLBK: {
    code: "PLBK",
    name: "Phillip Bank",
    nameKm: "ធនាគារ ហ្វីលីព",
    swiftPrefix: "PLBKKHPP",
    refLabel: "Reference No.",
    refPattern: /^\d{8,16}$/,
    color: "#002d62",
  },
  VATC: {
    code: "VATC",
    name: "Vattanac Bank",
    nameKm: "ធនាគារ វឌ្ឍនៈ",
    swiftPrefix: "VATCKHPP",
    refLabel: "Transaction No.",
    refPattern: /^\d{8,16}$/,
    color: "#990000",
  },
  BRED: {
    code: "BRED",
    name: "BRED Bank Cambodia",
    nameKm: "ធនាគារ ប្រេដ",
    swiftPrefix: "BREDKHPP",
    refLabel: "Ref Number",
    refPattern: /^\d{8,16}$/,
    color: "#006699",
  },
  WBNK: {
    code: "WBNK",
    name: "Woori Bank",
    nameKm: "ធនាគារ អ៊ូរី",
    swiftPrefix: "WBNKKHPP",
    refLabel: "Transaction ID",
    refPattern: /^\d{8,16}$/,
    color: "#0067b1",
  },
  JTRB: {
    code: "JTRB",
    name: "J Trust Royal Bank",
    nameKm: "ធនាគារ ជេ ត្រាស់ រ៉ូយ៉ាល់",
    swiftPrefix: "JTRBKHPP",
    refLabel: "Reference ID",
    refPattern: /^\d{8,16}$/,
    color: "#e60012",
  },
  PPCB: {
    code: "PPCB",
    name: "PPCBank",
    nameKm: "ធនាគារ ភ្នំពេញ ពាណិជ្ជ",
    swiftPrefix: "PPCBKHP1",
    refLabel: "Transaction No.",
    refPattern: /^\d{8,16}$/,
    color: "#004b87",
  },
  CPBL: {
    code: "CPBL",
    name: "Campu Bank (Cambodian Public Bank)",
    nameKm: "ធនាគារ ខេមបូឌា ផាប់ប្លិក",
    swiftPrefix: "CPBLKHPP",
    refLabel: "Reference No.",
    refPattern: /^\d{8,16}$/,
    color: "#d9261c",
  },
  SHBK: {
    code: "SHBK",
    name: "Shinhan Bank Cambodia",
    nameKm: "ធនាគារ ស៊ិនហាន",
    swiftPrefix: "SHBKKHPP",
    refLabel: "Transaction ID",
    refPattern: /^\d{8,16}$/,
    color: "#0046fe",
  },
  HLBB: {
    code: "HLBB",
    name: "Hong Leong Bank",
    nameKm: "ធនាគារ ហុង លីអុង",
    swiftPrefix: "HLBBKHPP",
    refLabel: "Transaction Reference",
    refPattern: /^\d{8,16}$/,
    color: "#002060",
  },
  MBBE: {
    code: "MBBE",
    name: "Maybank Cambodia",
    nameKm: "ធនាគារ ម៉ាយប៊ែង",
    swiftPrefix: "MBBEKHPP",
    refLabel: "Reference ID",
    refPattern: /^\d{8,16}$/,
    color: "#ffc800",
  },
  BKCH: {
    code: "BKCH",
    name: "Bank of China Phnom Penh",
    nameKm: "ធនាគារ ចិន",
    swiftPrefix: "BKCHKHPP",
    refLabel: "Transaction ID",
    refPattern: /^\d{8,16}$/,
    color: "#b3082a",
  },
  BAKONG: {
    code: "BAKONG",
    name: "Bakong App (NBC)",
    nameKm: "បាគង",
    swiftPrefix: "BAKONG",
    refLabel: "Transaction Hash / External Ref",
    refPattern: /^(?:[0-9a-f]{8,64}|\d{10,16})$/i,
    color: "#cc0000",
  },
};

/**
 * Returns all supported Cambodian banks for display / verification guides.
 */
export function getAllSupportedBanks(): BankMetadata[] {
  return Object.values(KNOWN_BANKS);
}

/**
 * Detect originating bank from receipt text or reference format.
 */
export function detectBankFromContext(input: {
  ref?: string;
  rawText?: string;
  bankName?: string | null;
}): BankMetadata | null {
  const text = (input.rawText || "").toLowerCase();
  const ref = (input.ref || "").trim();
  const bankHint = (input.bankName || "").toLowerCase();

  // 1. Text checks (strongest indicators)
  if (
    text.includes("ucb") ||
    text.includes("union commercial") ||
    text.includes("សហពាណិជ្ជ") ||
    text.includes("ucbl") ||
    text.includes("e.sun") ||
    text.includes("esun") ||
    text.includes("聯合商業銀行") ||
    text.includes("commercial bank plc") ||
    bankHint.includes("ucb") ||
    bankHint.includes("union commercial") ||
    bankHint.includes("ucbl")
  ) {
    return KNOWN_BANKS.UCB;
  }
  if (text.includes("acleda") || text.includes("អេស៊ីលីដា") || text.includes("aclb") || bankHint.includes("acleda") || bankHint.includes("aclb")) {
    return KNOWN_BANKS.ACLB;
  }
  if (text.includes("wing bank") || text.includes("wing") || text.includes("វីង") || bankHint.includes("wing")) {
    return KNOWN_BANKS.WING;
  }
  if (text.includes("canadia") || text.includes("កាណាឌីយ៉ា") || text.includes("cand") || bankHint.includes("canadia") || bankHint.includes("cand")) {
    return KNOWN_BANKS.CAND;
  }
  if (text.includes("sathapana") || text.includes("សាថាពនា") || text.includes("sphn") || bankHint.includes("sathapana") || bankHint.includes("sphn")) {
    return KNOWN_BANKS.SPHN;
  }
  if (text.includes("amret") || text.includes("អម្រឹត") || text.includes("amrt") || bankHint.includes("amret") || bankHint.includes("amrt")) {
    return KNOWN_BANKS.AMRT;
  }
  if (text.includes("chip mong") || text.includes("ជីប ម៉ុង") || text.includes("cpbk") || bankHint.includes("chip mong") || bankHint.includes("cpbk")) {
    return KNOWN_BANKS.CPBK;
  }
  if (text.includes("foreign trade bank") || text.includes("ftb") || text.includes("វិនិយោគបរទេស") || text.includes("ftbk") || bankHint.includes("ftb")) {
    return KNOWN_BANKS.FTBK;
  }
  if (text.includes("prasac") || text.includes("ប្រាសាក់") || text.includes("praskhpp") || bankHint.includes("prasac")) {
    return KNOWN_BANKS.PRAS;
  }
  if (text.includes("prince bank") || text.includes("prince") || text.includes("ព្រីនស៍") || text.includes("princkhp") || bankHint.includes("prince")) {
    return KNOWN_BANKS.PRIN;
  }
  if (text.includes("phillip bank") || text.includes("phillip") || text.includes("ហ្វីលីព") || text.includes("plbkkhpp") || bankHint.includes("phillip") || bankHint.includes("plbk")) {
    return KNOWN_BANKS.PLBK;
  }
  if (text.includes("vattanac") || text.includes("វឌ្ឍនៈ") || text.includes("vatckhpp") || bankHint.includes("vattanac") || bankHint.includes("vatc")) {
    return KNOWN_BANKS.VATC;
  }
  if (text.includes("bred bank") || text.includes("bred") || text.includes("ប្រេដ") || text.includes("bredkhpp") || bankHint.includes("bred")) {
    return KNOWN_BANKS.BRED;
  }
  if (text.includes("woori") || text.includes("អ៊ូរី") || text.includes("wbnkkhpp") || bankHint.includes("woori") || bankHint.includes("wbnk")) {
    return KNOWN_BANKS.WBNK;
  }
  if (text.includes("j trust") || text.includes("jtrust") || text.includes("ជេ ត្រាស់") || text.includes("jtrbkhpp") || bankHint.includes("j trust") || bankHint.includes("jtrb")) {
    return KNOWN_BANKS.JTRB;
  }
  if (text.includes("ppcbank") || text.includes("ppcb") || text.includes("ភ្នំពេញ ពាណិជ្ជ") || text.includes("ppcbkhp1") || bankHint.includes("ppcb")) {
    return KNOWN_BANKS.PPCB;
  }
  if (text.includes("campu bank") || text.includes("campu") || text.includes("cambodian public") || text.includes("ខេមបូឌា ផាប់ប្លិក") || text.includes("cpblkhpp") || bankHint.includes("campu") || bankHint.includes("cpbl")) {
    return KNOWN_BANKS.CPBL;
  }
  if (text.includes("shinhan") || text.includes("ស៊ិនហាន") || text.includes("shbkkhpp") || bankHint.includes("shinhan") || bankHint.includes("shbk")) {
    return KNOWN_BANKS.SHBK;
  }
  if (text.includes("hong leong") || text.includes("ហុង លីអុង") || text.includes("hlbbkhpp") || bankHint.includes("hong leong") || bankHint.includes("hlbb")) {
    return KNOWN_BANKS.HLBB;
  }
  if (text.includes("maybank") || text.includes("ម៉ាយប៊ែង") || text.includes("mbbekhpp") || bankHint.includes("maybank") || bankHint.includes("mbbe")) {
    return KNOWN_BANKS.MBBE;
  }
  if (text.includes("bank of china") || text.includes("ធនាគារ ចិន") || text.includes("bkchkhpp") || bankHint.includes("bank of china") || bankHint.includes("bkch")) {
    return KNOWN_BANKS.BKCH;
  }
  if (text.includes("bakong") || text.includes("បាគង") || bankHint.includes("bakong")) {
    return KNOWN_BANKS.BAKONG;
  }

  // Remove beneficiary transfer destination phrases like "Transfer to ABA Bank" or "To: ABA Bank"
  // so that destination ABA accounts on external slips do not trigger originating ABA detection.
  const cleanedTextForAba = text
    .replace(/(?:transfer\s*to|khqr\s*to|beneficiary\s*bank|to\s*bank|paid\s*to)\s*(?:aba\s*bank|aba)/gi, "")
    .replace(/aba\s*bank\s*125\d+/gi, "");

  if (
    cleanedTextForAba.includes("payway by aba") ||
    cleanedTextForAba.includes("aba mobile") ||
    cleanedTextForAba.includes("aba bank") ||
    bankHint.includes("aba")
  ) {
    return KNOWN_BANKS.ABA;
  }

  // 2. Reference format heuristics
  if (ref) {
    if (/^(?:17\d{13}|\d{15})$/.test(ref)) return KNOWN_BANKS.ABA;

    // UCB clearing references (e.g. FT262967KHCC or any FT ending with KHCC / KH)
    if (/(?:^FT\d+[A-Za-z0-9]*KHCC?$|KHCC$)/i.test(ref)) {
      return KNOWN_BANKS.UCB;
    }

    if (/^[0-9a-f]{8}$/i.test(ref)) {
      if (bankHint.includes("ucb") || text.includes("ucb") || text.includes("commercial")) {
        return KNOWN_BANKS.UCB;
      }
      return KNOWN_BANKS.ACLB; // e.g. 6e0973e6
    }

    if (/^\d{11}$/.test(ref) && (ref.startsWith("62") || ref.startsWith("60"))) {
      return KNOWN_BANKS.ACLB; // typical ACLEDA 11-digit ref
    }
    if (/^WING/i.test(ref)) return KNOWN_BANKS.WING;

    // FT prefix: used by both Canadia Bank and Union Commercial Bank (UCB)
    if (/^FT/i.test(ref)) {
      if (
        bankHint.includes("ucb") ||
        bankHint.includes("union commercial") ||
        text.includes("ucb") ||
        text.includes("commercial") ||
        text.includes("សហពាណិជ្ជ")
      ) {
        return KNOWN_BANKS.UCB;
      }
      return KNOWN_BANKS.CAND;
    }

    if (/^PR/i.test(ref)) return KNOWN_BANKS.PRIN;
  }

  return null;
}
