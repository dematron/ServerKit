import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// Size → Tailwind max-width on >=sm screens. Mobile is always full-width.
const SIZE_CLASS = {
  sm:  'sm:max-w-sm',          // 384px
  md:  'sm:max-w-md',          // 448px (default)
  lg:  'sm:max-w-2xl',         // 672px
  xl:  'sm:max-w-4xl',         // 896px
  '2xl': 'sm:max-w-6xl',       // 1152px — large workspaces (QueryRunner, CompareView)
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
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          // Override Sheet's default sm:max-w-md with our explicit size token.
          'p-0 flex flex-col gap-0',
          sizeClass,
          className
        )}
      >
        {title && (
          <SheetHeader className="px-6 py-4 border-b border-border space-y-0">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {footer && (
          <SheetFooter className="px-6 py-3 border-t border-border bg-card sm:justify-end">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
