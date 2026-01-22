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
    const draggableRef = React.useRef(null);
    const [position, setPosition] = React.useState({ x: 0, y: 0 });

    const handleDrag = (e, data) => {
      setPosition({ x: data.x, y: data.y });
    };

    return (
      <DraggableDialogPortal>
        <DraggableDialogOverlay />
        <Draggable 
          handle=".drag-handle" 
          nodeRef={draggableRef}
          position={position}
          onDrag={handleDrag}
        >
          <div
            ref={draggableRef}
            className="fixed left-[50%] top-[50%] z-50"
            style={{ 
              marginLeft: '-50%',
              marginTop: '-25%'
            }}
          >
            <DialogPrimitive.Content
              ref={ref}
              className={cn(
                "grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:rounded-lg",
                className
              )}
              style={style}
              {...props}
            >
              {/* Drag Handle */}
              <div 
                className="drag-handle absolute top-0 left-0 right-0 h-6 cursor-move flex items-center justify-center rounded-t-lg"
                style={{ 
                  backgroundColor: 'rgba(100,100,100,0.3)'
                }}
              >
                <GripHorizontal className="w-4 h-4 opacity-50" />
              </div>
              <div className="pt-2">
                {children}
              </div>
              <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-10">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </DialogPrimitive.Content>
          </div>
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
