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
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className={cn('flex-shrink-0 mt-0.5', iconColor[variant] || 'text-destructive')}>
              <Icon size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              {message && <AlertDialogDescription className="mt-1.5">{message}</AlertDialogDescription>}
              {details && <p className="text-sm text-muted-foreground mt-1.5">{details}</p>}
            </div>
          </div>
          {requireConfirmation && (
            <div className="space-y-1.5 mt-2">
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
        <AlertDialogFooter>
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
