import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function MaxBytes(
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'maxBytes',
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [max],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [limit] = args.constraints as [number];
          return (
            typeof value === 'string' &&
            Buffer.byteLength(value, 'utf8') <= limit
          );
        },
        defaultMessage(args: ValidationArguments) {
          const [limit] = args.constraints as [number];
          return `${args.property} must be at most ${limit} bytes in UTF-8`;
        },
      },
    });
  };
}
