import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const DraggableDialog = DialogPrimitive.Root;

const DraggableDialogTrigger = DialogPrimitive.Trigger;

const DraggableDialogPortal = DialogPrimitive.Portal;

const DraggableDialogClose = DialogPrimitive.Close;

const DraggableDialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DraggableDialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DraggableDialogContent = React.forwardRef(
  ({ className, children, style, ...props }, ref) => {
    const containerRef = React.useRef(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [position, setPosition] = React.useState({ x: 0, y: 0 });
    const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

    const handleMouseDown = (e) => {
      // Only start dragging if clicking directly on drag handle
      if (e.target.closest('.drag-handle') && !e.target.closest('button') && !e.target.closest('input')) {
        setIsDragging(true);
        setDragStart({
          x: e.clientX - position.x,
          y: e.clientY - position.y
        });
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleMouseMove = React.useCallback((e) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
    }, [isDragging, dragStart]);

    const handleMouseUp = React.useCallback(() => {
      setIsDragging(false);
    }, []);

    React.useEffect(() => {
      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // Reset position when dialog opens
    React.useEffect(() => {
      setPosition({ x: 0, y: 0 });
    }, []);

    return (
      <DraggableDialogPortal>
        <DraggableDialogOverlay />
        <DialogPrimitive.Content
          ref={(node) => {
            containerRef.current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 flex flex-col border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
            className
          )}
          style={{
            ...style,
            transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
            cursor: isDragging ? 'grabbing' : 'default'
          }}
          onMouseDown={handleMouseDown}
          {...props}
        >
          {/* Drag Handle */}
          <div 
            className="drag-handle absolute top-0 left-0 right-0 h-6 cursor-grab flex items-center justify-center rounded-t-lg select-none"
            style={{ 
              backgroundColor: 'rgba(100,100,100,0.2)',
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
          >
            <GripHorizontal className="w-4 h-4 opacity-40" />
          </div>
          <div className="pt-2 flex flex-col flex-1 min-h-0 overflow-hidden">
            {children}
          </div>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-10">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DraggableDialogPortal>
    );
  }
);
DraggableDialogContent.displayName = DialogPrimitive.Content.displayName;

const DraggableDialogHeader = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
);
DraggableDialogHeader.displayName = "DraggableDialogHeader";

const DraggableDialogFooter = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DraggableDialogFooter.displayName = "DraggableDialogFooter";

const DraggableDialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DraggableDialogTitle.displayName = DialogPrimitive.Title.displayName;

const DraggableDialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DraggableDialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  DraggableDialog,
  DraggableDialogPortal,
  DraggableDialogOverlay,
  DraggableDialogClose,
  DraggableDialogTrigger,
  DraggableDialogContent,
  DraggableDialogHeader,
  DraggableDialogFooter,
  DraggableDialogTitle,
  DraggableDialogDescription,
};
