import { useState, useEffect } from 'react';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const iconMap = { danger: AlertTriangle, warning: AlertCircle, info: Info };
const iconColor = { danger: 'text-destructive', warning: 'text-yellow-400', info: 'text-blue-400' };
const iconBg = { danger: 'bg-destructive/10', warning: 'bg-yellow-500/10', info: 'bg-blue-500/10' };

export function ConfirmDialog({
  isOpen,
  title,
  message,
  details,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  requireConfirmation,
  confirmationPlaceholder,
  onConfirm,
  onCancel,
}) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => { if (isOpen) setInputValue(''); }, [isOpen]);

  const Icon = iconMap[variant] || AlertTriangle;
  const isConfirmDisabled = requireConfirmation && inputValue !== requireConfirmation;

    return (
      <AlertDialog open={isOpen} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader className="items-center text-center sm:text-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className={cn(
                'flex size-12 shrink-0 items-center justify-center rounded-full border',
                iconBg[variant] || iconBg.danger,
                iconColor[variant] || 'text-destructive',
                variant === 'danger' && 'border-destructive/20',
                variant === 'warning' && 'border-yellow-500/20',
                variant === 'info' && 'border-blue-500/20'
              )}
            >
              <Icon size={24} />
            </div>
            <div className="min-w-0">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              {message && <AlertDialogDescription className="mt-1.5">{message}</AlertDialogDescription>}
              {details && <p className="text-sm text-muted-foreground mt-1.5">{details}</p>}
            </div>
          </div>
          {requireConfirmation && (
            <div className="space-y-2 mt-2 w-full text-left">
              <Label className="text-muted-foreground">
                Type <strong className="text-foreground">{requireConfirmation}</strong> to confirm:
              </Label>
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isConfirmDisabled && onConfirm()}
                placeholder={confirmationPlaceholder || requireConfirmation}
                autoFocus
              />
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogCancel onClick={onCancel}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            className={cn(variant !== 'danger' && 'bg-primary hover:bg-primary/90')}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDialog;
