import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Counts Unicode code points, the same unit PostgreSQL uses for VARCHAR(n).
export function MaxCharacters(
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'maxCharacters',
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [max],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [limit] = args.constraints as [number];
          return typeof value === 'string' && Array.from(value).length <= limit;
        },
        defaultMessage(args: ValidationArguments) {
          const [limit] = args.constraints as [number];
          return `${args.property} must be at most ${limit} characters`;
        },
      },
    });
  };
}
