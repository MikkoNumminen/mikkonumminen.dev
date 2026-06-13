// A tiny, dependency-free JSON-Schema validator covering exactly the draft-07
// subset our schemas use: type (incl. array-of-types), required, properties,
// items, $ref (#/definitions/*), and oneOf. additionalProperties is treated as
// permissive (extra keys are ignored), which matches our schemas. Returns an
// array of human-readable violation strings — empty means valid.
//
// Deliberately not a full validator: it exists so build-time data validation
// needs no ajv/zod dependency, in keeping with the project's minimal-deps posture.

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value; // 'object' | 'string' | 'number' | 'boolean'
}

function walk(value, schema, root, pathStr, errors) {
  if (schema.$ref) {
    const ref = schema.$ref.replace('#/definitions/', '');
    walk(value, root.definitions[ref], root, pathStr, errors);
    return;
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.some((sub) => {
      const subErrors = [];
      walk(value, sub, root, pathStr, subErrors);
      return subErrors.length === 0;
    });
    if (!matches) errors.push(`${pathStr}: matches none of the allowed shapes`);
    return;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(typeOf(value))) {
      errors.push(`${pathStr}: expected ${types.join('|')}, got ${typeOf(value)}`);
      return; // wrong type — don't descend
    }
  }
  if (typeOf(value) === 'object') {
    for (const req of schema.required ?? []) {
      if (!(req in value)) errors.push(`${pathStr}: missing required "${req}"`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) walk(value[key], sub, root, `${pathStr}.${key}`, errors);
    }
  }
  if (typeOf(value) === 'array' && schema.items) {
    value.forEach((el, i) => walk(el, schema.items, root, `${pathStr}[${i}]`, errors));
  }
}

/** Validate `value` against `schema` (which is also its own $ref root). */
export function validateAgainst(value, schema) {
  const errors = [];
  walk(value, schema, schema, '$', errors);
  return errors;
}
