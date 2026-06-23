import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode } from 'react';
import {
  type FieldValues,
  type Resolver,
  type SubmitHandler,
  useForm,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import { z, type ZodType } from 'zod';

import { Form } from '@/components/form';

type FormMockedSchema = ZodType<FieldValues, FieldValues>;

export const FormMocked = <T extends FormMockedSchema>({
  children,
  schema,
  useFormOptions,
  onSubmit,
}: {
  children(options: { form: UseFormReturn<z.infer<T>> }): ReactNode;
  schema: T;
  useFormOptions?: UseFormProps<z.infer<T>>;
  onSubmit?: SubmitHandler<z.infer<T>>;
}) => {
  const form = useForm<z.infer<T>>({
    mode: 'onBlur',
    resolver: zodResolver(schema) as Resolver<z.infer<T>>,
    ...useFormOptions,
  });
  const handleSubmit: SubmitHandler<z.infer<T>> | undefined = onSubmit
    ? (values) => {
        onSubmit(values);
      }
    : undefined;

  return (
    <Form {...form} onSubmit={handleSubmit}>
      {children({ form })}
      <button type="submit">Submit</button>
    </Form>
  );
};
