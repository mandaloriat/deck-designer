import { z } from 'zod';

export const FIELD_TYPES = [
  'text',
  'richtext',
  'number',
  'integer',
  'boolean',
  'enum',
  'image',
  'color',
  'list',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Field names the engine owns; a deck may not redeclare them. */
export const RESERVED_FIELDS = ['id', 'copies', 'type', 'index'] as const;

const base = {
  label: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().default(false),
};

const textField = z.object({
  ...base,
  type: z.literal('text'),
  default: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
  pattern: z.string().optional(),
});

const richTextField = z.object({
  ...base,
  type: z.literal('richtext'),
  default: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
});

const numberField = z.object({
  ...base,
  type: z.enum(['number', 'integer']),
  default: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

const booleanField = z.object({
  ...base,
  type: z.literal('boolean'),
  default: z.boolean().optional(),
});

const enumField = z.object({
  ...base,
  type: z.literal('enum'),
  values: z.array(z.string()).min(1),
  default: z.string().optional(),
});

const imageField = z.object({
  ...base,
  type: z.literal('image'),
  default: z.string().optional(),
  /** Directory the value is resolved against, project-relative. */
  base: z.string().optional(),
});

const colorField = z.object({
  ...base,
  type: z.literal('color'),
  default: z.string().optional(),
});

const listField = z.object({
  ...base,
  type: z.literal('list'),
  of: z.enum(['text', 'number', 'integer']).default('text'),
  separator: z.string().default('|'),
  default: z.array(z.union([z.string(), z.number()])).optional(),
});

export const fieldDefSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { type: value } : value),
  z.discriminatedUnion('type', [
    textField,
    richTextField,
    numberField,
    booleanField,
    enumField,
    imageField,
    colorField,
    listField,
  ]),
);

export type FieldDef = z.infer<typeof fieldDefSchema>;
