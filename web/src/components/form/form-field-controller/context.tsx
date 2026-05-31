import { createContext, use } from 'react';
import {
  ControllerFieldState,
  ControllerRenderProps,
  FieldValues,
} from 'react-hook-form';

import { FieldType } from '@/components/form/_fields';

export type NonGenericFormFieldControllerContextValue =
  FormFieldControllerContextValue<FieldValues>;

export type FormFieldControllerContextValue<
  TFieldValues extends FieldValues = FieldValues,
> = {
  type: FieldType | 'custom';
  field: ControllerRenderProps<TFieldValues>;
  fieldState: ControllerFieldState;
  displayError?: boolean;
};

export const FormFieldControllerContext =
  createContext<FormFieldControllerContextValue | null>(null);

export function useFormFieldControllerUnsafe() {
  return use(FormFieldControllerContext);
}

export function useFormFieldController() {
  const context = useFormFieldControllerUnsafe();

  if (!context)
    throw new Error(
      'useFormFieldController must be used within a <FormFieldController />'
    );

  return context;
}
