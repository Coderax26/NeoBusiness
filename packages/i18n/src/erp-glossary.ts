/**
 * Non-Technical ERP Glossary (§4 Rule U1)
 * Provides simple explanations for business and ERP terminology so users never see unexplained jargon.
 */

export interface GlossaryTerm {
  term: string;
  abbreviation?: string;
  plainWord: string;
  en: string;
  mr: string;
  example?: string;
}

export const ERP_GLOSSARY: Record<string, GlossaryTerm> = {
  AR: {
    term: 'Accounts Receivable',
    abbreviation: 'AR',
    plainWord: 'Money to collect',
    en: 'Money customers owe your business for goods already delivered.',
    mr: 'ग्राहकांकडून येणे बाकी असलेली एकूण रक्कम.',
    example: 'E.g., ₹1,20,000 pending across 4 distributors.',
  },
  AP: {
    term: 'Accounts Payable',
    abbreviation: 'AP',
    plainWord: 'Bills to pay',
    en: 'Money your business owes to suppliers for raw materials received.',
    mr: 'कच्चा माल पुरवठादारांना द्यावयाची देणी.',
    example: 'E.g., ₹85,000 due to milk vendor on Monday.',
  },
  GRN: {
    term: 'Goods Received Note',
    abbreviation: 'GRN',
    plainWord: 'Goods received check',
    en: 'A record made when physical shipments arrive at the factory gate, verifying count & weight.',
    mr: 'गोदामात प्रत्यक्ष माल आल्याची खात्री करणारी नोंद पावती.',
    example: 'Blind GRN lets storekeeper count first without seeing supplier invoice.',
  },
  PO: {
    term: 'Purchase Order',
    abbreviation: 'PO',
    plainWord: 'Order sent to supplier',
    en: 'Official document sent to a supplier specifying quantities, agreed rates, and delivery dates.',
    mr: 'पुरवठादाराला पाठवलेला खरेदी करार आदेश.',
  },
  POD: {
    term: 'Proof of Delivery',
    abbreviation: 'POD',
    plainWord: 'Customer delivery sign-off',
    en: 'Customer signature or stamp confirming they received the delivered goods.',
    mr: 'ग्राहकाने माल मिळाल्याबाबत दिलेली स्वाक्षरी किंवा पावती.',
  },
  UOM: {
    term: 'Unit of Measure',
    abbreviation: 'UoM',
    plainWord: 'Measuring unit',
    en: 'How an item is counted or weighed (e.g., kg, crate, litre, packet).',
    mr: 'माल मोजण्याचे एकक (उदा. किलो, क्रेट, लिटर, नग).',
  },
  BOM: {
    term: 'Bill of Materials',
    abbreviation: 'BOM',
    plainWord: 'Recipe / Ingredients list',
    en: 'The standard list of ingredients and quantities required to produce a finished batch.',
    mr: 'उत्पादनासाठी लागणाऱ्या कच्च्या मालाची प्रमाणबद्ध यादी (रेसिपी).',
  },
  EOD: {
    term: 'End of Day',
    abbreviation: 'EOD',
    plainWord: 'Daily closing reconciliation',
    en: 'Daily reconciliation of cash in custody, bank deposits, stock movements, and driver handovers.',
    mr: 'दिवसअखेर प्रत्यक्ष रोख, बँक आणि साठ्याचा अंतिम ताळमेळ.',
  },
  BASE_PRICE: {
    term: 'Base Price',
    plainWord: 'Today’s standard price',
    en: 'Standard market selling price established by Owner for today.',
    mr: 'आजचा प्रमाणित विक्री दर.',
  },
  FLOOR_PRICE: {
    term: 'Floor Price',
    plainWord: 'Minimum allowed price',
    en: 'Absolute lowest price a sales coordinator can quote without Owner authorization.',
    mr: 'किमान विक्री दर, ज्याखाली विक्रीसाठी मालकाची मंजुरी लागते.',
  },
  BLENDED_MARGIN: {
    term: 'Blended Gross Margin',
    plainWord: 'Average profit %',
    en: 'Average percentage difference between sales revenue and direct cost of goods sold.',
    mr: 'एकूण विक्रीतील सरासरी निव्वळ नफ्याचे प्रमाण %.',
  },
};

/**
 * Returns plain explanation for an abbreviation or term.
 */
export function explainTerm(termKey: string, locale: 'en' | 'mr' = 'en'): GlossaryTerm | null {
  const normalized = termKey.toUpperCase().replace(/[^A-Z_]/g, '');
  const term = ERP_GLOSSARY[normalized];
  if (!term) return null;
  return term;
}

