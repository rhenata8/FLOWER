"use client";

import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal";

export interface ConfirmOptions {
  title: string;
  message: string;
  actionText?: string;
  isDanger?: boolean;
  onConfirm: () => Promise<void>;
}

/** Shared confirm-dialog state so every tab asks before destructive actions the same way. */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openConfirm = (next: ConfirmOptions) => {
    setError(null);
    setOptions(next);
  };

  const close = () => {
    setOptions(null);
    setError(null);
  };

  const confirmModal = (
    <ConfirmModal
      isOpen={options !== null}
      title={options?.title ?? ""}
      message={error ? `${options?.message ?? ""}\n\nGagal: ${error}` : (options?.message ?? "")}
      actionText={options?.actionText ?? "Hapus"}
      isDanger={options?.isDanger ?? true}
      isLoading={isLoading}
      onConfirm={async () => {
        if (!options) return;
        setIsLoading(true);
        try {
          await options.onConfirm();
          close();
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan");
        } finally {
          setIsLoading(false);
        }
      }}
      onCancel={close}
    />
  );

  return { openConfirm, confirmModal };
}
