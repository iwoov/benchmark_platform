"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Button as UiButton } from "@/components/ui/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { Input as UiInput, Select as UiSelect, Textarea } from "@/components/ui/input";
import { Modal as UiModal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import { Switch as UiSwitch } from "@/components/ui/switch";
import { cn } from "@/lib/utils/cn";

type LegacyButtonType = "primary" | "default" | "dashed" | "link" | "text";
type LegacySize = "small" | "middle" | "large";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  type?: LegacyButtonType;
  htmlType?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  danger?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  size?: LegacySize;
};

export function Button({
  type,
  htmlType = "button",
  danger,
  loading,
  icon,
  size,
  children,
  ...props
}: ButtonProps) {
  return (
    <UiButton
      {...props}
      type={htmlType}
      loading={loading}
      leftIcon={icon}
      variant={
        danger
          ? "destructive"
          : type === "primary"
            ? "default"
            : type === "text"
              ? "ghost"
              : type === "link"
                ? "link"
                : "secondary"
      }
      size={size === "small" ? "sm" : size === "large" ? "lg" : "default"}
    >
      {children}
    </UiButton>
  );
}

function mapTagVariant(color?: string): BadgeVariant {
  if (!color || color === "default") {
    return "default";
  }
  if (["success", "green"].includes(color)) {
    return "success";
  }
  if (["error", "red"].includes(color)) {
    return "destructive";
  }
  if (["warning", "gold", "orange"].includes(color)) {
    return "warning";
  }
  if (["processing", "blue"].includes(color)) {
    return "primary";
  }
  return "info";
}

export function Tag({
  color,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <Badge {...props} className={className} variant={mapTagVariant(color)}>
      {children}
    </Badge>
  );
}

export function Empty({
  description,
  className,
  style,
}: {
  description?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const title = typeof description === "string" ? description : "暂无数据";
  return (
    <div className={className} style={style}>
      <EmptyState
        title={title}
        description={typeof description === "string" ? undefined : String(description ?? "")}
      />
    </div>
  );
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "size"> & {
  indeterminate?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  children?: ReactNode;
};

export function Checkbox({
  indeterminate,
  children,
  className,
  style,
  ...props
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = !!indeterminate;
    }
  }, [indeterminate]);

  const input = (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      className={cn("h-4 w-4 rounded border-input accent-primary", className)}
    />
  );

  if (!children) {
    return input;
  }

  return (
    <label
      className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground"
      style={style}
    >
      {input}
      <span>{children}</span>
    </label>
  );
}

type LegacyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> & {
  allowClear?: boolean;
  prefix?: ReactNode;
  size?: LegacySize;
};

function LegacyInput({
  prefix,
  allowClear: _allowClear,
  size: _size,
  className,
  ...props
}: LegacyInputProps) {
  return <UiInput {...props} leftIcon={prefix} className={className} />;
}

function PasswordInput(props: LegacyInputProps) {
  return <LegacyInput {...props} type="password" />;
}

export const Input = Object.assign(LegacyInput, {
  Password: PasswordInput,
  TextArea: Textarea,
});

type InputNumberProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> & {
  value?: number | null;
  onChange?: (value: number | null) => void;
  addonAfter?: ReactNode;
  precision?: number;
  size?: LegacySize;
};

export function InputNumber({
  value,
  onChange,
  addonAfter,
  precision: _precision,
  size: _size,
  className,
  style,
  ...props
}: InputNumberProps) {
  const input = (
    <UiInput
      {...props}
      type="number"
      value={value ?? ""}
      onChange={(event) => {
        const nextValue = event.target.value;
        onChange?.(nextValue === "" ? null : Number(nextValue));
      }}
      className={className}
      style={addonAfter ? undefined : style}
    />
  );

  if (!addonAfter) {
    return input;
  }

  return (
    <div className="flex items-center" style={style}>
      {input}
      <span className="inline-flex h-9 items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
        {addonAfter}
      </span>
    </div>
  );
}

type LegacySelectOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: ReactNode;
};

type SelectProps<T extends string = string> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "defaultValue" | "onChange" | "size"
> & {
  value?: T | T[];
  defaultValue?: T | T[];
  options?: Array<LegacySelectOption<T>>;
  onChange?: (value: any) => void;
  mode?: "multiple";
  placeholder?: string;
  size?: LegacySize;
  showSearch?: boolean;
  optionFilterProp?: string;
};

