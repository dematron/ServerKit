import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Size → Tailwind max-width on >=sm screens. Mobile is always nearly full-width.
const SIZE_CLASS = {
  sm:  'sm:max-w-sm',
  md:  'sm:max-w-lg',
  lg:  'sm:max-w-2xl',
  xl:  'sm:max-w-4xl',
  '2xl': 'sm:max-w-6xl',
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className = '',
  size = 'md',
}) {
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.md;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          'max-h-[90vh] overflow-hidden p-0 flex flex-col gap-0',
          sizeClass,
          className
        )}
      >
        {title && (
          <DialogHeader className="px-6 py-4 pr-12 border-b border-border space-y-0">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {footer && (
          <DialogFooter className="px-6 py-3 border-t border-border bg-card sm:justify-end">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
