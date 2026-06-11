import { useRef } from 'react';
import { useFormState } from 'react-hook-form';

import { useFormField } from '@/components/form/form-field';
import { FormFieldContainer } from '@/components/form/form-field-container';
import { useFormFieldController } from '@/components/form/form-field-controller/context';
import { FormFieldError } from '@/components/form/form-field-error';
import { FieldProps } from '@/components/form/types';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

export const FieldOtp = (
  props: FieldProps<
    {
      autoSubmit?: boolean;
      containerProps?: React.ComponentProps<typeof FormFieldContainer>;
    } & Omit<React.ComponentProps<typeof InputOTP>, 'children'>
  >
) => {
  const { containerProps, autoSubmit, ...rest } = props;

  const containerRef = useRef<React.ComponentRef<'div'>>(null);
  const ctx = useFormField();
  const formState = useFormState();
  const { field, fieldState } = useFormFieldController();
  const slotIds = Array.from(
    { length: rest.maxLength },
    (_, index) => `${ctx.id}-otp-slot-${index}`
  );

  return (
    <FormFieldContainer {...containerProps} ref={containerRef}>
      <InputOTP
        id={ctx.id}
        aria-invalid={fieldState.invalid ? true : undefined}
        aria-describedby={ctx.describedBy(fieldState.invalid)}
        onComplete={(v) => {
          rest.onComplete?.(v);
          // Only auto submit on first try
          if (!formState.isSubmitted && autoSubmit) {
            containerRef.current?.closest('form')?.requestSubmit();
          }
        }}
        {...rest}
        {...field}
        onChange={(e) => {
          field.onChange(e);
          rest.onChange?.(e);
        }}
        onBlur={(e) => {
          field.onBlur();
          rest.onBlur?.(e);
        }}
      >
        <InputOTPGroup>
          {slotIds.map((slotId, index) => (
            <InputOTPSlot index={index} key={slotId} />
          ))}
        </InputOTPGroup>
      </InputOTP>

      <FormFieldError />
    </FormFieldContainer>
  );
};
