const fieldTypes = [
  'text',
  'textarea',
  'email',
  'tel',
  'select',
  'combobox',
  'combobox-multiple',
  'number',
  'otp',
  'date',
  'checkbox',
  'checkbox-group',
  'radio-group',
] as const;

export type FieldType = (typeof fieldTypes)[number];
