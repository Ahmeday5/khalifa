export type BadgeType = 'red' | 'amber' | 'green' | 'whatsapp';

export const BADGE_CLASS_MAP: Record<BadgeType, string> = {
  red: 'sbb',
  amber: 'sbb sbb-am',
  green: 'sbb sbb-gr',
  whatsapp: 'sbb sbb-gr',
};
