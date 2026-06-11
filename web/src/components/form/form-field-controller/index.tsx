import { ReactNode } from 'react';
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form';

import {
  FieldComponentProps,
  fieldComponents,
} from '@/components/form/_fields';
import type { FieldType } from '@/components/form/field-types';

import {
  FormFieldControllerContext,
  NonGenericFormFieldControllerContextValue,
} from './context';

type BuiltInFormFieldControllerProps = {
  [K in FieldType]: { type: K } & FieldComponentProps<K>;
}[FieldType];

type SharedControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues,
> = Omit<ControllerProps<TFieldValues, TName, TTransformedValues>, 'render'> & {
  displayError?: boolean;
};

type FormFieldControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues,
> = (
  | BuiltInFormFieldControllerProps
  | {
      type: 'custom';
      render: ControllerProps<
        TFieldValues,
        TName,
        TTransformedValues
      >['render'];
    }
) &
  SharedControllerProps<TFieldValues, TName, TTransformedValues>;

export function FormFieldController<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues = TFieldValues,
>(props: FormFieldControllerProps<TFieldValues, TName, TTransformedValues>) {
  const {
    name,
    control,
    defaultValue,
    rules,
    shouldUnregister,
    displayError = true,
  } = props;

  return (
    <Controller
      name={name}
      control={control}
      defaultValue={defaultValue}
      disabled={props.disabled}
      rules={rules}
      shouldUnregister={shouldUnregister}
      render={(renderProps) => (
        <FormFieldControllerRender
          {...renderProps}
          controllerProps={props}
          displayError={displayError}
        />
      )}
    />
  );
}

function FormFieldControllerRender<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues,
>({
  field,
  fieldState,
  formState,
  controllerProps,
  displayError,
}: Parameters<
  ControllerProps<TFieldValues, TName, TTransformedValues>['render']
>[0] & {
  controllerProps: FormFieldControllerProps<
    TFieldValues,
    TName,
    TTransformedValues
  >;
  displayError: boolean;
}) {
  const { type } = controllerProps;
  const contextValue = { type, displayError, field, fieldState };

  const fieldContent = renderFieldContent(controllerProps, {
    field,
    fieldState,
    formState,
  });

  return (
    <FormFieldControllerContext
      value={contextValue as NonGenericFormFieldControllerContextValue}
    >
      {fieldContent}
    </FormFieldControllerContext>
  );
}

function renderFieldContent<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues,
>(
  props: FormFieldControllerProps<TFieldValues, TName, TTransformedValues>,
  renderProps: Parameters<
    ControllerProps<TFieldValues, TName, TTransformedValues>['render']
  >[0]
): ReactNode {
  switch (props.type) {
    case 'custom':
      return props.render(renderProps);
    case 'text':
    case 'email':
    case 'tel': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents[props.type];
      return <Field {...fieldProps} />;
    }
    case 'textarea': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents.textarea;
      return <Field {...fieldProps} />;
    }
    case 'select': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents.select;
      return <Field {...fieldProps} />;
    }
    case 'combobox': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents.combobox;
      return <Field {...fieldProps} />;
    }
    case 'combobox-multiple': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents['combobox-multiple'];
      return <Field {...fieldProps} />;
    }
    case 'number': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents.number;
      return <Field {...fieldProps} />;
    }
    case 'otp': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents.otp;
      return <Field {...fieldProps} />;
    }
    case 'date': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents.date;
      return <Field {...fieldProps} />;
    }
    case 'checkbox': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents.checkbox;
      return <Field {...fieldProps} />;
    }
    case 'checkbox-group': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents['checkbox-group'];
      return <Field {...fieldProps} />;
    }
    case 'radio-group': {
      const {
        control: _control,
        defaultValue: _defaultValue,
        displayError: _displayError,
        name: _name,
        rules: _rules,
        shouldUnregister: _shouldUnregister,
        type: _type,
        ...fieldProps
      } = props;
      const Field = fieldComponents['radio-group'];
      return <Field {...fieldProps} />;
    }
  }
}
