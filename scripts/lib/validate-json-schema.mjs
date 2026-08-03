// A tiny, dependency-free JSON-Schema validator covering exactly the draft-07
// subset our schemas use: type (incl. array-of-types), required, properties,
// items, $ref (#/definitions/*), oneOf, enum, const, minimum, maximum, and
// additionalProperties: false. additionalProperties left unset or true is
// treated as permissive (extra keys are ignored), which matches most of our
// schemas. Returns an array of human-readable violation strings — empty
// means valid.
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
    // Keep each branch's errors, not just whether one matched. When a `oneOf`
    // fails, "matches none of the allowed shapes" is exactly the message an
    // operator sees from the registry-promotion CLI, and it names neither the
    // offending property nor the branch that nearly matched. Reporting the
    // closest branch's errors turns that into something actionable.
    let closest = null;
    for (const sub of schema.oneOf) {
      const subErrors = [];
      walk(value, sub, root, pathStr, subErrors);
      if (subErrors.length === 0) return; // matched — nothing to report
      if (closest === null || subErrors.length < closest.length) closest = subErrors;
    }
    errors.push(
      `${pathStr}: matches none of the allowed shapes (closest: ${closest.join('; ')})`,
    );
    return;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(typeOf(value))) {
      errors.push(`${pathStr}: expected ${types.join('|')}, got ${typeOf(value)}`);
      return; // wrong type — don't descend
    }
  }
  // `const`/`enum` compare by VALUE, not identity. `includes`/`!==` are
  // reference comparisons for arrays and objects, so a schema enumerating
  // `[['a','b']]` would reject the deep-equal `['a','b']` — a false rejection,
  // the opposite failure from the silent no-op this validator was hardened to
  // avoid, and just as wrong. Primitives are unaffected by the JSON round-trip.
  const sameValue = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  if ('const' in schema && !sameValue(value, schema.const)) {
    errors.push(`${pathStr}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.some((allowed) => sameValue(value, allowed))) {
    errors.push(`${pathStr}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
  }
  if (typeOf(value) === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${pathStr}: expected >= ${schema.minimum}, got ${value}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${pathStr}: expected <= ${schema.maximum}, got ${value}`);
    }
  }
  if (typeOf(value) === 'object') {
    for (const req of schema.required ?? []) {
      if (!(req in value)) errors.push(`${pathStr}: missing required "${req}"`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) walk(value[key], sub, root, `${pathStr}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!known.has(key)) errors.push(`${pathStr}: unexpected additional property "${key}"`);
      }
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
