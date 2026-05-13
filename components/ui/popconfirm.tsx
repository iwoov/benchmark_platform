"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "./modal";
import { Button } from "./button";

type PopconfirmProps = {
  title: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  children: (open: () => void) => ReactNode;
};

export function Popconfirm({
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  tone = "default",
  onConfirm,
  children,
}: PopconfirmProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {children(() => setOpen(true))}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={typeof description === "string" ? description : undefined}
        width={420}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={loading}>
              {cancelText}
            </Button>
            <Button
              variant={tone === "destructive" ? "destructive" : "default"}
              size="sm"
              loading={loading}
              onClick={handleConfirm}
            >
              {confirmText}
            </Button>
          </>
        }
      >
        {typeof description !== "string" && description}
      </Modal>
    </>
  );
}
