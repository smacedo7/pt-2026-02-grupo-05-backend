import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function Match(
  property: string,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'match',
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [property],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [otherProperty] = args.constraints as [string];
          return (
            value === (args.object as Record<string, unknown>)[otherProperty]
          );
        },
        defaultMessage(args: ValidationArguments) {
          const [otherProperty] = args.constraints as [string];
          return `${args.property} must match ${otherProperty}`;
        },
      },
    });
  };
}