export function Select<T extends string = string>({
  value,
  defaultValue,
  options = [],
  onChange,
  mode,
  placeholder,
  size: _size,
  disabled,
  style,
  className,
  showSearch: _showSearch,
  optionFilterProp: _optionFilterProp,
  ...props
}: SelectProps<T>) {
  if (mode === "multiple") {
    const currentValue = Array.isArray(value)
      ? value.map(String)
      : Array.isArray(defaultValue)
        ? defaultValue.map(String)
        : [];

    return (
      <div style={style} className={className}>
        <MultiSelect
          id={props.id}
          disabled={disabled}
          placeholder={placeholder}
          value={currentValue}
          onChange={(nextValue) => onChange?.(nextValue)}
          options={options.map((option) => ({
            value: String(option.value),
            label: typeof option.label === "string" ? option.label : String(option.label),
          }))}
        />
      </div>
    );
  }

  const currentValue = value === undefined ? "" : String(value);

  return (
    <div style={style} className={className}>
      <UiSelect
        {...props}
        disabled={disabled}
        value={currentValue}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option
            key={String(option.value)}
            value={String(option.value)}
            disabled={option.disabled}
            title={typeof option.title === "string" ? option.title : undefined}
          >
            {typeof option.label === "string" ? option.label : String(option.label)}
          </option>
        ))}
      </UiSelect>
    </div>
  );
}

type ModalProps = {
  open: boolean;
  title?: ReactNode;
  children?: ReactNode;
  width?: number | string;
  footer?: ReactNode;
  onCancel?: () => void;
  onOk?: () => void | Promise<void>;
  okText?: ReactNode;
  cancelText?: ReactNode;
  confirmLoading?: boolean;
  destroyOnHidden?: boolean;
  rootClassName?: string;
  wrapClassName?: string;
  okButtonProps?: Partial<ButtonProps>;
};

export function Modal({
  open,
  title,
  children,
  width,
  footer,
  onCancel,
  onOk,
  okText = "确定",
  cancelText = "取消",
  confirmLoading,
  rootClassName,
  wrapClassName,
  okButtonProps,
}: ModalProps) {
  const resolvedFooter =
    footer === null
      ? null
      : footer ?? (
          <>
            <Button onClick={onCancel}>{cancelText}</Button>
            <Button
              type="primary"
              onClick={onOk}
              loading={confirmLoading || okButtonProps?.loading}
              danger={okButtonProps?.danger}
              disabled={okButtonProps?.disabled}
            >
              {okText}
            </Button>
          </>
        );

  return (
    <UiModal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel?.();
        }
      }}
      title={title}
      width={width}
      footer={resolvedFooter}
      className={cn(rootClassName, wrapClassName)}
    >
      {children}
    </UiModal>
  );
}

type PopconfirmProps = {
  title: ReactNode;
  description?: ReactNode;
  okText?: string;
  cancelText?: string;
  okButtonProps?: Partial<ButtonProps>;
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
};

export function Popconfirm({
  title,
  description,
  okText = "确认",
  cancelText = "取消",
  okButtonProps,
  onConfirm,
  children,
}: PopconfirmProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    try {
      setLoading(true);
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<{ onClick?: () => void }>, {
        onClick: () => setOpen(true),
      })
    : children;

  return (
    <>
      {trigger}
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title={title}
        width={420}
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={loading}>
              {cancelText}
            </Button>
            <Button
              type="primary"
              danger={okButtonProps?.danger}
              loading={loading || okButtonProps?.loading}
              onClick={handleConfirm}
            >
              {okText}
            </Button>
          </>
        }
      >
        {description}
      </Modal>
    </>
  );
}

export function Space({
  size = 8,
  wrap,
  children,
}: {
  size?: number;
  wrap?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className="inline-flex items-center"
      style={{ gap: size, flexWrap: wrap ? "wrap" : "nowrap" }}
    >
      {children}
    </div>
  );
}

export function Switch({
  size: _size,
  ...props
}: Parameters<typeof UiSwitch>[0] & { size?: LegacySize | "small" }) {
  return <UiSwitch {...props} />;
}

export function Tooltip({ title, children }: { title?: ReactNode; children: ReactNode }) {
  if (isValidElement(children)) {
    return cloneElement(children as ReactElement<{ title?: string }>, {
      title: typeof title === "string" ? title : undefined,
    });
  }

  return <span title={typeof title === "string" ? title : undefined}>{children}</span>;
}

type PaginationProps = {
  current: number;
  pageSize: number;
  total: number;
  showSizeChanger?: boolean;
  pageSizeOptions?: string[];
  onChange?: (page: number, pageSize?: number) => void;
};

export function Pagination({
  current,
  pageSize,
  total,
  showSizeChanger,
  pageSizeOptions = ["20", "50", "100"],
  onChange,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        size="small"
        disabled={current <= 1}
        onClick={() => onChange?.(Math.max(1, current - 1), pageSize)}
      >
        上一页
      </Button>
      <span className="text-sm text-muted-foreground">
        {current} / {pageCount}
      </span>
      <Button
        size="small"
        disabled={current >= pageCount}
        onClick={() => onChange?.(Math.min(pageCount, current + 1), pageSize)}
      >
        下一页
      </Button>
      {showSizeChanger ? (
        <Select
          value={String(pageSize)}
          options={pageSizeOptions.map((option) => ({
            value: option,
            label: `${option} / 页`,
          }))}
          onChange={(nextPageSize) => onChange?.(1, Number(nextPageSize))}
          style={{ width: 120 }}
        />
      ) : null}
    </div>
  );
}
