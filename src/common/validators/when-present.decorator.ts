import { ValidateIf } from 'class-validator';

// Update fields: absent means "leave as is". A present value is validated even
// when it is null, so null never reaches the database by accident.
export function WhenPresent() {
  return ValidateIf((_object, value: unknown) => value !== undefined);
}

// For fields where null is a valid answer (for example, make a category a root
// or clear a description): only real values are validated.
export function WhenPresentOrNull() {
  return ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  );
}
