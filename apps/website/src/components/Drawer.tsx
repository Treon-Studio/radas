"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { clsx as cn } from "clsx"
import { Button } from "./Button"
import { useIcon } from "./IconProvider"

type DrawerDirection = "top" | "bottom" | "left" | "right"

interface DrawerProps {
  /** Whether the drawer is open */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Direction the drawer slides from */
  direction?: DrawerDirection
  /** Snap points for the drawer (e.g., ["148px", "355px", 1]) */
  snapPoints?: (number | string)[]
  /** Active snap point */
  activeSnapPoint?: number | string | null
  /** Callback when snap point changes */
  setActiveSnapPoint?: (snapPoint: number | string | null) => void
  /** Index from which fade should start (only with snapPoints) */
  fadeFromIndex?: number
  /** Whether to snap to sequential points only (no velocity-based skipping) */
  snapToSequentialPoint?: boolean
  /** Whether the drawer is modal (blocks interaction with background) */
  modal?: boolean
  /** Whether to scale the background when open */
  shouldScaleBackground?: boolean
  /** Nested drawer behavior */
  nested?: boolean
  /** Disable drag to close */
  dismissible?: boolean
  /** Children */
  children?: React.ReactNode
}

const Drawer = ({
  shouldScaleBackground = false,
  direction = "right",
  children,
  snapPoints,
  fadeFromIndex,
  ...props
}: DrawerProps) => {
  // Only pass fadeFromIndex when snapPoints is defined (vaul requirement)
  const snapPointsProps = snapPoints ? { snapPoints, fadeFromIndex } : {}

  return (
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground}
      direction={direction}
      {...snapPointsProps}
      {...props}
    >
      {children}
    </DrawerPrimitive.Root>
  )
}
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/30", className)}
    {...props}
  />
))
DrawerOverlay.displayName = "DrawerOverlay"

interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> {
  /** Direction the drawer slides from */
  direction?: DrawerDirection
  /** Show the drag handle indicator */
  showHandle?: boolean
}

const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Content>,
  DrawerContentProps
>(
  (
    { className, children, direction = "right", showHandle = false, ...props },
    ref,
  ) => {
    const isHorizontal = direction === "left" || direction === "right"
    const isVertical = direction === "top" || direction === "bottom"

    return (
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerPrimitive.Content
          ref={ref}
          className={cn(
            "fixed z-50 flex flex-col bg-[var(--color-background)] shadow-lg focus:outline-none",
            "border-[var(--color-border)]",
            // Direction-specific styles
            direction === "right" &&
              "inset-y-0 right-0 h-full w-[95vw] max-w-lg border-l",
            direction === "left" &&
              "inset-y-0 left-0 h-full w-[95vw] max-w-lg border-r",
            direction === "bottom" &&
              "inset-x-0 bottom-0 max-h-[96vh] border-t",
            direction === "top" &&
              "inset-x-0 top-0 max-h-[96vh] border-b",
            className,
          )}
          {...props}
        >
          {showHandle && isVertical && (
            <div
              className={cn(
                "mx-auto h-1.5 w-12 flex-shrink-0 bg-[var(--color-border)]",
                direction === "bottom" ? "mt-4" : "mt-2 mb-4",
              )}
            />
          )}
          {showHandle && isHorizontal && (
            <div
              className={cn(
                "my-auto h-12 w-1.5 flex-shrink-0 bg-[var(--color-border)]",
                direction === "right" ? "ml-2" : "mr-2",
              )}
            />
          )}
          {children}
        </DrawerPrimitive.Content>
      </DrawerPortal>
    )
  },
)
DrawerContent.displayName = "DrawerContent"

interface DrawerHeaderProps extends React.ComponentPropsWithoutRef<"div"> {
  /** Show the close button */
  showCloseButton?: boolean
  /** Custom close icon */
  closeIcon?: React.ReactNode
}

const DrawerHeader = React.forwardRef<HTMLDivElement, DrawerHeaderProps>(
  ({ children, className, showCloseButton = true, closeIcon, ...props }, ref) => {
    const CloseIcon = useIcon("close")

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-start justify-between gap-x-4 border-[var(--color-border)] border-b p-4 sm:p-6",
          className,
        )}
        {...props}
      >
        <div className="flex flex-col gap-y-1">{children}</div>
        {showCloseButton && (
          <DrawerPrimitive.Close asChild>
            <Button
              variant="tertiary"
              className="aspect-square p-1 hover:bg-black/5"
            >
              {closeIcon ?? <CloseIcon className="size-5" aria-hidden="true" />}
            </Button>
          </DrawerPrimitive.Close>
        )}
      </div>
    )
  },
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerBody = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex-1 overflow-y-auto p-4 sm:p-6", className)}
      {...props}
    />
  )
})
DrawerBody.displayName = "DrawerBody"

const DrawerFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col-reverse gap-2 border-[var(--color-border)] border-t p-4 sm:flex-row sm:justify-end sm:p-6",
        className,
      )}
      {...props}
    />
  )
})
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "font-semibold text-[var(--color-text)] text-base",
      className,
    )}
    {...props}
  />
))
DrawerTitle.displayName = "DrawerTitle"

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-[var(--color-text-secondary)] text-sm", className)}
    {...props}
  />
))
DrawerDescription.displayName = "DrawerDescription"

// Handle component for visual drag indicator
const DrawerHandle = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "mx-auto mt-4 h-1.5 w-12 flex-shrink-0 bg-[var(--color-border)]",
      className,
    )}
    {...props}
  />
))
DrawerHandle.displayName = "DrawerHandle"

// Nested drawer support
const DrawerNested = DrawerPrimitive.NestedRoot

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHandle,
  DrawerHeader,
  DrawerNested,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
  type DrawerProps,
  type DrawerContentProps,
  type DrawerDirection,
  type DrawerHeaderProps,
}