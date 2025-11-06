import { z } from 'zod';

export type TypeToZod<T> = Required<{
    [K in keyof T]: T[K] extends string | number | boolean | null | undefined
        ? undefined extends T[K]
            ? z.ZodDefault<z.ZodType<Exclude<T[K], undefined>>>
            : z.ZodType<T[K]>
        : T[K] extends Array<infer U>
            ? U extends Record<string, any>
                ? z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>>
                : z.ZodArray<z.ZodType<U>>
            : T[K] extends Record<string, any>
                ? z.ZodRecord<z.ZodString, z.ZodAny>
                : z.ZodObject<TypeToZod<T[K]>>;
  }>;
  
  export const createZodObject = <T>(_obj: TypeToZod<T>) => {
    return z.object(_obj) as z.ZodObject<TypeToZod<T>>;
  };

    // Custom error handling
    export class ValidationError extends Error {
        constructor(public issues: z.ZodIssue[], message: string = 'Validation failed') {
          super(message);
          this.name = 'ValidationError';
        }
      }