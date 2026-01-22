import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Draggable from "react-draggable";
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
    const nodeRef = React.useRef(null);
    const [bounds, setBounds] = React.useState({ left: 0, top: 0, right: 0, bottom: 0 });

    React.useEffect(() => {
      const updateBounds = () => {
        if (nodeRef.current) {
          const rect = nodeRef.current.getBoundingClientRect();
          setBounds({
            left: -rect.left + 10,
            top: -rect.top + 10,
            right: window.innerWidth - rect.right + rect.width - 10,
            bottom: window.innerHeight - rect.bottom + rect.height - 10,
          });
        }
      };
      updateBounds();
      window.addEventListener("resize", updateBounds);
      return () => window.removeEventListener("resize", updateBounds);
    }, []);

    return (
      <DraggableDialogPortal>
        <DraggableDialogOverlay />
        <Draggable handle=".drag-handle" nodeRef={nodeRef} bounds={bounds}>
          <DialogPrimitive.Content
            ref={(node) => {
              nodeRef.current = node;
              if (typeof ref === "function") {
                ref(node);
              } else if (ref) {
                ref.current = node;
              }
            }}
            className={cn(
              "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
              className
            )}
            style={style}
            {...props}
          >
            {/* Drag Handle */}
            <div 
              className="drag-handle absolute top-0 left-0 right-0 h-8 cursor-move flex items-center justify-center"
              style={{ 
                backgroundColor: 'rgba(0,0,0,0.1)', 
                borderTopLeftRadius: 'inherit',
                borderTopRightRadius: 'inherit'
              }}
            >
              <GripHorizontal className="w-5 h-5 opacity-50" />
            </div>
            <div className="pt-4">
              {children}
            </div>
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-10">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </Draggable>
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
