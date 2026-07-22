/** Builds a minimal vCard 3.0 string for a contact. */
export function buildVCard(contact: {
  fullName: string;
  phone: string;
  organization?: string;
}): string {
  const phone = contact.phone.replace(/[^0-9]/g, '');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.fullName}`,
    contact.organization ? `ORG:${contact.organization}` : undefined,
    `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}`,
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\n');
}
